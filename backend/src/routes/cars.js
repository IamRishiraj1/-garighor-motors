const express = require("express");
const prisma = require("../lib/prisma");
const { authRequired, adminRequired } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/asyncHandler");

const router = express.Router();

const REQUIRED_FIELDS = [
  "brand", "model", "year", "regYear", "price", "mileage", "fuel",
  "transmission", "engineCC", "color", "condition", "bodyType",
  "auctionGrade", "desc",
];

function nextStockNo() {
  // Simple human-readable stock tag: GGM-<random 4 digits>. Uniqueness is
  // enforced by the database constraint; on the rare collision, retry once.
  return "GGM-" + Math.floor(1000 + Math.random() * 9000);
}

// GET /api/cars — public catalog, with optional filters via query string
// e.g. /api/cars?brand=Toyota&bodyType=SUV&minPrice=1000000&maxPrice=2500000&q=vezel&sort=priceLow
router.get("/", asyncHandler(async (req, res) => {
  const { brand, bodyType, fuel, minPrice, maxPrice, q, status, sort } = req.query;

  const where = {};
  if (brand && brand !== "All") where.brand = brand;
  if (bodyType && bodyType !== "All") where.bodyType = bodyType;
  if (fuel && fuel !== "All") where.fuel = fuel;
  if (status) where.status = status;
  if (minPrice || maxPrice) {
    where.price = {};
    if (minPrice) where.price.gte = Number(minPrice);
    if (maxPrice) where.price.lte = Number(maxPrice);
  }
  if (q) {
    where.OR = [
      { brand: { contains: q, mode: "insensitive" } },
      { model: { contains: q, mode: "insensitive" } },
      { stockNo: { contains: q, mode: "insensitive" } },
    ];
  }

  const orderBy =
    sort === "priceLow" ? { price: "asc" } :
    sort === "priceHigh" ? { price: "desc" } :
    sort === "yearNew" ? { year: "desc" } :
    sort === "mileageLow" ? { mileage: "asc" } :
    { createdAt: "desc" };

  const cars = await prisma.car.findMany({ where, orderBy });
  res.json({ cars });
}));

// GET /api/cars/:id — public single listing
router.get("/:id", asyncHandler(async (req, res) => {
  const car = await prisma.car.findUnique({ where: { id: req.params.id } });
  if (!car) return res.status(404).json({ error: "Car not found." });
  res.json({ car });
}));

// POST /api/cars — admin only, add a new listing
router.post("/", authRequired, adminRequired, asyncHandler(async (req, res) => {
  const body = req.body || {};
  const missing = REQUIRED_FIELDS.filter((f) => body[f] === undefined || body[f] === "");
  if (missing.length) return res.status(400).json({ error: `Missing required field(s): ${missing.join(", ")}` });

  let stockNo = body.stockNo || nextStockNo();
  try {
    const car = await prisma.car.create({
      data: {
        stockNo,
        brand: body.brand, model: body.model,
        year: Number(body.year), regYear: Number(body.regYear),
        price: Number(body.price), mileage: Number(body.mileage),
        fuel: body.fuel, transmission: body.transmission, engineCC: Number(body.engineCC),
        color: body.color, condition: body.condition, bodyType: body.bodyType,
        auctionGrade: body.auctionGrade, status: body.status || "available",
        featured: !!body.featured, image: body.image || null, desc: body.desc,
        features: Array.isArray(body.features) ? body.features : [],
      },
    });
    res.status(201).json({ car });
  } catch (e) {
    if (e.code === "P2002") return res.status(409).json({ error: "That stock number is already in use." });
    throw e; // anything else — let asyncHandler forward it to the central error handler
  }
}));

// PUT /api/cars/:id — admin only, full edit
router.put("/:id", authRequired, adminRequired, asyncHandler(async (req, res) => {
  const body = req.body || {};
  try {
    const car = await prisma.car.update({
      where: { id: req.params.id },
      data: {
        brand: body.brand, model: body.model,
        year: body.year !== undefined ? Number(body.year) : undefined,
        regYear: body.regYear !== undefined ? Number(body.regYear) : undefined,
        price: body.price !== undefined ? Number(body.price) : undefined,
        mileage: body.mileage !== undefined ? Number(body.mileage) : undefined,
        fuel: body.fuel, transmission: body.transmission,
        engineCC: body.engineCC !== undefined ? Number(body.engineCC) : undefined,
        color: body.color, condition: body.condition, bodyType: body.bodyType,
        auctionGrade: body.auctionGrade, status: body.status,
        featured: body.featured, image: body.image, desc: body.desc,
        features: Array.isArray(body.features) ? body.features : undefined,
      },
    });
    res.json({ car });
  } catch (e) {
    if (e.code === "P2025") return res.status(404).json({ error: "Car not found." });
    throw e;
  }
}));

// PATCH /api/cars/:id/status — admin only, quick status change (available/reserved/sold)
router.patch("/:id/status", authRequired, adminRequired, asyncHandler(async (req, res) => {
  const { status } = req.body || {};
  if (!["available", "reserved", "sold"].includes(status)) {
    return res.status(400).json({ error: "Status must be available, reserved, or sold." });
  }
  try {
    const car = await prisma.car.update({ where: { id: req.params.id }, data: { status } });
    res.json({ car });
  } catch (e) {
    if (e.code === "P2025") return res.status(404).json({ error: "Car not found." });
    throw e;
  }
}));

// DELETE /api/cars/:id — admin only
router.delete("/:id", authRequired, adminRequired, asyncHandler(async (req, res) => {
  try {
    await prisma.car.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (e) {
    if (e.code === "P2025") return res.status(404).json({ error: "Car not found." });
    throw e;
  }
}));

module.exports = router;
