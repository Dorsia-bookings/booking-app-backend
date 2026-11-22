// Dorsia master login: sees every restaurant and can open any dashboard as an owner.
const express = require("express");
const router = express.Router();
const pool = require("../db");
const { requirePlatform } = require("../middleware/auth");
const { tooManyAttempts, recordFailure, clearFailures } = require("../lib/rateLimit");
const {
  cleanEmail,
  validEmail,
  passwordProblem,
  hashPassword,
  checkPassword,
  issuePlatformToken,
  safeEqual,
} = require("../lib/accounts");

function noSecret(res) {
  return res.status(500).json({ error: "Login isn't configured on the server yet." });
}

// GET /api/platform/status
router.get("/status", async (req, res) => {
  try {
    const r = await pool.query("SELECT COUNT(*)::int AS n FROM platform_admins");
    res.json({ hasOwner: r.rows[0].n > 0, setupEnabled: Boolean(process.env.SETUP_KEY) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/platform/setup { setupKey, email, password } — creates the master login (once)
router.post("/setup", async (req, res) => {
  if (!process.env.JWT_SECRET) return noSecret(res);
  if (!process.env.SETUP_KEY) return res.status(403).json({ error: "Account setup is switched off." });
  const key = `${req.ip}:setup`;
  if (tooManyAttempts(key)) return res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });
  if (!safeEqual(req.body?.setupKey || "", process.env.SETUP_KEY)) {
    recordFailure(key);
    return res.status(403).json({ error: "That setup key isn't right." });
  }
  const email = cleanEmail(req.body?.email);
  if (!validEmail(email)) return res.status(400).json({ error: "Enter a valid email." });
  const problem = passwordProblem(req.body?.password);
  if (problem) return res.status(400).json({ error: problem });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('platform:setup'))");
    const existing = await client.query("SELECT 1 FROM platform_admins LIMIT 1");
    if (existing.rows.length) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "The master login already exists. Please log in." });
    }
    const r = await client.query("INSERT INTO platform_admins (email, password_hash) VALUES ($1, $2) RETURNING *", [
      email,
      await hashPassword(req.body.password),
    ]);
    await client.query("COMMIT");
    res.status(201).json({ token: issuePlatformToken(r.rows[0]), email: r.rows[0].email, role: "master" });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    res.status(500).json({ error: "Could not create the master login" });
  } finally {
    client.release();
  }
});

// POST /api/platform/login { email, password }
router.post("/login", async (req, res) => {
  if (!process.env.JWT_SECRET) return noSecret(res);
  const key = `${req.ip}:platform`;
  if (tooManyAttempts(key)) return res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });
  try {
    const r = await pool.query("SELECT * FROM platform_admins WHERE email = $1", [cleanEmail(req.body?.email)]);
    const admin = r.rows[0];
    if (!admin || !(await checkPassword(req.body?.password, admin.password_hash))) {
      recordFailure(key);
      return res.status(401).json({ error: "Wrong email or password." });
    }
    clearFailures(key);
    res.json({ token: issuePlatformToken(admin), email: admin.email, role: "master" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not log in" });
  }
});

// GET /api/platform/restaurants — every restaurant on Dorsia
router.get("/restaurants", requirePlatform, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT t.slug, t.name, t.created_at,
              (SELECT COUNT(*)::int FROM bookings b WHERE b.tenant_id = t.id AND b.status = 'confirmed') AS bookings,
              (SELECT COUNT(*)::int FROM staff_users s WHERE s.tenant_id = t.id) AS logins
       FROM tenants t ORDER BY t.name`
    );
    res.json({ email: req.platformUser.email, restaurants: r.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load restaurants" });
  }
});

// POST /api/platform/password { currentPassword, newPassword }
router.post("/password", requirePlatform, async (req, res) => {
  const key = `${req.ip}:pw:platform`;
  if (tooManyAttempts(key)) return res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });
  const problem = passwordProblem(req.body?.newPassword);
  if (problem) return res.status(400).json({ error: problem });
  try {
    const r = await pool.query("SELECT password_hash FROM platform_admins WHERE id = $1", [req.platformUser.id]);
    if (!(await checkPassword(req.body?.currentPassword, r.rows[0].password_hash))) {
      recordFailure(key);
      return res.status(403).json({ error: "Your current password isn't right." });
    }
    clearFailures(key);
    await pool.query("UPDATE platform_admins SET password_hash = $2 WHERE id = $1", [
      req.platformUser.id,
      await hashPassword(req.body.newPassword),
    ]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not change the password" });
  }
});

module.exports = router;
