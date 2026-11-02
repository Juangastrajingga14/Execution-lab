const json = (data, status = 200) =>
  Response.json(data, { status });

async function digestToken(token) {
  const result = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  );
  return Array.from(new Uint8Array(result), b =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

function getToken(request) {
  const cookie = request.headers.get("Cookie") || "";
  const item = cookie.split(";").find(x =>
    x.trim().startsWith("el_session=")
  );
  return item ? decodeURIComponent(item.trim().slice(11)) : null;
}

async function getUser(request, env) {
  const token = getToken(request);
  if (!token) return null;

  const tokenHash = await digestToken(token);

  return await env.DB.prepare(`
    SELECT users.id
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ?
    AND julianday(sessions.expires_at) > julianday('now')
  `).bind(tokenHash).first();
}

export async function onRequestGet({ request, env }) {
  try {
    if (!env.DB) return json({ error: "Database tidak terhubung" }, 500);

    const user = await getUser(request, env);
    if (!user) return json({ error: "Silakan login" }, 401);

    const result = await env.DB.prepare(
      "SELECT data FROM trades WHERE user_id = ? ORDER BY id ASC"
    ).bind(user.id).all();

    const trades = (result.results || []).map(row => JSON.parse(row.data));

    return json({ success: true, trades });
  } catch (error) {
    console.error("TRADES GET ERROR:", error);
    return json({ error: "Gagal mengambil data trade" }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.DB) return json({ error: "Database tidak terhubung" }, 500);

    const user = await getUser(request, env);
    if (!user) return json({ error: "Silakan login" }, 401);

    const body = await request.json();

    if (body.action === "upsert") {
      const trade = body.trade;

      if (!trade || !Number.isSafeInteger(Number(trade.id))) {
        return json({ error: "ID trade tidak valid" }, 400);
      }

      const data = JSON.stringify(trade);
      if (data.length > 900000) {
        return json({ error: "Data trade terlalu besar" }, 413);
      }

      await env.DB.prepare(`
        INSERT INTO trades (id, user_id, data)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id, id)
        DO UPDATE SET data = excluded.data,
          updated_at = CURRENT_TIMESTAMP
      `).bind(Number(trade.id), user.id, data).run();

      return json({ success: true });
    }

    if (body.action === "delete") {
      const id = Number(body.id);
      if (!Number.isSafeInteger(id)) {
        return json({ error: "ID trade tidak valid" }, 400);
      }

      await env.DB.prepare(
        "DELETE FROM trades WHERE user_id = ? AND id = ?"
      ).bind(user.id, id).run();

      return json({ success: true });
    }

    return json({ error: "Action tidak valid" }, 400);
  } catch (error) {
    console.error("TRADES POST ERROR:", error);
    return json({ error: "Gagal menyimpan trade" }, 500);
  }
}
