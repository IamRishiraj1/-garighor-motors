const express = require("express");
const { upload, DRIVER } = require("../middleware/upload");
const { authRequired, adminRequired } = require("../middleware/auth");

const router = express.Router();

// POST /api/uploads — admin only. Send multipart/form-data with a field
// named "image". Returns { url } — paste that url straight into a car's
// `image` field (POST/PUT /api/cars already accept a plain string there).
router.post("/", authRequired, adminRequired, (req, res) => {
  upload.single("image")(req, res, (err) => {
    if (err) {
      // Multer errors (wrong type, too large, etc.) land here, not in the
      // normal error handler, because they happen inside upload.single().
      return res.status(400).json({ error: err.message || "Upload failed." });
    }
    if (!req.file) {
      return res.status(400).json({ error: "No image received (expected a file in field 'image')." });
    }

    let url;
    if (DRIVER === "cloudinary") {
      url = req.file.path; // multer-storage-cloudinary puts the hosted URL here
    } else {
      const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
      url = `${base}/uploads/${req.file.filename}`;
    }
    res.status(201).json({ url });
  });
});

module.exports = router;
