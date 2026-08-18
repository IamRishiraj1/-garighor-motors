const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

// "local"      — files saved to disk on this server (fine for your own PC,
//                or a host with a persistent disk). Vanishes on Render's
//                free tier, since free web services have no persistent disk.
// "cloudinary" — files uploaded to Cloudinary's free media storage, which
//                survives redeploys and restarts. Use this in production
//                on any host without persistent disk.
const DRIVER = (process.env.STORAGE_DRIVER || "local").toLowerCase();

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
let upload;
let UPLOAD_DIR = null;

if (DRIVER === "cloudinary") {
  const cloudinary = require("cloudinary").v2;
  const { CloudinaryStorage } = require("multer-storage-cloudinary");

  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    console.warn("STORAGE_DRIVER=cloudinary but CLOUDINARY_* env vars are missing — uploads will fail until they're set.");
  }

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  const storage = new CloudinaryStorage({
    cloudinary,
    params: { folder: "garighor-motors", allowed_formats: ["jpg", "jpeg", "png", "webp"] },
  });

  upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
} else {
  UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads");
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      // Random filename — never trust or reuse the name the browser sent us.
      const ext = path.extname(file.originalname).toLowerCase();
      const safeExt = [".jpg", ".jpeg", ".png", ".webp"].includes(ext) ? ext : ".jpg";
      cb(null, crypto.randomBytes(16).toString("hex") + safeExt);
    },
  });

  function fileFilter(req, file, cb) {
    if (!ALLOWED_TYPES.has(file.mimetype)) return cb(new Error("Only JPEG, PNG, or WEBP images are allowed."));
    cb(null, true);
  }

  upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
}

module.exports = { upload, UPLOAD_DIR, DRIVER };
