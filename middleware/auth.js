const pool = require("../db");
const { readToken } = require("../lib/accounts");

// Lets a request through only with a valid login for THIS restaurant
// (an owner or staff account), or the Dorsia master login.
// The account is re-checked on every request, so removing someone or changing
// their role takes effect straight away.
async function requireAuth(req, res, next) {
  if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET is not set in the environment");
    return res.status(500).json({ error: "Login isn't configured on the server yet." });
  }
  const payload = readToken(req);
  if (!payload) return res.status(401).json({ error: "Please log in." });

  try {
    if (payload.kind === "platform") {
      const r = await pool.query("SELECT id, email FROM platform_admins WHERE id = $1", [payload.userId]);
      if (!r.rows.length) return res.status(401).json({ error: "Please log in again." });
      req.user = { id: r.rows[0].id, email: r.rows[0].email, role: "owner", master: true };
      return next();
    }
    // (Logins made before roles were added have no "kind"; they're restaurant logins.)
    const isTenantToken = payload.kind === "tenant" || (!payload.kind && payload.tenantId);
    if (isTenantToken && req.tenant && payload.tenantId === req.tenant.id) {
      const r = await pool.query("SELECT id, email, role FROM staff_users WHERE id = $1 AND tenant_id = $2", [
        payload.userId,
        req.tenant.id,
      ]);
      if (!r.rows.length) return res.status(401).json({ error: "Your login no longer exists. Ask the owner." });
      req.user = { id: r.rows[0].id, email: r.rows[0].email, role: r.rows[0].role, master: false };
      return next();
    }
    return res.status(401).json({ error: "Please log in." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

// Owner-only actions: floor plan, booking times, terms, refunds, team.
function requireOwner(req, res, next) {
  if (req.user && req.user.role === "owner") return next();
  return res.status(403).json({ error: "Only the owner can do that." });
}

// The Dorsia master login only.
async function requirePlatform(req, res, next) {
  if (!process.env.JWT_SECRET) return res.status(500).json({ error: "Login isn't configured on the server yet." });
  const payload = readToken(req);
  if (!payload || payload.kind !== "platform") return res.status(401).json({ error: "Please log in." });
  try {
    const r = await pool.query("SELECT id, email FROM platform_admins WHERE id = $1", [payload.userId]);
    if (!r.rows.length) return res.status(401).json({ error: "Please log in again." });
    req.platformUser = r.rows[0];
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
}

module.exports = { requireAuth, requireOwner, requirePlatform };
