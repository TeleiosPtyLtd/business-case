// Reschematic share backend.
//
//   POST /api/share        { password, snapshot }     -> { id, url }
//   POST /api/model/:id    { password }               -> { snapshot }
//   GET  /view/:id                                    -> static viewer HTML
//   GET  /                                            -> serves the local editor (project root)
//
// Storage: local `data/` directory, one JSON file per share keyed by id.
// Passwords are salt-hashed via scrypt. Shares expire after SHARE_TTL_DAYS.

const express     = require("express");
const rateLimit   = require("express-rate-limit");
const crypto      = require("crypto");
const path        = require("path");
const fs          = require("fs");

const PORT           = parseInt(process.env.PORT || "8787", 10);
const SHARE_TTL_DAYS = parseInt(process.env.SHARE_TTL_DAYS || "90", 10);
const MAX_BODY_BYTES = parseInt(process.env.MAX_BODY_BYTES || `${2 * 1024 * 1024}`, 10);
const DATA_DIR       = path.join(__dirname, "data");
const ROOT           = path.join(__dirname, "..");

fs.mkdirSync(DATA_DIR, { recursive: true });

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: MAX_BODY_BYTES }));

// ---------- helpers ----------
const newId = () => crypto.randomBytes(12).toString("base64url");

const hashPassword = (password) => {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
};
const verifyPassword = (password, stored) => {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt") return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const got = crypto.scryptSync(password, salt, expected.length);
  return crypto.timingSafeEqual(expected, got);
};

const recordPath = (id) => {
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(id)) return null;
  return path.join(DATA_DIR, `${id}.json`);
};

// Quick shape check on uploaded snapshots — refuse anything we can't render.
const validSnapshot = (snap) => {
  if (!snap || typeof snap !== "object") return false;
  if (typeof snap.horizon !== "number" || snap.horizon < 1 || snap.horizon > 50) return false;
  if (!Array.isArray(snap.assumptions)) return false;
  if (!Array.isArray(snap.items)) return false;
  if (snap.items.length > 100 || snap.assumptions.length > 200) return false;
  // gross strings will be re-validated by the formula sandbox in the viewer.
  return true;
};

const isExpired = (rec) => {
  if (!rec.createdAt) return false;
  const ageMs = Date.now() - new Date(rec.createdAt).getTime();
  return ageMs > SHARE_TTL_DAYS * 24 * 60 * 60 * 1000;
};

// Lazy GC: opportunistically delete an expired record on read.
const gcIfExpired = (file, rec) => {
  if (isExpired(rec)) { try { fs.unlinkSync(file); } catch {} return true; }
  return false;
};

// ---------- rate limits ----------
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,                              // 30 uploads per IP per 15 min
  standardHeaders: true, legacyHeaders: false,
  message: "Too many shares from this IP, slow down.",
});
const readLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 100,                             // 100 password attempts per IP per 5 min
  standardHeaders: true, legacyHeaders: false,
  message: "Too many attempts, slow down.",
});

// ---------- routes ----------
app.post("/api/share", writeLimiter, (req, res) => {
  const { password, snapshot } = req.body || {};
  if (typeof password !== "string" || password.length < 4 || password.length > 256) {
    return res.status(400).send("Password must be 4–256 characters");
  }
  if (!validSnapshot(snapshot)) {
    return res.status(400).send("Invalid snapshot shape");
  }
  const id = newId();
  const record = {
    id,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SHARE_TTL_DAYS * 86400 * 1000).toISOString(),
    passwordHash: hashPassword(password),
    snapshot,
  };
  fs.writeFileSync(path.join(DATA_DIR, `${id}.json`), JSON.stringify(record));
  const host  = req.headers["x-forwarded-host"] || req.headers.host || `localhost:${PORT}`;
  const proto = req.headers["x-forwarded-proto"] || (req.secure ? "https" : "http");
  res.json({ id, url: `${proto}://${host}/view/${id}`, expiresAt: record.expiresAt });
});

app.post("/api/model/:id", readLimiter, (req, res) => {
  const { password } = req.body || {};
  const file = recordPath(req.params.id);
  if (!file || !fs.existsSync(file)) return res.status(404).send("Not found");
  let record;
  try { record = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return res.status(500).send("Corrupt record"); }
  if (gcIfExpired(file, record)) return res.status(410).send("Share expired");
  if (typeof password !== "string" || !verifyPassword(password, record.passwordHash)) {
    return res.status(401).send("Wrong password");
  }
  res.json({
    snapshot: record.snapshot,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
  });
});

app.get("/healthz", (_req, res) => res.json({ ok: true }));

// Static editor (the project root). Useful when the user runs the backend
// alongside the frontend without a separate static server.
app.use("/", express.static(ROOT, { extensions: ["html"] }));

// Viewer page — single static file in this folder
app.get("/view/:id", (_req, res) => {
  res.sendFile(path.join(__dirname, "view.html"));
});

app.listen(PORT, () => {
  console.log(`Reschematic server on http://localhost:${PORT}`);
  console.log(`Share TTL: ${SHARE_TTL_DAYS} days · max body: ${(MAX_BODY_BYTES/1024/1024).toFixed(1)} MB`);
});
