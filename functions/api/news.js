
export async function onRequestGet(context) {
  const API_KEY = context.env.FINNHUB_API_KEY;

  if (!API_KEY) {
    return Response.json(
      { error: "API key belum dipasang" },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(
      `https://finnhub.io/api/v1/news?category=general&token=${API_KEY}`
    );

    if (!response.ok) {
      throw new Error("Gagal mengambil berita");
    }

    const data = await response.json();

    const translated = await Promise.all(
      data.slice(0, 15).map(async (news) => {
        try {
          const title = await translate(news.headline);
          const summary = await translate(news.summary);

          return {
            ...news,
            headline: title,
            summary: summary
          };
        } catch {
          return news;
        }
      })
    );

    return Response.json(translated, {
      headers: {
        "Cache-Control": "public, max-age=300"
      }
    });

  } catch (error) {
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

async function translate(text) {
  if (!text) return text;

  const url =
    "https://api.mymemory.translated.net/get?q=" +
    encodeURIComponent(text) +
    "&langpair=en|id";

  const response = await fetch(url);
  const result = await response.json();

  if (result.responseStatus !== 200) {
    return text;
  }

  return result.responseData.translatedText || text;
}
