require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const authRoutes = require("./routes/auth");
const carRoutes = require("./routes/cars");
const leadRoutes = require("./routes/leads");
const chatRoutes = require("./routes/chat");
const uploadRoutes = require("./routes/uploads");
const settingsRoutes = require("./routes/settings");
const { UPLOAD_DIR, DRIVER } = require("./middleware/upload");

const app = express();

app.use(helmet({ crossOriginResourcePolicy: false })); // allow the frontend origin to load /uploads images
app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:5173" }));
app.use(express.json({ limit: "1mb" }));
if (DRIVER !== "cloudinary" && UPLOAD_DIR) {
  app.use("/uploads", express.static(UPLOAD_DIR, { maxAge: "7d" }));
}

app.get("/api/health", (req, res) => res.json({ ok: true, service: "garighor-backend" }));

app.use("/api/auth", authRoutes);
app.use("/api/cars", carRoutes);
app.use("/api/leads", leadRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/settings", settingsRoutes);

// 404 fallback for unmatched API routes
app.use("/api", (req, res) => res.status(404).json({ error: "Not found." }));

// Central error handler — catches anything thrown/rejected in a route
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Internal server error." });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`GariGhor backend listening on http://localhost:${PORT}`);
});
