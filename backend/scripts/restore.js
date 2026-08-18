require("dotenv").config();
const { execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const AdmZip = require("adm-zip");
const { DRIVER } = require("../src/middleware/upload");

const execFileAsync = promisify(execFile);

const ROOT = path.join(__dirname, "..");
const UPLOAD_DIR = path.join(ROOT, "uploads");
const BACKUP_ROOT = process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : path.join(ROOT, "backups");

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans); }));
}

function listBackups() {
  if (!fs.existsSync(BACKUP_ROOT)) return [];
  return fs.readdirSync(BACKUP_ROOT).filter((f) => fs.statSync(path.join(BACKUP_ROOT, f)).isDirectory()).sort();
}

async function main() {
  const arg = process.argv[2];
  const all = listBackups();

  if (!arg) {
    console.error("Usage: npm run restore -- <backup-folder-name>   (or)   npm run restore -- latest\n");
    console.error(all.length ? "Available backups:" : `No backups found in ${BACKUP_ROOT}`);
    all.forEach((d) => console.error("  " + d));
    process.exit(1);
  }

  if (!all.length) { console.error(`No backups found in ${BACKUP_ROOT}`); process.exit(1); }

  const folder = arg === "latest" ? all[all.length - 1] : arg;
  const dir = path.join(BACKUP_ROOT, folder);
  const dumpPath = path.join(dir, "database.dump");
  const zipPath = path.join(dir, "uploads.zip");

  if (!fs.existsSync(dumpPath)) {
    console.error(`No database.dump found in ${dir}. Available backups:`);
    all.forEach((d) => console.error("  " + d));
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set — check your .env file.");
    process.exit(1);
  }

  console.log(`This will OVERWRITE the current database and uploads/ folder with the backup: ${folder}`);
  console.log(`Target database: ${process.env.DATABASE_URL.replace(/:[^:@]+@/, ":****@")}`); // hide the password when printing
  const answer = await ask('Type "YES" to continue: ');
  if (answer.trim() !== "YES") { console.log("Cancelled — nothing was changed."); process.exit(0); }

  console.log("Restoring database (this replaces existing tables)...");
  try {
    await execFileAsync("pg_restore", ["--clean", "--if-exists", "--no-owner", "-d", process.env.DATABASE_URL, dumpPath]);
  } catch (e) {
    // pg_restore often exits non-zero on harmless "does not exist, skipping"
    // notices from --if-exists on a fresh database — surface the output either way.
    console.warn("pg_restore reported warnings (often harmless on a fresh database):");
    console.warn(e.stderr || e.message);
  }

  console.log("Restoring uploads folder...");
  if (DRIVER === "cloudinary") {
    console.log("STORAGE_DRIVER=cloudinary — photos live on Cloudinary, not this disk. Nothing to restore here; if needed, restore images from Cloudinary's own dashboard/history.");
  } else {
    fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    if (fs.existsSync(zipPath)) {
      new AdmZip(zipPath).extractAllTo(UPLOAD_DIR, true);
    }
  }

  console.log(`Restore complete from: ${folder}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
