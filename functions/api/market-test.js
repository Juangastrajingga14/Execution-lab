export async function onRequestGet(context) {
  const API_KEY = context.env.FINNHUB_API_KEY;

  if (!API_KEY) {
    return Response.json({ error: "FINNHUB_API_KEY belum terpasang" });
  }

  const symbols = {
    GOLD: "OANDA:XAU_USD",
    DXY: "TVC:DXY",
    BTC: "BINANCE:BTCUSDT",
    WTI: "OANDA:WTICO_USD"
  };

  const results = {};

  for (const [name, symbol] of Object.entries(symbols)) {
    try {
      const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${API_KEY}`;
      const response = await fetch(url);
      const data = await response.json();

      results[name] = {
        symbol,
        status: response.status,
        data
      };
    } catch (error) {
      results[name] = {
        symbol,
        error: error.message
      };
    }
  }

try {
  const goldResponse = await fetch("https://api.gold-api.com/price/XAU");
  const goldData = await goldResponse.json();

  results.GOLD = {
    symbol: "XAU",
    status: goldResponse.status,
    data: { c: goldData.price }
  };
} catch (error) {
  results.GOLD = {
    symbol: "XAU",
    status: 500,
    error: error.message
  };
  return Response.json(results, {
    headers: { "Cache-Control": "no-store" }
  });
}
