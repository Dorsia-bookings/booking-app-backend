const pool = require("../db");

/**
 * Resolves which restaurant (tenant) a request belongs to, based on the
 * :tenantSlug URL param. This is what makes one deployment serve every
 * restaurant customer — the slug comes from the widget embed code or
 * the owner dashboard URL, e.g. /api/wharf-and-vine/bookings
 */
async function resolveTenant(req, res, next) {
  const { tenantSlug } = req.params;
  if (!tenantSlug) {
    return res.status(400).json({ error: "Missing restaurant identifier" });
  }
  try {
    const result = await pool.query("SELECT * FROM tenants WHERE slug = $1", [tenantSlug]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Unknown restaurant" });
    }
    req.tenant = result.rows[0];
    next();
  } catch (err) {
    console.error("Tenant resolution failed:", err);
    res.status(500).json({ error: "Server error" });
  }
}

module.exports = { resolveTenant };
