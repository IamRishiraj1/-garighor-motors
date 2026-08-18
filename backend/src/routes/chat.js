const express = require("express");
const prisma = require("../lib/prisma");
const { rateLimit } = require("../middleware/rateLimit");

const router = express.Router();

function formatBDT(num) {
  const n = Math.round(Number(num) || 0);
  const str = String(n);
  const last3 = str.slice(-3);
  const rest = str.slice(0, -3);
  const grouped = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3 : last3;
  return "\u09F3" + grouped;
}
function formatKm(num) { return Number(num || 0).toLocaleString("en-US") + " km"; }

// AI_PROVIDER picks which backend powers the chat widget:
//   "gemini"    — Google's free-forever tier (recommended default; no card, no trial expiry)
//   "anthropic" — Claude, if you have API credit set up
const PROVIDER = (process.env.AI_PROVIDER || "gemini").toLowerCase();

async function callAnthropic(system, apiMessages) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
      max_tokens: 1000,
      system,
      messages: apiMessages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errBody}`);
  }
  const data = await response.json();
  const textBlock = (data.content || []).find((b) => b.type === "text");
  return textBlock ? textBlock.text : "Sorry, I couldn't process that just now — please try again.";
}

async function callGemini(system, apiMessages) {
  // Free tier, no card required — get a key at https://aistudio.google.com/apikey
  const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  // Gemini uses "model" instead of "assistant" for the AI's own turns.
  const contents = apiMessages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": process.env.GEMINI_API_KEY,
    },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents,
    }),
  });
  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errBody}`);
  }
  const data = await response.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.map((p) => p.text || "").join("");
  return text || "Sorry, I couldn't process that just now — please try again.";
}

// POST /api/chat — body: { messages: [{ role: "user"|"assistant", text: string }, ...] }
// Public endpoint (the site's chat widget calls it directly), rate-limited since
// every call spends real quota with whichever provider is configured.
router.post("/", rateLimit({ windowMs: 60_000, max: 12 }), async (req, res) => {
  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages must be a non-empty array." });
  }
  if (PROVIDER === "gemini" && !process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "Server is missing GEMINI_API_KEY — the showroom owner needs to set this in .env." });
  }
  if (PROVIDER === "anthropic" && !process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "Server is missing ANTHROPIC_API_KEY — the showroom owner needs to set this in .env." });
  }

  try {
    const cars = await prisma.car.findMany({ orderBy: { createdAt: "desc" } });
    const inventorySummary = cars.map((c) =>
      `${c.stockNo}: ${c.brand} ${c.model} ${c.year}, ${c.bodyType}, ${formatKm(c.mileage)}, ${c.fuel}/${c.transmission}, condition ${c.condition}, auction grade ${c.auctionGrade}, price ${formatBDT(c.price)}, status ${c.status}`
    ).join("\n");

    const leadsCount = await prisma.lead.count();

    const system = `You are the AI assistant embedded on GariGhor Motors' website, a reconditioned car showroom in Chattogram, Bangladesh. Be warm, concise, and helpful (2-5 sentences unless a list is clearer). Only recommend cars that appear in the CURRENT INVENTORY list below — never invent stock numbers or prices. If asked about "my orders" or "order history", explain this is handled via enquiries: a customer submits an enquiry on a car's detail page and the showroom team follows up by phone; there is no online checkout. If a customer asks something you cannot know (like exact accident history not listed), say so honestly and suggest they ask the sales team or request a physical inspection. You can explain reconditioned-car concepts like auction sheet grading (numeric grade 1-5 for exterior/mechanical condition, letter A-E for interior) in plain terms. Keep replies free of markdown headers.

CURRENT INVENTORY:
${inventorySummary}

(There are currently ${leadsCount} customer enquiries in the system — internal context only, do not state this number to the customer unless relevant.)`;

    const apiMessages = messages
      .filter((m) => m && m.text && (m.role === "user" || m.role === "assistant"))
      .map((m) => ({ role: m.role, content: String(m.text).slice(0, 4000) }));

    const reply = PROVIDER === "anthropic"
      ? await callAnthropic(system, apiMessages)
      : await callGemini(system, apiMessages);

    res.json({ reply });
  } catch (e) {
    console.error(`${PROVIDER} chat error:`, e.message);
    res.status(502).json({ error: "The AI assistant is temporarily unavailable. Please try again shortly." });
  }
});

module.exports = router;
