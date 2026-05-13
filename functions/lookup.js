export async function onRequest(context) {
  const { searchParams } = new URL(context.request.url);
  const keyword = searchParams.get('keyword');
  const apiKey = context.env.GEMINI_API_KEY || context.env.GOOGLE_API_KEY;

  if (!keyword) {
    return new Response(JSON.stringify({ error: "Thiếu từ khóa tra cứu." }), { status: 400 });
  }

  if (!apiKey) {
    return new Response(JSON.stringify({ 
      error: "Chưa cấu hình API Key.",
      tip: "Bạn cần vào Dashboard Cloudflare Pages > Settings > Environment Variables và thêm GEMINI_API_KEY hoặc GOOGLE_API_KEY."
    }), { status: 500 });
  }

  const prompt = `Bạn là từ điển Nhật-Việt chuyên nghiệp, am hiểu sâu về Hán tự (Kanji). 
Tra cứu từ: "${keyword}". 
Trả về kết quả dưới dạng HTML (không markdown, không bọc thẻ code) với các class sau:
- <div class="dict-header"><span class="word">Từ</span> <span class="furigana">Cách đọc</span></div>
- <div class="meaning">Nghĩa chính</div>
- <div class="kanji-info">
    <div class="kanji-item">
      <div class="kanji-canvas" data-char="Chữ Hán"></div>
      <div class="kanji-details">Hán Việt: ... <br> Nghĩa: ...</div>
    </div>
  </div>
- <div class="example-box">Câu tiếng Nhật <br> Nghĩa tiếng Việt</div>
YÊU CẦU QUAN TRỌNG: Với mỗi chữ Hán trong từ, điền chính xác chữ Hán đó vào thuộc tính data-char của div class kanji-canvas.`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const finalHtml = text.replace(/```html|```/g, "").trim();

    return new Response(JSON.stringify({ html: finalHtml }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
