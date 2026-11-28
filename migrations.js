// Database changes that run automatically every time the server starts.
// Every statement is safe to run more than once, so nothing needs doing by hand.
const pool = require("./db");

const STATEMENTS = [
  // Restaurant-level settings
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS terms TEXT`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS sections JSONB NOT NULL DEFAULT '[{"id":"main","name":"Main"}]'::jsonb`,

  // Booking times: optional label, days of the week, cover limit
  `ALTER TABLE sittings ALTER COLUMN label SET DEFAULT ''`,
  `ALTER TABLE sittings ADD COLUMN IF NOT EXISTS days INTEGER[] NOT NULL DEFAULT '{}'`,
  `ALTER TABLE sittings ADD COLUMN IF NOT EXISTS max_covers INTEGER`,

  // Floor plan: auto-assign order, party size limits, room section
  `ALTER TABLE floor_elements ADD COLUMN IF NOT EXISTS priority INTEGER`,
  `ALTER TABLE floor_elements ADD COLUMN IF NOT EXISTS min_party INTEGER`,
  `ALTER TABLE floor_elements ADD COLUMN IF NOT EXISTS max_party INTEGER`,
  `ALTER TABLE floor_elements ADD COLUMN IF NOT EXISTS section TEXT NOT NULL DEFAULT 'main'`,

  // Walk-ins and phone bookings may have no email
  `ALTER TABLE customers ALTER COLUMN email DROP NOT NULL`,

  // Bookings: custom times, duration, notes, where it came from, short reference code
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS custom_time TIME`,
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS duration_minutes INTEGER NOT NULL DEFAULT 90`,
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'online'`,
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reference TEXT`,
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`,
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_id TEXT`,
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_refunded BOOLEAN NOT NULL DEFAULT false`,

  // Deleting a table or booking time keeps past bookings instead of failing
  `ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_table_id_fkey`,
  `ALTER TABLE bookings ADD CONSTRAINT bookings_table_id_fkey FOREIGN KEY (table_id) REFERENCES floor_elements(id) ON DELETE SET NULL`,
  `ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_sitting_id_fkey`,
  `ALTER TABLE bookings ADD CONSTRAINT bookings_sitting_id_fkey FOREIGN KEY (sitting_id) REFERENCES sittings(id) ON DELETE SET NULL`,

  `CREATE INDEX IF NOT EXISTS idx_sittings_tenant ON sittings(tenant_id)`,

  // Dorsia master login (sees every restaurant)
  `CREATE TABLE IF NOT EXISTS platform_admins (
     id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     email         TEXT UNIQUE NOT NULL,
     password_hash TEXT NOT NULL,
     created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,

  // Waiting list: guests waiting for a full booking time, and walk-ins waiting for a table
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS waitlist_mode TEXT NOT NULL DEFAULT 'manual'`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS waitlist_offer_minutes INTEGER NOT NULL DEFAULT 15`,
  `CREATE TABLE IF NOT EXISTS waitlist_entries (
     id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
     kind             TEXT NOT NULL DEFAULT 'waitlist',
     name             TEXT NOT NULL,
     phone            TEXT NOT NULL DEFAULT '',
     email            TEXT,
     party_size       INTEGER NOT NULL,
     booking_date     DATE NOT NULL,
     sitting_id       UUID REFERENCES sittings(id) ON DELETE SET NULL,
     notes            TEXT NOT NULL DEFAULT '',
     status           TEXT NOT NULL DEFAULT 'waiting',
     offer_token      TEXT UNIQUE,
     offer_expires_at TIMESTAMPTZ,
     offered_at       TIMESTAMPTZ,
     notified_at      TIMESTAMPTZ,
     booking_id       UUID REFERENCES bookings(id) ON DELETE SET NULL,
     created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_waitlist_tenant_date ON waitlist_entries(tenant_id, booking_date)`,
  `CREATE TABLE IF NOT EXISTS sms_messages (
     id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
     entry_id   UUID REFERENCES waitlist_entries(id) ON DELETE SET NULL,
     to_phone   TEXT NOT NULL,
     body       TEXT NOT NULL,
     status     TEXT NOT NULL,
     error      TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_sms_tenant ON sms_messages(tenant_id, created_at)`,

  // Restaurant website: settings and words live here; photos, PDFs and fonts live in file storage (S3)
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS site JSONB`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS site_enabled BOOLEAN NOT NULL DEFAULT false`,
  `CREATE TABLE IF NOT EXISTS site_files (
     id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
     kind         TEXT NOT NULL,
     name         TEXT NOT NULL DEFAULT '',
     content_type TEXT NOT NULL,
     size_bytes   INTEGER NOT NULL,
     width        INTEGER,
     height       INTEGER,
     storage      TEXT NOT NULL,
     storage_key  TEXT NOT NULL,
     created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_site_files_tenant ON site_files(tenant_id, created_at)`,
];

async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const sql of STATEMENTS) {
      await client.query(sql);
    }
    await client.query("COMMIT");
    console.log("Database migrations applied");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { runMigrations };
