import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Dictionary lookup endpoint
  app.get("/lookup", async (req, res) => {
    const keyword = req.query.keyword as string;
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (!keyword) {
      return res.status(400).json({ error: "Thiếu từ khóa tra cứu." });
    }

    if (!apiKey) {
      return res.status(500).json({ error: "Chưa cấu hình API Key trong Secrets." });
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      
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

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt
      });
      
      const text = response.text;
      const finalHtml = text.replace(/```html|```/g, "").trim();

      res.json({ html: finalHtml });
    } catch (error: any) {
      console.error("AI Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Serve static files from 'public' if they exist
  app.use(express.static(path.join(process.cwd(), "public")));

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
