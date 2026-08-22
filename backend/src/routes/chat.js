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
//   "gemini"    — Google's free-forever tier. Structured JSON lead-capture (below) only runs on this path.
//   "anthropic" — Claude, plain-text replies only. Kept as a fallback; not wired into lead capture,
//                 since you're not currently using this path in production.
const PROVIDER = (process.env.AI_PROVIDER || "gemini").toLowerCase();

const PERSONA = `You are "GariGhor Desk AI," the professional, enthusiastic, sales-focused front-desk assistant for GariGhor Motors, a reconditioned car showroom in Chattogram, Bangladesh. Your goal is to help visitors browse inventory and actively guide serious buyers toward booking a test drive or speaking with a human sales rep.

RULES:
1. INVENTORY AWARENESS: Only discuss vehicles in the CURRENT INVENTORY list below. If someone asks about a model that isn't listed, say so politely and suggest the closest real match from actual stock.
2. NEVER INVENT NUMBERS: Prices, mileage, and auction grades must come directly from CURRENT INVENTORY. Never guess or make one up.
3. CONVERSION FOCUS: Every couple of replies, gently nudge toward booking a test drive or talking to a sales rep — but don't be pushy about it.
4. TONE: Warm, concise, genuinely enthusiastic about cars. Keep replies to 2-4 sentences — most visitors are on their phone.

BOOKING A TEST DRIVE — collect these one at a time, in conversation, don't demand them all in one message:
  Step 1: Confirm the exact car (match it to a real stock number from CURRENT INVENTORY).
  Step 2: Ask their preferred date and time.
  Step 3: Ask their name and a phone number or email.
Only set triggerBooking to true once you actually have ALL FOUR of: the car, a name, a phone/email, and a date/time — not before. If anything is still missing, keep triggerBooking false and keep asking.

FINANCING QUESTIONS: If someone asks about installments/EMI/financing and states a specific down payment amount they have in mind, fill in financingRequest with the car's stock number and that down payment as a plain number. Do not calculate or state a monthly payment yourself — the actual number is computed separately from real data and added to the reply automatically. Just acknowledge you're checking on it.

Never use markdown headers. If asked about "order history", explain there's no online checkout — enquiries and test drives are handled by the showroom team directly, though test drive bookings made here in chat are real and do get logged for the team to follow up on.`;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    replyToUser: { type: "STRING", description: "The conversational reply to show the customer, 2-4 sentences." },
    triggerBooking: { type: "BOOLEAN", description: "True ONLY once car, name, phone/email, AND date/time have all been collected in this conversation." },
    bookingDetails: {
      type: "OBJECT",
      properties: {
        customerName: { type: "STRING" },
        contactInfo: { type: "STRING", description: "Whatever phone number or email the customer gave." },
        appointmentDateTime: { type: "STRING", description: "The customer's preferred date/time, in their own words." },
        vehicleStockNo: { type: "STRING", description: "The exact stock number from CURRENT INVENTORY, e.g. GGM-1042." },
      },
    },
    financingRequest: {
      type: "OBJECT",
      description: "Only present if the customer asked about financing and gave a specific down payment amount.",
      properties: {
        vehicleStockNo: { type: "STRING" },
        downPayment: { type: "NUMBER", description: "Down payment in BDT as a plain number, no currency symbol or commas." },
      },
    },
  },
  required: ["replyToUser", "triggerBooking"],
};

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

