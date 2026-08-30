const express = require("express");
const cors = require("cors");
const multer = require("multer");
require("dotenv").config();

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });

app.use(cors({ origin: true }));
app.use(express.json({ limit: "2mb" }));

app.get("/health", (req, res) => {
  res.json({ ok: true, app: "Vyapar AI Backend", time: new Date().toISOString() });
});

app.post("/extractBill", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    // Keep API key only on server. Never put API keys inside Android/WebView code.
    // This template returns safe demo JSON if AI key is not configured.
    if (!process.env.OPENAI_API_KEY) {
      return res.json({
        sales: [],
        monthlyProfits: [],
        stocks: [],
        note: "AI key not configured. Add OPENAI_API_KEY on server to enable extraction."
      });
    }

    const OpenAI = require("openai");
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const base64 = req.file.buffer.toString("base64");
    const mime = req.file.mimetype || "application/octet-stream";

    const prompt = `Read this business bill/photo/PDF and return only JSON in this shape:
{
  "sales":[{"date":"YYYY-MM-DD","product":"string","category":"string","purchasePrice":0,"sellingPrice":0,"quantity":1}],
  "monthlyProfits":[{"month":"YYYY-MM","profit":0}],
  "stocks":[{"item":"string","qty":0,"min":5}]
}
If unsure, return empty arrays.`;

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_file", filename: req.file.originalname || "upload", file_data: `data:${mime};base64,${base64}` }
          ]
        }
      ]
    });

    const text = response.output_text || "{}";
    const clean = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    const data = JSON.parse(clean);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "AI extraction failed" });
  }
});



app.post("/verifyBilling", async (req, res) => {
  // Add Google Play / Razorpay verification here.
  // Return { active:true, plan:"pro" } after server-side verification.
  res.json({ active: false, plan: "free", note: "Billing verification not configured" });
});

exports.app = app;
