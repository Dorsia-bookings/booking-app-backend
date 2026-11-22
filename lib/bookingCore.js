// Shared booking logic used by both the public booking page and the owner dashboard.
const { sittingAppliesOnDate, overlaps, findFreeTable, coversBooked } = require("./availability");

class BookingError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// Find the guest's customer record (by email, otherwise by phone) or create one.
async function resolveCustomer(client, tenantId, { name, email, phone }) {
  const cleanEmail = (email || "").trim().toLowerCase() || null;
  const cleanPhone = (phone || "").trim() || null;
  const cleanName = (name || "").trim() || null;

  if (cleanEmail) {
    const res = await client.query(
      `INSERT INTO customers (tenant_id, email, name, phone)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, email) DO UPDATE
         SET name = COALESCE(EXCLUDED.name, customers.name),
             phone = COALESCE(EXCLUDED.phone, customers.phone)
       RETURNING id`,
      [tenantId, cleanEmail, cleanName, cleanPhone]
    );
    return res.rows[0].id;
  }
  if (cleanPhone) {
    const found = await client.query(
      "SELECT id FROM customers WHERE tenant_id = $1 AND email IS NULL AND phone = $2 LIMIT 1",
      [tenantId, cleanPhone]
    );
    if (found.rows.length) {
      if (cleanName) await client.query("UPDATE customers SET name = $2 WHERE id = $1", [found.rows[0].id, cleanName]);
      return found.rows[0].id;
    }
  }
  const res = await client.query(
    "INSERT INTO customers (tenant_id, email, name, phone) VALUES ($1, NULL, $2, $3) RETURNING id",
    [tenantId, cleanName, cleanPhone]
  );
  return res.rows[0].id;
}

// Loads what's needed to check a date, while holding a per-restaurant lock so two
// bookings can't be checked and saved at the same moment.
async function lockAndLoad(client, tenantId, date, excludeBookingId) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [tenantId]);
  const sittings = await client.query("SELECT * FROM sittings WHERE tenant_id = $1", [tenantId]);
  const tables = await client.query("SELECT * FROM floor_elements WHERE tenant_id = $1 AND kind = 'table'", [tenantId]);
  const existing = await client.query(
    `SELECT * FROM bookings WHERE tenant_id = $1 AND booking_date = $2 AND status = 'confirmed'
       AND ($3::uuid IS NULL OR id <> $3)`,
    [tenantId, date, excludeBookingId || null]
  );
  const sittingsById = Object.fromEntries(sittings.rows.map((s) => [s.id, s]));
  return { sittingsById, tables: tables.rows, existing: existing.rows };
}

// Checks a draft booking ({booking_date, sitting_id, custom_time, duration_minutes, party_size, table_id})
// and returns the table it should go on. Throws BookingError if it can't be seated.
function placeBooking(draft, { sittingsById, tables, existing }, { enforceSittingDays }) {
  if (draft.sitting_id) {
    const sitting = sittingsById[draft.sitting_id];
    if (!sitting) throw new BookingError("That booking time no longer exists. Please pick another.");
    if (enforceSittingDays && !sittingAppliesOnDate(sitting, draft.booking_date)) {
      throw new BookingError("That time isn't available on this day.");
    }
    if (sitting.max_covers != null) {
      const already = coversBooked(existing, draft.sitting_id);
      if (already + draft.party_size > sitting.max_covers) {
        throw new BookingError("That time is fully booked for the number of guests. Try another time.", 409);
      }
    }
  } else if (!draft.custom_time) {
    throw new BookingError("Pick a time for the booking.");
  }

  if (draft.table_id) {
    const table = tables.find((t) => t.id === draft.table_id);
    if (!table) throw new BookingError("That table no longer exists.");
    if (existing.some((b) => overlaps(draft, b, sittingsById))) {
      throw new BookingError("That table is already booked for an overlapping time. Pick another table or time.", 409);
    }
    return table.id;
  }
  const table = findFreeTable(tables, existing, draft, draft.party_size, sittingsById);
  if (!table) throw new BookingError("We're fully booked for that time. Try another date or time.", 409);
  return table.id;
}

const BOOKING_SELECT = `
  SELECT b.*, c.name, c.email, c.phone
  FROM bookings b
  LEFT JOIN customers c ON c.id = b.customer_id`;

async function fetchBooking(db, tenantId, id) {
  const res = await db.query(`${BOOKING_SELECT} WHERE b.tenant_id = $1 AND b.id = $2`, [tenantId, id]);
  return res.rows[0] || null;
}

function isValidDate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}
function isValidTime(s) {
  return typeof s === "string" && /^\d{2}:\d{2}$/.test(s);
}

module.exports = {
  BookingError,
  resolveCustomer,
  lockAndLoad,
  placeBooking,
  BOOKING_SELECT,
  fetchBooking,
  isValidDate,
  isValidTime,
};
