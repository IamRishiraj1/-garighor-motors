require("dotenv").config();
const { execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const { UPLOAD_DIR, DRIVER } = require("../src/middleware/upload");

const execFileAsync = promisify(execFile);

const ROOT = path.join(__dirname, "..");
const BACKUP_ROOT = process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : path.join(ROOT, "backups");
const KEEP = Number(process.env.BACKUP_KEEP || 14);

function timestamp() {
  // e.g. 2026-08-16T14-05-30 — safe for folder names on every OS
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set — check your .env file.");
    process.exit(1);
  }

  fs.mkdirSync(BACKUP_ROOT, { recursive: true });
  const dest = path.join(BACKUP_ROOT, timestamp());
  fs.mkdirSync(dest, { recursive: true });

  // 1. Database — pg_dump's custom format is compressed and restorable with
  // pg_restore, including selectively (single table, schema-only, etc).
  const dumpPath = path.join(dest, "database.dump");
  console.log("Dumping database...");
  try {
    await execFileAsync("pg_dump", [process.env.DATABASE_URL, "--format=custom", "--file", dumpPath]);
  } catch (e) {
    console.error("pg_dump failed. Make sure PostgreSQL's command-line tools are installed and on your PATH (run `pg_dump --version` to check).");
    console.error(e.message);
    fs.rmSync(dest, { recursive: true, force: true });
    process.exit(1);
  }

  // 2. Uploaded car photos — only relevant when storing locally. Cloudinary
  // keeps its own copies, so there's nothing on this disk to back up there.
  let uploadCount = 0;
  const zip = new AdmZip();
  if (DRIVER === "cloudinary") {
    console.log("STORAGE_DRIVER=cloudinary — photos live on Cloudinary, not this disk, so uploads.zip will be empty. Back up your Cloudinary media library separately (or export via their dashboard) if needed.");
  } else {
    console.log("Zipping uploads...");
    if (fs.existsSync(UPLOAD_DIR)) {
      const files = fs.readdirSync(UPLOAD_DIR).filter((f) => f !== ".gitkeep");
      files.forEach((f) => zip.addLocalFile(path.join(UPLOAD_DIR, f)));
      uploadCount = files.length;
    }
  }
  zip.writeZip(path.join(dest, "uploads.zip"));

  // 3. A small manifest so `restore.js` (and you) know what's in each backup
  fs.writeFileSync(
    path.join(dest, "manifest.json"),
    JSON.stringify({ createdAt: new Date().toISOString(), uploadCount }, null, 2)
  );

  const dumpSizeMB = (fs.statSync(dumpPath).size / 1024 / 1024).toFixed(2);
  console.log(`Backup complete: ${dest}`);
  console.log(`  database.dump: ${dumpSizeMB} MB`);
  console.log(`  uploads.zip: ${uploadCount} file(s)`);

  // 4. Rotate — keep only the most recent KEEP backups
  const all = fs
    .readdirSync(BACKUP_ROOT)
    .filter((f) => fs.statSync(path.join(BACKUP_ROOT, f)).isDirectory())
    .sort();
  if (all.length > KEEP) {
    for (const dir of all.slice(0, all.length - KEEP)) {
      fs.rmSync(path.join(BACKUP_ROOT, dir), { recursive: true, force: true });
      console.log(`Removed old backup: ${dir}`);
    }
  }
}

main();
