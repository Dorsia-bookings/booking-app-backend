// Owner-only: add, change and remove the restaurant's logins.
const express = require("express");
const router = express.Router({ mergeParams: true });
const pool = require("../db");
const { cleanEmail, validEmail, passwordProblem, hashPassword } = require("../lib/accounts");

const ROLES = ["owner", "staff"];

function out(r) {
  return { id: r.id, email: r.email, role: r.role, createdAt: r.created_at };
}

async function ownerCount(db, tenantId) {
  const r = await db.query("SELECT COUNT(*)::int AS n FROM staff_users WHERE tenant_id = $1 AND role = 'owner'", [tenantId]);
  return r.rows[0].n;
}

// GET /api/:tenantSlug/team
router.get("/", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM staff_users WHERE tenant_id = $1 ORDER BY role, created_at", [req.tenant.id]);
    res.json(r.rows.map(out));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load the team" });
  }
});

// POST /api/:tenantSlug/team { email, password, role }
router.post("/", async (req, res) => {
  const email = cleanEmail(req.body?.email);
  const role = req.body?.role;
  if (!validEmail(email)) return res.status(400).json({ error: "Enter a valid email." });
  if (!ROLES.includes(role)) return res.status(400).json({ error: "Choose owner or staff." });
  const problem = passwordProblem(req.body?.password);
  if (problem) return res.status(400).json({ error: problem });
  try {
    const r = await pool.query(
      `INSERT INTO staff_users (tenant_id, email, password_hash, role) VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, email) DO NOTHING RETURNING *`,
      [req.tenant.id, email, await hashPassword(req.body.password), role]
    );
    if (!r.rows.length) return res.status(409).json({ error: "Someone with that email already has a login here." });
    res.status(201).json(out(r.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not add that person" });
  }
});

// PATCH /api/:tenantSlug/team/:id { role }
router.patch("/:id", async (req, res) => {
  const role = req.body?.role;
  if (!ROLES.includes(role)) return res.status(400).json({ error: "Choose owner or staff." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1 || ':team'))", [req.tenant.id]);
    const cur = await client.query("SELECT * FROM staff_users WHERE id = $1 AND tenant_id = $2", [req.params.id, req.tenant.id]);
    if (!cur.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "That person wasn't found." });
    }
    if (cur.rows[0].role === "owner" && role === "staff" && (await ownerCount(client, req.tenant.id)) <= 1) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "The restaurant needs at least one owner." });
    }
    const r = await client.query("UPDATE staff_users SET role = $3 WHERE id = $1 AND tenant_id = $2 RETURNING *", [
      req.params.id,
      req.tenant.id,
      role,
    ]);
    await client.query("COMMIT");
    res.json(out(r.rows[0]));
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    res.status(500).json({ error: "Could not change the role" });
  } finally {
    client.release();
  }
});

// DELETE /api/:tenantSlug/team/:id
router.delete("/:id", async (req, res) => {
  if (!req.user.master && req.params.id === req.user.id) {
    return res.status(400).json({ error: "You can't remove your own login." });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1 || ':team'))", [req.tenant.id]);
    const cur = await client.query("SELECT * FROM staff_users WHERE id = $1 AND tenant_id = $2", [req.params.id, req.tenant.id]);
    if (!cur.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "That person wasn't found." });
    }
    if (cur.rows[0].role === "owner" && (await ownerCount(client, req.tenant.id)) <= 1) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "The restaurant needs at least one owner." });
    }
    await client.query("DELETE FROM staff_users WHERE id = $1", [req.params.id]);
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    res.status(500).json({ error: "Could not remove that person" });
  } finally {
    client.release();
  }
});

module.exports = router;
