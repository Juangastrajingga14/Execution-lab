export async function onRequestGet(context) {
  const API_KEY = context.env.FINNHUB_API_KEY;

  if (!API_KEY) {
    return new Response(
      JSON.stringify({ error: "API key belum dipasang" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  try {
    const response = await fetch(
      `https://finnhub.io/api/v1/news?category=general&token=${API_KEY}`
    );

    if (!response.ok) {
      throw new Error("Gagal mengambil berita dari Finnhub");
    }

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300"
      }
    });

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}

