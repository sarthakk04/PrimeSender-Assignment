import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Groq from "groq-sdk";

dotenv.config();
const PORT = process.env.PORT || 3000;
const app = express();
app.use(cors());
app.use(express.json({ limit: "200kb" }));

// Initialize Groq client
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

function promptForTone(tone, text) {
  if (tone === "formal") {
    return `Rewrite the following text in a formal, professional tone suitable for business/academic use. Keep it upto the mark dont extend it unecessarily and dont add double quotes
Return ONLY the rewritten text, with no explanations or extra words:

"${text}"`;
  } else if (tone === "humorous") {
    return `Rewrite the following text in a light, witty, humorous tone. Keep it upto the mark dont extend it unecessarily and dont add double quotes
Return ONLY the rewritten text:

"${text}"`;
  } else if (tone === "concise") {
    return `Rewrite the following text as concisely as possible while preserving meaning. Keep it upto the mark dont extend it unecessarily and dont add double quotes
Return ONLY the rewritten text:

"${text}"`;
  } else {
    return `Rewrite the following text preserving meaning. Keep it upto the mark dont extend it unecessarily and dont add double quotes
Return ONLY the rewritten text:

"${text}"`;
  }
}

app.post("/api/paraphrase", async (req, res) => {
  const { text, tone } = req.body;
  if (!text) return res.status(400).json({ error: "text required" });

  const prompt = promptForTone(tone, text);

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.7,
      max_tokens: 1024,
      stream: false,
    });

    const rewrittenText =
      completion.choices[0]?.message?.content || "No response generated";
    res.json({ text: rewrittenText });
  } catch (err) {
    console.error("Groq API error", err);
    res.status(500).json({ error: "AI generation failed: " + err.message });
  }
});

app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
