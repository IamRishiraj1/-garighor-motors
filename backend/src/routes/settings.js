const express = require("express");
const prisma = require("../lib/prisma");
const { authRequired, adminRequired } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/asyncHandler");

const router = express.Router();

// GET /api/settings — public. Used by the homepage to show the hero photo.
router.get("/", asyncHandler(async (req, res) => {
  const settings = await prisma.setting.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
  res.json({ settings });
}));

// PUT /api/settings — admin only. Body: { heroImage: "https://..." }
router.put("/", authRequired, adminRequired, asyncHandler(async (req, res) => {
  const { heroImage } = req.body || {};
  const settings = await prisma.setting.upsert({
    where: { id: "singleton" },
    update: { heroImage },
    create: { id: "singleton", heroImage },
  });
  res.json({ settings });
}));

module.exports = router;
