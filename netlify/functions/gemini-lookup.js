// netlify/functions/gemini-lookup.js
export default async (req) => {
  try {
    const url = new URL(req.url);
    const word = (url.searchParams.get("word") || "").trim();

    if (!word) {
      return new Response(JSON.stringify({ error: "Missing word" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Server missing GEMINI_API_KEY" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    const endpoint =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

    const prompt = `
你是英文學習助教。請針對單字 "${word}" 產生「可編輯草稿」資料，請只輸出 JSON（不要多任何文字），格式如下：
{
  "zh": "繁體中文解釋（簡短、自然）",
  "pos": "詞性（noun/verb/adj/adv/prep/conj/pron/interj 等）",
  "prepositions": ["常見搭配介係詞或片語（若沒有就空陣列）"],
  "example": "一個簡短英文例句（自然、常用）"
}
規則：
- zh 請用繁體中文
- pos 只填一個最常見的
- example 不要太長
- prepositions 可填像 accountable for / interested in 這類
`;

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 300 },
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return new Response(JSON.stringify({ error: "Gemini request failed", detail: text }), {
        status: 502,
        headers: { "content-type": "application/json" },
      });
    }

    const data = await resp.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const jsonText = raw.trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON from Gemini", raw }), {
        status: 502,
        headers: { "content-type": "application/json" },
      });
    }

    const result = {
      zh: (parsed.zh || "").toString(),
      pos: (parsed.pos || "").toString(),
      example: (parsed.example || "").toString(),
      prepositions: Array.isArray(parsed.prepositions) ? parsed.prepositions.map(String) : [],
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};
