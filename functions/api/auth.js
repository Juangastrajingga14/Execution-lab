export async function onRequestPost({ request, env }) {
try {
if (!env.DB) {
return Response.json({ error: "Database not connected" }, { status: 500 });
}

const { action, username, email, password } = await request.json();

if (!password || password.length < 8) {
  return Response.json(
    { error: "Password minimal 8 karakter" },
    { status: 400 }
  );
}

if (action === "register") {
  if (!username || !email) {
    return Response.json(
      { error: "Username dan email wajib diisi" },
      { status: 400 }
    );
  }

  const existing = await env.DB.prepare(
    "SELECT id FROM users WHERE email = ? OR username = ?"
  ).bind(email.toLowerCase(), username).first();

  if (existing) {
    return Response.json(
      { error: "Username atau email sudah digunakan" },
      { status: 409 }
    );
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const passwordData = new TextEncoder().encode(password);
  const combined = new Uint8Array(salt.length + passwordData.length);

  combined.set(salt);
  combined.set(passwordData, salt.length);

  const hash = await crypto.subtle.digest("SHA-256", combined);

  const toHex = bytes =>
    Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");

  const passwordHash = `${toHex(salt)}:${toHex(new Uint8Array(hash))}`;

  await env.DB.prepare(
    "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)"
  ).bind(username, email.toLowerCase(), passwordHash).run();

  return Response.json({
    success: true,
    message: "Registrasi berhasil"
  });
}

if (action === "login") {
  const user = await env.DB.prepare(
    "SELECT id, username, email, password_hash FROM users WHERE email = ?"
  ).bind(email?.toLowerCase()).first();

  if (!user) {
    return Response.json(
      { error: "Email atau password salah" },
      { status: 401 }
    );
  }

  const [saltHex, storedHash] = user.password_hash.split(":");

  const salt = new Uint8Array(
    saltHex.match(/.{2}/g).map(byte => parseInt(byte, 16))
  );

  const passwordData = new TextEncoder().encode(password);
  const combined = new Uint8Array(salt.length + passwordData.length);

  combined.set(salt);
  combined.set(passwordData, salt.length);

  const hash = await crypto.subtle.digest("SHA-256", combined);

  const toHex = bytes =>
    Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");

  if (toHex(new Uint8Array(hash)) !== storedHash) {
    return Response.json(
      { error: "Email atau password salah" },
      { status: 401 }
    );
  }

  return Response.json({
    success: true,
    message: "Login berhasil",
    user: {
      id: user.id,
      username: user.username,
      email: user.email
    }
  });
}

return Response.json(
  { error: "Action tidak valid" },
  { status: 400 }
);

} catch (error) {
return Response.json(
{ error: "Terjadi kesalahan server" },
{ status: 500 }
);
}
}
