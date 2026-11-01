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

    if (!response.ok) throw new Error("Gagal mengambil berita");

    const data = await response.json();

    const translated = await Promise.all(
      data.slice(0, 15).map(async (news) => {
        const [headline, summary] = await Promise.all([
          translate(news.headline),
          translate(news.summary)
        ]);

        return { ...news, headline, summary };
      })
    );

    return Response.json(translated, {
      headers: { "Cache-Control": "public, max-age=300" }
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

  try {
    const response = await fetch(
      "https://api.mymemory.translated.net/get?q=" +
      encodeURIComponent(text.slice(0, 450)) +
      "&langpair=en|id"
    );

    if (!response.ok) {
  console.error("MyMemory HTTP:", response.status);
  return text;
}

    const result = await response.json();
if (result.responseStatus !== 200) {
  console.error("MyMemory API:", result.responseStatus, result.responseDetails);
}

    return result.responseStatus === 200
      ? result.responseData?.translatedText || text
      : text;

  } catch (error) {
    console.error("Translation error:", error);
    return text;
  }
}
