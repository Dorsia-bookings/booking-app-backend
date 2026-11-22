// Restaurant logins: log in, first-owner setup, change own password.
const express = require("express");
const router = express.Router({ mergeParams: true });
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");
const { tooManyAttempts, recordFailure, clearFailures } = require("../lib/rateLimit");
const {
  cleanEmail,
  validEmail,
  passwordProblem,
  hashPassword,
  checkPassword,
  issueTenantToken,
  safeEqual,
} = require("../lib/accounts");

function noSecret(res) {
  return res.status(500).json({ error: "Login isn't configured on the server yet." });
}

// POST /api/:tenantSlug/auth/login { email, password }
router.post("/login", async (req, res) => {
  if (!process.env.JWT_SECRET) return noSecret(res);
  const key = `${req.ip}:${req.tenant.id}`;
  if (tooManyAttempts(key)) return res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });

  const email = cleanEmail(req.body?.email);
  try {
    const result = await pool.query("SELECT * FROM staff_users WHERE tenant_id = $1 AND email = $2", [req.tenant.id, email]);
    const user = result.rows[0];
    const ok = user && (await checkPassword(req.body?.password, user.password_hash));
    if (!ok) {
      recordFailure(key);
      return res.status(401).json({ error: "Wrong email or password." });
    }
    clearFailures(key);
    res.json({ token: issueTenantToken(req.tenant.id, user), email: user.email, role: user.role });
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
  if (!process.env.JWT_SECRET) return noSecret(res);
  if (!process.env.SETUP_KEY) return res.status(403).json({ error: "Account setup is switched off." });
  const key = `${req.ip}:setup`;
  if (tooManyAttempts(key)) return res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });

  const email = cleanEmail(req.body?.email);
  const password = req.body?.password;
  if (!safeEqual(req.body?.setupKey || "", process.env.SETUP_KEY)) {
    recordFailure(key);
    return res.status(403).json({ error: "That setup key isn't right." });
  }
  if (!validEmail(email)) return res.status(400).json({ error: "Enter a valid email." });
  const problem = passwordProblem(password);
  if (problem) return res.status(400).json({ error: problem });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1 || ':setup'))", [req.tenant.id]);
    const existing = await client.query("SELECT 1 FROM staff_users WHERE tenant_id = $1 LIMIT 1", [req.tenant.id]);
    if (existing.rows.length) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "This restaurant already has an owner account. Please log in." });
    }
    const inserted = await client.query(
      "INSERT INTO staff_users (tenant_id, email, password_hash, role) VALUES ($1, $2, $3, 'owner') RETURNING *",
      [req.tenant.id, email, await hashPassword(password)]
    );
    await client.query("COMMIT");
    const user = inserted.rows[0];
    res.status(201).json({ token: issueTenantToken(req.tenant.id, user), email: user.email, role: user.role });
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
  res.json({ email: req.user.email, role: req.user.role, master: req.user.master });
});

// POST /api/:tenantSlug/auth/password { currentPassword, newPassword } — change your own password
router.post("/password", requireAuth, async (req, res) => {
  if (req.user.master) return res.status(400).json({ error: "Change the master password from the master page." });
  const key = `${req.ip}:pw:${req.user.id}`;
  if (tooManyAttempts(key)) return res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });
  const problem = passwordProblem(req.body?.newPassword);
  if (problem) return res.status(400).json({ error: problem });
  try {
    const r = await pool.query("SELECT password_hash FROM staff_users WHERE id = $1", [req.user.id]);
    if (!(await checkPassword(req.body?.currentPassword, r.rows[0].password_hash))) {
      recordFailure(key);
      return res.status(403).json({ error: "Your current password isn't right." });
    }
    clearFailures(key);
    await pool.query("UPDATE staff_users SET password_hash = $2 WHERE id = $1", [
      req.user.id,
      await hashPassword(req.body.newPassword),
    ]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not change the password" });
  }
});

module.exports = router;
