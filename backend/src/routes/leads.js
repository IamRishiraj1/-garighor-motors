const express = require("express");
const prisma = require("../lib/prisma");
const { authRequired, adminRequired } = require("../middleware/auth");
const { rateLimit } = require("../middleware/rateLimit");
const { asyncHandler } = require("../middleware/asyncHandler");

const router = express.Router();

// POST /api/leads — public, submitted from a car's "Enquire / Book a test drive" form.
// Rate-limited loosely to discourage spam submissions.
router.post("/", rateLimit({ windowMs: 60_000, max: 10 }), asyncHandler(async (req, res) => {
  const { carId, name, phone, email, message, type } = req.body || {};
  if (!carId || !name || !phone) {
    return res.status(400).json({ error: "carId, name, and phone are required." });
  }

  const car = await prisma.car.findUnique({ where: { id: carId } });
  if (!car) return res.status(404).json({ error: "That car listing no longer exists." });

  const lead = await prisma.lead.create({
    data: {
      carId, name, phone, email: email || null,
      message: message || "", type: type === "testdrive" ? "testdrive" : "enquiry",
    },
  });
  res.status(201).json({ lead });
}));

// GET /api/leads — admin only, dealer console inbox
router.get("/", authRequired, adminRequired, asyncHandler(async (req, res) => {
  const leads = await prisma.lead.findMany({
    orderBy: { createdAt: "desc" },
    include: { car: { select: { brand: true, model: true, stockNo: true } } },
  });
  res.json({ leads });
}));

// PUT /api/leads/:id — admin only, move a lead through new -> contacted -> closed
router.put("/:id", authRequired, adminRequired, asyncHandler(async (req, res) => {
  const { status } = req.body || {};
  if (!["new", "contacted", "closed"].includes(status)) {
    return res.status(400).json({ error: "Status must be new, contacted, or closed." });
  }
  try {
    const lead = await prisma.lead.update({ where: { id: req.params.id }, data: { status } });
    res.json({ lead });
  } catch (e) {
    if (e.code === "P2025") return res.status(404).json({ error: "Lead not found." });
    throw e;
  }
}));

module.exports = router;
