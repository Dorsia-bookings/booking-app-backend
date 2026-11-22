// Owner dashboard: load everything, and save settings, booking times and the floor plan.
// Every route here requires a login (see server.js).
const express = require("express");
const router = express.Router({ mergeParams: true });
const pool = require("../db");
const { sittingOut, elementOut, bookingOut } = require("../lib/shapes");
const { BOOKING_SELECT, isValidTime } = require("../lib/bookingCore");
const { todayIn } = require("../lib/availability");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadBookings(tenantId) {
  const result = await pool.query(
    `${BOOKING_SELECT} WHERE b.tenant_id = $1 AND b.status = 'confirmed' ORDER BY b.booking_date, b.created_at`,
    [tenantId]
  );
  return result.rows.map(bookingOut);
}

// GET /api/:tenantSlug/admin/state
router.get("/state", async (req, res) => {
  const t = req.tenant;
  try {
    const [sittings, elements, bookings, customers] = await Promise.all([
      pool.query("SELECT * FROM sittings WHERE tenant_id = $1 ORDER BY time_of_day, sort_order", [t.id]),
      pool.query("SELECT * FROM floor_elements WHERE tenant_id = $1 ORDER BY created_at", [t.id]),
      loadBookings(t.id),
      pool.query("SELECT id, email, notes FROM customers WHERE tenant_id = $1 AND email IS NOT NULL", [t.id]),
    ]);
    res.json({
      restaurant: {
        slug: t.slug,
        name: t.name,
        terms: t.terms || "",
        sections: t.sections || [{ id: "main", name: "Main" }],
        roomSize: { w: t.room_width_px, h: t.room_height_px },
        depositThreshold: t.deposit_threshold,
        depositPerHead: Number(t.deposit_per_head),
        today: todayIn(t.timezone),
      },
      user: { email: req.user.email, role: req.user.role },
      sittings: sittings.rows.map(sittingOut),
      floorElements: elements.rows.map(elementOut),
      bookings,
      customers: customers.rows.map((c) => ({ id: c.id, email: c.email, notes: c.notes || "" })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load the dashboard" });
  }
});

// GET /api/:tenantSlug/admin/bookings — refreshed every 30 seconds by the dashboard
router.get("/bookings", async (req, res) => {
  try {
    res.json(await loadBookings(req.tenant.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load bookings" });
  }
});

// PUT /api/:tenantSlug/admin/settings { terms }
router.put("/settings", async (req, res) => {
  const { terms } = req.body || {};
  if (typeof terms !== "string") return res.status(400).json({ error: "Missing terms" });
  try {
    await pool.query("UPDATE tenants SET terms = $2 WHERE id = $1", [req.tenant.id, terms.slice(0, 10000)]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not save settings" });
  }
});

// PUT /api/:tenantSlug/admin/sittings — replaces the full list of booking times
router.put("/sittings", async (req, res) => {
  const list = req.body;
  if (!Array.isArray(list) || list.length > 200) return res.status(400).json({ error: "Invalid booking times" });
  for (const s of list) {
    if (!UUID_RE.test(String(s.id)) || !isValidTime(s.time24)) {
      return res.status(400).json({ error: "Invalid booking time in the list" });
    }
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ids = list.map((s) => s.id);
    await client.query("DELETE FROM sittings WHERE tenant_id = $1 AND NOT (id = ANY($2::uuid[]))", [req.tenant.id, ids]);
    let order = 0;
    for (const s of list) {
      const days = Array.isArray(s.days) ? s.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : [];
      const maxCovers = s.maxCovers == null || s.maxCovers === "" ? null : Math.max(0, parseInt(s.maxCovers, 10) || 0);
      await client.query(
        `INSERT INTO sittings (id, tenant_id, label, time_of_day, sort_order, days, max_covers)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET label = $3, time_of_day = $4, sort_order = $5, days = $6, max_covers = $7
         WHERE sittings.tenant_id = $2`,
        [s.id, req.tenant.id, String(s.label || "").slice(0, 100), s.time24, order++, days, maxCovers]
      );
    }
    await client.query("COMMIT");
    const result = await pool.query("SELECT * FROM sittings WHERE tenant_id = $1 ORDER BY time_of_day, sort_order", [
      req.tenant.id,
    ]);
    res.json(result.rows.map(sittingOut));
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    res.status(500).json({ error: "Could not save booking times" });
  } finally {
    client.release();
  }
});

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// PUT /api/:tenantSlug/admin/floor { elements, roomSize, sections } — replaces the full floor plan
router.put("/floor", async (req, res) => {
  const { elements, roomSize, sections } = req.body || {};
  if (!Array.isArray(elements) || elements.length > 500) return res.status(400).json({ error: "Invalid floor plan" });
  for (const el of elements) {
    if (!UUID_RE.test(String(el.id)) || !["table", "wall"].includes(el.kind)) {
      return res.status(400).json({ error: "Invalid item in the floor plan" });
    }
  }
  const cleanSections =
    Array.isArray(sections) && sections.length
      ? sections.slice(0, 50).map((s) => ({ id: String(s.id).slice(0, 60), name: String(s.name || "").slice(0, 60) }))
      : [{ id: "main", name: "Main" }];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "UPDATE tenants SET room_width_px = $2, room_height_px = $3, sections = $4::jsonb WHERE id = $1",
      [
        req.tenant.id,
        Math.round(Math.min(3000, Math.max(200, num(roomSize?.w, 880)))),
        Math.round(Math.min(3000, Math.max(150, num(roomSize?.h, 380)))),
        JSON.stringify(cleanSections),
      ]
    );
    const ids = elements.map((e) => e.id);
    await client.query("DELETE FROM floor_elements WHERE tenant_id = $1 AND NOT (id = ANY($2::uuid[]))", [
      req.tenant.id,
      ids,
    ]);
    for (const el of elements) {
      const isTable = el.kind === "table";
      const seats = isTable ? Math.max(1, Math.round(num(el.seats, 2))) : null;
      await client.query(
        `INSERT INTO floor_elements
           (id, tenant_id, kind, shape, label, seats, x_pct, y_pct, width_px, height_px, rotation_deg,
            priority, min_party, max_party, section)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT (id) DO UPDATE SET
           kind = $3, shape = $4, label = $5, seats = $6, x_pct = $7, y_pct = $8, width_px = $9, height_px = $10,
           rotation_deg = $11, priority = $12, min_party = $13, max_party = $14, section = $15
         WHERE floor_elements.tenant_id = $2`,
        [
          el.id,
          req.tenant.id,
          el.kind,
          isTable && ["round", "square", "rect"].includes(el.shape) ? el.shape : null,
          String(el.label || "").slice(0, 60),
          seats,
          Math.min(100, Math.max(0, num(el.x))).toFixed(2),
          Math.min(100, Math.max(0, num(el.y))).toFixed(2),
          Math.round(Math.max(4, num(el.w, 60))),
          Math.round(Math.max(4, num(el.h, 60))),
          Math.round(num(el.rotation)) % 360,
          isTable && el.priority != null ? Math.round(num(el.priority)) : null,
          isTable && el.minParty != null ? Math.max(1, Math.round(num(el.minParty, 1))) : null,
          isTable && el.maxParty != null ? Math.max(1, Math.round(num(el.maxParty, seats))) : null,
          String(el.section || "main").slice(0, 60),
        ]
      );
    }
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    res.status(500).json({ error: "Could not save the floor plan" });
  } finally {
    client.release();
  }
});

module.exports = router;
