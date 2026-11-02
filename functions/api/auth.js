const ITERATIONS = 310000;
const SESSION_DAYS = 7;

const json = (data, status = 200, headers = {}) =>
  Response.json(data, { status, headers });

const hex = bytes =>
  Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");

const unhex = str =>
  new Uint8Array(str.match(/.{2}/g).map(x => parseInt(x, 16)));

async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: ITERATIONS,
      hash: "SHA-256"
    },
    key,
    256
  );

  return hex(new Uint8Array(bits));
}

async function createPasswordHash(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await hashPassword(password, salt);

  return `pbkdf2$${ITERATIONS}$${hex(salt)}$${hash}`;
}

async function verifyPassword(password, stored) {
  try {
    const [algorithm, iterations, saltHex, storedHash] =
      stored.split("$");

    if (algorithm !== "pbkdf2") return false;

    const salt = unhex(saltHex);

    const hash = await hashPasswordWithIterations(
      password,
      salt,
      Number(iterations)
    );

    if (hash.length !== storedHash.length) return false;

    let diff = 0;

    for (let i = 0; i < hash.length; i++) {
      diff |= hash.charCodeAt(i) ^ storedHash.charCodeAt(i);
    }

    return diff === 0;
  } catch {
    return false;
  }
}

async function hashPasswordWithIterations(password, salt, iterations) {
  if (!Number.isInteger(iterations) || iterations < 100000 || iterations > 500000) {
    throw new Error("Invalid password hash");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256"
    },
    key,
    256
  );

  return hex(new Uint8Array(bits));
}

async function digestToken(token) {
  const result = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  );

  return hex(new Uint8Array(result));
}

function getToken(request) {
  const cookie = request.headers.get("Cookie") || "";

  const item = cookie.split(";").find(x =>
    x.trim().startsWith("el_session=")
  );

  return item ? decodeURIComponent(item.trim().slice(11)) : null;
}

function sessionCookie(token) {
  return `el_session=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_DAYS * 86400}`;
}

function clearCookie() {
  return "el_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0";
}

async function createSession(env, userId) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await digestToken(token);

  const expires = new Date(
    Date.now() + SESSION_DAYS * 86400000
  ).toISOString();

  await env.DB.prepare(
    "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)"
  ).bind(userId, tokenHash, expires).run();

  return token;
}

async function getSession(request, env) {
  const token = getToken(request);

  if (!token) return null;

  const tokenHash = await digestToken(token);

  const session = await env.DB.prepare(`
    SELECT users.id, users.username, users.email, sessions.id AS session_id
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ?
    AND julianday(sessions.expires_at) > julianday('now')
  `).bind(tokenHash).first();

  return session || null;
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.DB) {
      return json({ error: "Database not connected" }, 500);
    }

    const data = await request.json();
    const action = data.action;

    if (action === "register") {
      const username = String(data.username || "").trim();
      const email = String(data.email || "").trim().toLowerCase();
      const password = String(data.password || "");

      if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
        return json({ error: "Username 3-24 karakter, gunakan huruf, angka atau underscore" }, 400);
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
        return json({ error: "Email tidak valid" }, 400);
      }

      if (password.length < 8 || password.length > 128) {
        return json({ error: "Password harus 8-128 karakter" }, 400);
      }

      const existing = await env.DB.prepare(
        "SELECT id FROM users WHERE email = ? OR username = ?"
      ).bind(email, username).first();

      if (existing) {
        return json({ error: "Username atau email sudah digunakan" }, 409);
      }

      const passwordHash = await createPasswordHash(password);

      await env.DB.prepare(
        "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)"
      ).bind(username, email, passwordHash).run();

      return json({
        success: true,
        message: "Registrasi berhasil"
      });
    }

    if (action === "login") {
      const email = String(data.email || "").trim().toLowerCase();
      const password = String(data.password || "");

      if (!email || !password || password.length > 128) {
        return json({ error: "Email atau password salah" }, 401);
      }

      const user = await env.DB.prepare(
        "SELECT id, username, email, password_hash FROM users WHERE email = ?"
      ).bind(email).first();

      if (!user || !await verifyPassword(password, user.password_hash)) {
        return json({ error: "Email atau password salah" }, 401);
      }

      const token = await createSession(env, user.id);

      return json({
        success: true,
        message: "Login berhasil",
        user: {
          id: user.id,
          username: user.username,
          email: user.email
        }
      }, 200, {
        "Set-Cookie": sessionCookie(token)
      });
    }

    if (action === "me") {
      const user = await getSession(request, env);

      if (!user) {
        return json({ authenticated: false });
      }

      return json({
        authenticated: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email
        }
      });
    }

    if (action === "logout") {
      const user = await getSession(request, env);

      if (user) {
        await env.DB.prepare(
          "DELETE FROM sessions WHERE id = ?"
        ).bind(user.session_id).run();
      }

      return json({
        success: true,
        message: "Logout berhasil"
      }, 200, {
        "Set-Cookie": clearCookie()
      });
    }

    return json({ error: "Action tidak valid" }, 400);

    } catch (error) {
    console.error("AUTH ERROR:", error);
    return json({ error: error.message || String(error) }, 500);
  }
}
