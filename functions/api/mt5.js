async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

export async function onRequest(context) {
  const { request, env } = context;

  try {
    if (!env.DB) return json({ error: "Database tidak tersedia" }, 500);

    const cookie = request.headers.get("Cookie") || "";
    const match = cookie.match(/(?:^|;\s*)el_session=([^;]+)/);

    if (!match) return json({ error: "Silakan login terlebih dahulu" }, 401);

    const tokenHash = await sha256(decodeURIComponent(match[1]));

    const session = await env.DB.prepare(`
      SELECT user_id
      FROM sessions
      WHERE token_hash = ?
      AND expires_at > CURRENT_TIMESTAMP
    `).bind(tokenHash).first();

    if (!session) return json({ error: "Sesi tidak valid" }, 401);

    if (request.method === "GET") {
      const result = await env.DB.prepare(`
        SELECT *
        FROM mt5_trades
        WHERE user_id = ?
        ORDER BY closed_at DESC
      `).bind(session.user_id).all();

      return json({ success: true, trades: result.results || [] });
    }

    if (request.method === "POST") {
      const body = await request.json();

      if (!Array.isArray(body.trades)) {
        return json({ error: "Format trades harus berupa array" }, 400);
      }

      let imported = 0;

      for (const trade of body.trades) {
        if (!trade.ticket || !trade.symbol) continue;

        await env.DB.prepare(`
          INSERT INTO mt5_trades (
            user_id, account_key, ticket, symbol, side, volume,
            open_price, close_price, stop_loss, take_profit,
            profit, commission, swap, opened_at, closed_at, raw_data
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id, account_key, ticket)
          DO UPDATE SET
            symbol = excluded.symbol,
            side = excluded.side,
            volume = excluded.volume,
            open_price = excluded.open_price,
            close_price = excluded.close_price,
            stop_loss = excluded.stop_loss,
            take_profit = excluded.take_profit,
            profit = excluded.profit,
            commission = excluded.commission,
            swap = excluded.swap,
            opened_at = excluded.opened_at,
            closed_at = excluded.closed_at,
            raw_data = excluded.raw_data,
            updated_at = CURRENT_TIMESTAMP
        `).bind(
          session.user_id,
          String(trade.account_key || "default"),
          String(trade.ticket),
          String(trade.symbol),
          trade.side || null,
          Number(trade.volume) || 0,
          Number(trade.open_price) || 0,
          Number(trade.close_price) || 0,
          Number(trade.stop_loss) || 0,
          Number(trade.take_profit) || 0,
          Number(trade.profit) || 0,
          Number(trade.commission) || 0,
          Number(trade.swap) || 0,
          trade.opened_at || null,
          trade.closed_at || null,
          JSON.stringify(trade)
        ).run();

        imported++;
      }

      return json({ success: true, imported });
    }

    return json({ error: "Method tidak didukung" }, 405);

  } catch (error) {
    console.error("MT5 API error:", error);
    return json({ error: "Terjadi kesalahan server" }, 500);
  }
}

