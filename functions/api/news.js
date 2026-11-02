export async function onRequestGet(context) {
  const API_KEY = context.env.FINNHUB_API_KEY;

  if (!API_KEY) {
    return Response.json(
      { error: "API key belum dipasang" },
      { status: 500 }
    );
  }

  try {
    const categories = ["general", "forex", "crypto"];

    const results = await Promise.all(
      categories.map(async (category) => {
        const response = await fetch(
          `https://finnhub.io/api/v1/news?category=${category}&token=${API_KEY}`
        );

        if (!response.ok) {
          throw new Error(`Finnhub ${category}: HTTP ${response.status}`);
        }

        const data = await response.json();

        return data.slice(0, 10).map(news => ({
          ...news,
          marketCategory:
            category === "general"
              ? "GENERAL"
              : category.toUpperCase()
        }));
      })
    );

    const unique = new Map();

    results.flat().forEach(news => {
      unique.set(news.id || news.url, news);
    });

    const combined = [...unique.values()]
      .sort((a, b) => b.datetime - a.datetime);

    const translated = await Promise.all(
      combined.map(async news => {
        const [headline, summary] = await Promise.all([
          translate(news.headline),
          translate(news.summary)
        ]);

        return { ...news, headline, summary };
      })
    );

    return Response.json(translated, {
      headers: {
        "Cache-Control": "public, max-age=300"
      }
    });

  } catch (error) {
    console.error("NEWS ERROR:", error);

    return Response.json(
      { error: error.message || String(error) },
      { status: 500 }
    );
  }
}

async function translate(text) {
  if (!text) return text;

  try {
    const response = await fetch(
      "https://api.mymemory.translated.net/get?q=" +
      encodeURIComponent(text.slice(0, 450)) +
      "&langpair=en|id"
    );

    if (!response.ok) return text;

    const result = await response.json();

    return result.responseStatus === 200
      ? result.responseData?.translatedText || text
      : text;

  } catch (error) {
    console.error("Translation error:", error);
    return text;
  }
}
