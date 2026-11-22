// Owner and staff logins.
const express = require("express");
const router = express.Router({ mergeParams: true });
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");

// Simple guard against password guessing: 10 failed attempts per address per 15 minutes.
const attempts = new Map();
function tooManyAttempts(key) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.first > 15 * 60 * 1000) return false;
  return entry.count >= 10;
}
function recordFailure(key) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.first > 15 * 60 * 1000) attempts.set(key, { first: now, count: 1 });
  else entry.count += 1;
}

function issueToken(tenantId, user) {
  return jwt.sign({ tenantId, userId: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "30d",
  });
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

// POST /api/:tenantSlug/auth/login { email, password }
router.post("/login", async (req, res) => {
  if (!process.env.JWT_SECRET) return res.status(500).json({ error: "Login isn't configured on the server yet." });
  const key = `${req.ip}:${req.tenant.id}`;
  if (tooManyAttempts(key)) return res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });

  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  try {
    const result = await pool.query("SELECT * FROM staff_users WHERE tenant_id = $1 AND email = $2", [
      req.tenant.id,
      email,
    ]);
    const user = result.rows[0];
    const ok = user && (await bcrypt.compare(password, user.password_hash));
    if (!ok) {
      recordFailure(key);
      return res.status(401).json({ error: "Wrong email or password." });
    }
    attempts.delete(key);
    res.json({ token: issueToken(req.tenant.id, user), email: user.email, role: user.role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not log in" });
  }
});

// GET /api/:tenantSlug/auth/status — whether this restaurant has an owner account yet
router.get("/status", async (req, res) => {
  try {
    const result = await pool.query("SELECT COUNT(*)::int AS n FROM staff_users WHERE tenant_id = $1", [req.tenant.id]);
    res.json({ hasOwner: result.rows[0].n > 0, setupEnabled: Boolean(process.env.SETUP_KEY) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/:tenantSlug/auth/setup { setupKey, email, password }
// Creates the first owner account. Only works while the restaurant has no accounts,
// and only with the SETUP_KEY set in Render's environment settings.
router.post("/setup", async (req, res) => {
  if (!process.env.JWT_SECRET) return res.status(500).json({ error: "Login isn't configured on the server yet." });
  if (!process.env.SETUP_KEY) return res.status(403).json({ error: "Account setup is switched off." });
  const key = `${req.ip}:setup`;
  if (tooManyAttempts(key)) return res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });

  const { setupKey } = req.body || {};
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (!safeEqual(setupKey || "", process.env.SETUP_KEY)) {
    recordFailure(key);
    return res.status(403).json({ error: "That setup key isn't right." });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: "Enter a valid email." });
  if (password.length < 10) return res.status(400).json({ error: "Use a password of at least 10 characters." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1 || ':setup'))", [req.tenant.id]);
    const existing = await client.query("SELECT 1 FROM staff_users WHERE tenant_id = $1 LIMIT 1", [req.tenant.id]);
    if (existing.rows.length) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "This restaurant already has an owner account. Please log in." });
    }
    const hash = await bcrypt.hash(password, 12);
    const inserted = await client.query(
      "INSERT INTO staff_users (tenant_id, email, password_hash, role) VALUES ($1, $2, $3, 'owner') RETURNING *",
      [req.tenant.id, email, hash]
    );
    await client.query("COMMIT");
    const user = inserted.rows[0];
    res.status(201).json({ token: issueToken(req.tenant.id, user), email: user.email, role: user.role });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    res.status(500).json({ error: "Could not create the account" });
  } finally {
    client.release();
  }
});

// GET /api/:tenantSlug/auth/me — checks a saved login is still valid
router.get("/me", requireAuth, (req, res) => {
  res.json({ email: req.user.email, role: req.user.role });
});

module.exports = router;