// Structured-output Gemini call — forces JSON matching RESPONSE_SCHEMA on every turn,
// instead of loosely hoping the model mentions a phone number somewhere in free text.
async function callGeminiStructured(system, apiMessages) {
  const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

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
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errBody}`);
  }

  const data = await response.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const rawText = parts.map((p) => p.text || "").join("");

  try {
    return JSON.parse(rawText);
  } catch (e) {
    // With responseSchema this should be rare, but never let a parse failure become a
    // dead end for the customer — fall back to showing whatever text came back.
    console.error("Gemini returned non-JSON despite responseSchema:", rawText.slice(0, 300));
    return { replyToUser: rawText || "Sorry, I couldn't process that just now — please try again.", triggerBooking: false };
  }
}

// Saves a real Lead row the moment the model reports all four required fields are in
// hand. Resolves the AI's stock-number text against real inventory rather than trusting
// it blindly — if it doesn't match anything real, the lead is still saved (never silently
// drop a genuine customer over a matching miss), just without a car attached.
async function captureBookingLead(bookingDetails, cars) {
  const { customerName, contactInfo, appointmentDateTime, vehicleStockNo } = bookingDetails || {};
  if (!customerName || !contactInfo) return null; // guard against a malformed/partial trigger

  const matchedCar = vehicleStockNo
    ? cars.find((c) => c.stockNo.toLowerCase() === String(vehicleStockNo).toLowerCase())
    : null;

  const messageParts = ["AI-captured test drive request."];
  if (matchedCar) messageParts.push(`Vehicle: ${matchedCar.brand} ${matchedCar.model} (${matchedCar.stockNo}).`);
  else if (vehicleStockNo) messageParts.push(`Vehicle mentioned: "${vehicleStockNo}" (not matched to a stock number — check manually).`);
  messageParts.push(`Preferred time: ${appointmentDateTime || "not specified"}.`);

  try {
    return await prisma.lead.create({
      data: {
        carId: matchedCar ? matchedCar.id : null,
        name: customerName,
        phone: contactInfo,
        email: contactInfo.includes("@") ? contactInfo : null,
        message: messageParts.join(" "),
        type: "testdrive",
        source: "ai",
      },
    });
  } catch (e) {
    console.error("Failed to save AI-captured lead:", e.message);
    return null; // don't let a DB hiccup break the customer's chat reply
  }
}

// Computes an ESTIMATE using real car price data — the model is explicitly told not to
// state a monthly payment itself (rule: never invent numbers). Rate/term below are
// placeholders; swap in GariGhor's real financing partner terms before relying on this.
const FINANCING_ANNUAL_RATE = 0.12;
const FINANCING_TERM_MONTHS = 36;

function appendFinancingEstimate(replyText, financingRequest, cars) {
  const { vehicleStockNo, downPayment } = financingRequest || {};
  const car = vehicleStockNo ? cars.find((c) => c.stockNo.toLowerCase() === String(vehicleStockNo).toLowerCase()) : null;
  if (!car || typeof downPayment !== "number" || downPayment <= 0) return replyText;

  const principal = Math.max(car.price - downPayment, 0);
  const monthlyRate = FINANCING_ANNUAL_RATE / 12;
  const monthlyPayment = principal > 0
    ? (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -FINANCING_TERM_MONTHS))
    : 0;

  const note = `\n\n(Estimate for the ${car.brand} ${car.model}: with ${formatBDT(downPayment)} down on a ${formatBDT(car.price)} price, the remaining ${formatBDT(principal)} works out to roughly ${formatBDT(Math.round(monthlyPayment))}/month over ${FINANCING_TERM_MONTHS} months at an example ${(FINANCING_ANNUAL_RATE * 100).toFixed(0)}% annual rate — actual terms depend on your bank or financing partner.)`;
  return replyText + note;
}

// POST /api/chat — body: { messages: [{ role: "user"|"assistant", text: string }, ...] }
router.post("/", rateLimit({ windowMs: 60_000, max: 12 }), async (req, res) => {
  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages must be a non-empty array." });
  }
  if (PROVIDER === "gemini" && !process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "Server is missing GEMINI_API_KEY." });
  }
  if (PROVIDER === "anthropic" && !process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "Server is missing ANTHROPIC_API_KEY." });
  }

  try {
    const cars = await prisma.car.findMany({ orderBy: { createdAt: "desc" } });
    const inventorySummary = cars.map((c) =>
      `${c.stockNo}: ${c.brand} ${c.model} ${c.year}, ${c.bodyType}, ${formatKm(c.mileage)}, ${c.fuel}/${c.transmission}, condition ${c.condition}, auction grade ${c.auctionGrade}, price ${formatBDT(c.price)}, status ${c.status}`
    ).join("\n");

    const system = `${PERSONA}\n\nCURRENT INVENTORY:\n${inventorySummary}`;

    const apiMessages = messages
      .filter((m) => m && m.text && (m.role === "user" || m.role === "assistant"))
      .map((m) => ({ role: m.role, content: String(m.text).slice(0, 4000) }));

    let replyText;

    if (PROVIDER === "gemini") {
      const result = await callGeminiStructured(system, apiMessages);
      replyText = result.replyToUser || "Sorry, I couldn't process that just now — please try again.";

      if (result.triggerBooking && result.bookingDetails) {
        await captureBookingLead(result.bookingDetails, cars);
      }
      if (result.financingRequest) {
        replyText = appendFinancingEstimate(replyText, result.financingRequest, cars);
      }
    } else {
      replyText = await callAnthropic(system, apiMessages);
    }

    res.json({ reply: replyText });
  } catch (e) {
    console.error(`${PROVIDER} chat error:`, e.message);
    res.status(502).json({ error: "The AI assistant is temporarily unavailable. Please try again shortly." });
  }
});

module.exports = router;
