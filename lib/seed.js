// Creates the restaurants Dorsia should have (currently Don Camillo) and gives any
// restaurant with an empty setup a starting floor plan and booking times.
// Runs on server start; never overwrites anything the owner has set up.
const pool = require("../db");
const { DEFAULT_TERMS, DEFAULT_SECTIONS, DEFAULT_FLOOR, GENERIC_SITTINGS, SEED_TENANTS } = require("./defaults");

async function seedTenant(client, tenantId, sittings) {
  const hasFloor = await client.query("SELECT 1 FROM floor_elements WHERE tenant_id = $1 LIMIT 1", [tenantId]);
  if (hasFloor.rows.length === 0) {
    let priority = 1;
    for (const el of DEFAULT_FLOOR) {
      await client.query(
        `INSERT INTO floor_elements
          (tenant_id, kind, shape, label, seats, x_pct, y_pct, width_px, height_px, rotation_deg, priority, min_party, max_party, section)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'main')`,
        [
          tenantId, el.kind, el.shape || null, el.label, el.seats || null, el.x, el.y, el.w, el.h, el.rotation || 0,
          el.kind === "table" ? priority++ : null, el.minParty || null, el.maxParty || null,
        ]
      );
    }
  }
  const hasSittings = await client.query("SELECT 1 FROM sittings WHERE tenant_id = $1 LIMIT 1", [tenantId]);
  if (hasSittings.rows.length === 0) {
    let order = 0;
    for (const s of sittings || GENERIC_SITTINGS) {
      await client.query(
        "INSERT INTO sittings (tenant_id, label, time_of_day, sort_order, days) VALUES ($1, '', $2, $3, $4)",
        [tenantId, s.time, order++, s.days]
      );
    }
  }
  await client.query(
    "UPDATE tenants SET terms = COALESCE(terms, $2), sections = COALESCE(sections, $3::jsonb) WHERE id = $1",
    [tenantId, DEFAULT_TERMS, JSON.stringify(DEFAULT_SECTIONS)]
  );
}

async function runSeed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // The old placeholder restaurant from early testing. Removed only if it has no bookings.
    await client.query(
      `DELETE FROM tenants t WHERE t.slug = 'wharf-and-vine'
         AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.tenant_id = t.id)`
    );

    for (const t of SEED_TENANTS) {
      const res = await client.query(
        `INSERT INTO tenants (slug, name) VALUES ($1, $2)
         ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug
         RETURNING id`,
        [t.slug, t.name]
      );
      await seedTenant(client, res.rows[0].id, t.sittings);
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { runSeed };
