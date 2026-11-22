// Waiting list logic: offering a freed-up table, guests accepting or declining,
// offers running out, and automatic offers when the restaurant has chosen that.
const crypto = require("crypto");
const pool = require("../db");
const { sendSms } = require("./sms");
const { todayIn, newReference, DEFAULT_DURATION } = require("./availability");
const { BookingError, resolveCustomer, lockAndLoad, placeBooking } = require("./bookingCore");

const ACTIVE = ["waiting", "offered", "notified"];
const OFFERABLE = ["waiting", "expired", "declined"];

// The web address used in text-message links. Render sets RENDER_EXTERNAL_URL itself.
let rememberedBase = null;
function rememberBase(req) {
  if (!rememberedBase && req.get("host")) rememberedBase = `${req.protocol}://${req.get("host")}`;
}
function baseUrl() {
  return (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || rememberedBase || "").replace(/\/$/, "");
}

function entryOut(r) {
  return {
    id: r.id,
    kind: r.kind,
    name: r.name,
    phone: r.phone || "",
    email: r.email || "",
    partySize: r.party_size,
    date: r.booking_date,
    sitting: r.sitting_id || "",
    notes: r.notes || "",
    status: r.status,
    offerExpiresAt: r.offer_expires_at,
    offeredAt: r.offered_at,
    notifiedAt: r.notified_at,
    bookingId: r.booking_id,
    createdAt: r.created_at,
  };
}

function time12(t) {
  if (!t) return "";
  const [h, m] = String(t).split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hh}:${String(m).padStart(2, "0")}${suffix}` : `${hh}${suffix}`;
}
function shortDate(iso) {
  const d = new Date(iso + "T00:00:00Z");
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}

// Same lock the booking code uses, so offers and bookings never clash.
async function lockRestaurant(client, tenantId) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [tenantId]);
}

async function loadTenant(db, tenantId) {
  const r = await db.query("SELECT * FROM tenants WHERE id = $1", [tenantId]);
  return r.rows[0];
}

// Offers a table to one waiting guest by text. Throws BookingError if no table is free.
async function offerEntry(tenantId, entryId) {
  const client = await pool.connect();
  let entry, tenant, sitting;
  try {
    await client.query("BEGIN");
    tenant = await loadTenant(client, tenantId);
    await lockRestaurant(client, tenantId);
    const found = await client.query("SELECT * FROM waitlist_entries WHERE tenant_id = $1 AND id = $2 FOR UPDATE", [tenantId, entryId]);
    entry = found.rows[0];
    if (!entry || entry.kind !== "waitlist") throw new BookingError("Waitlist entry not found", 404);
    if (!OFFERABLE.includes(entry.status)) throw new BookingError("This guest can't be offered a table right now.");
    if (!entry.sitting_id) throw new BookingError("That booking time no longer exists.");
    if (entry.booking_date < todayIn(tenant.timezone)) throw new BookingError("That date has passed.");
    if (!entry.phone) throw new BookingError("This guest has no phone number to text.");

    const day = await lockAndLoad(client, tenantId, entry.booking_date);
    sitting = day.sittingsById[entry.sitting_id];
    placeBooking(
      { booking_date: entry.booking_date, sitting_id: entry.sitting_id, custom_time: null, duration_minutes: DEFAULT_DURATION, party_size: entry.party_size, table_id: null },
      day,
      { enforceSittingDays: false }
    );

    const token = crypto.randomBytes(18).toString("base64url");
    const minutes = Math.max(5, tenant.waitlist_offer_minutes || 15);
    const updated = await client.query(
      `UPDATE waitlist_entries SET status = 'offered', offer_token = $2, offered_at = now(),
         offer_expires_at = now() + ($3 || ' minutes')::interval, updated_at = now()
       WHERE id = $1 RETURNING *`,
      [entry.id, token, String(minutes)]
    );
    entry = updated.rows[0];
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  const link = `${baseUrl()}/${tenant.slug}/offer/${entry.offer_token}`;
  const minutes = Math.max(5, tenant.waitlist_offer_minutes || 15);
  await sendSms({
    tenantId,
    entryId: entry.id,
    to: entry.phone,
    body: `${tenant.name}: a table for ${entry.party_size} is free on ${shortDate(entry.booking_date)} at ${time12(sitting?.time_of_day)}. Confirm within ${minutes} min: ${link}`,
  });
  return entry;
}

// Texts a walk-in that their table is ready.
async function notifyWalkIn(tenantId, entryId) {
  const tenant = await loadTenant(pool, tenantId);
  const found = await pool.query("SELECT * FROM waitlist_entries WHERE tenant_id = $1 AND id = $2", [tenantId, entryId]);
  const entry = found.rows[0];
  if (!entry) throw new BookingError("Entry not found", 404);
  if (!entry.phone) throw new BookingError("This guest has no phone number to text.");
  const result = await sendSms({
    tenantId,
    entryId,
    to: entry.phone,
    body: `${tenant.name}: your table is ready. Please come to the front desk.`,
  });
  const updated = await pool.query(
    "UPDATE waitlist_entries SET status = 'notified', notified_at = now(), updated_at = now() WHERE id = $1 RETURNING *",
    [entryId]
  );
  return { entry: updated.rows[0], sms: result };
}

async function findOffer(tenantId, token) {
  const r = await pool.query(
    `SELECT w.*, s.time_of_day FROM waitlist_entries w LEFT JOIN sittings s ON s.id = w.sitting_id
     WHERE w.tenant_id = $1 AND w.offer_token = $2`,
    [tenantId, token]
  );
  return r.rows[0] || null;
}

// Guest taps "Confirm" on the offer link: books the table if it's still free.
async function acceptOffer(tenant, token) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await lockRestaurant(client, tenant.id);
    const found = await client.query(
      "SELECT * FROM waitlist_entries WHERE tenant_id = $1 AND offer_token = $2 FOR UPDATE",
      [tenant.id, token]
    );
    const entry = found.rows[0];
    if (!entry) throw new BookingError("This link isn't valid.", 404);
    if (entry.status === "booked") throw new BookingError("This table is already confirmed.", 409);
    if (entry.status !== "offered" || new Date(entry.offer_expires_at) < new Date()) {
      throw new BookingError("Sorry, this offer has run out.", 410);
    }
    const day = await lockAndLoad(client, tenant.id, entry.booking_date);
    const draft = {
      booking_date: entry.booking_date,
      sitting_id: entry.sitting_id,
      custom_time: null,
      duration_minutes: DEFAULT_DURATION,
      party_size: entry.party_size,
      table_id: null,
    };
    try {
      draft.table_id = placeBooking(draft, day, { enforceSittingDays: false });
    } catch (e) {
      await client.query("UPDATE waitlist_entries SET status = 'waiting', offer_token = NULL, updated_at = now() WHERE id = $1", [entry.id]);
      await client.query("COMMIT");
      throw new BookingError("Sorry, that table has just been taken. You're still on the waitlist.", 409);
    }
    const size = entry.party_size;
    const depositRequired = size >= tenant.deposit_threshold;
    const depositAmount = depositRequired ? size * Number(tenant.deposit_per_head) : 0;
    const customerId = await resolveCustomer(client, tenant.id, { name: entry.name, email: entry.email, phone: entry.phone });
    const reference = newReference();
    const inserted = await client.query(
      `INSERT INTO bookings
        (tenant_id, customer_id, table_id, sitting_id, booking_date, party_size, duration_minutes,
         deposit_required, deposit_amount, deposit_paid, arrived_guests, notes, source, reference)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false,$10,$11,'waitlist',$12) RETURNING id`,
      [tenant.id, customerId, draft.table_id, entry.sitting_id, entry.booking_date, size, DEFAULT_DURATION,
        depositRequired, depositAmount, Array(size).fill(false), entry.notes || "", reference]
    );
    await client.query(
      "UPDATE waitlist_entries SET status = 'booked', booking_id = $2, updated_at = now() WHERE id = $1",
      [entry.id, inserted.rows[0].id]
    );
    await client.query("COMMIT");
    return { reference, depositRequired, depositAmount };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function declineOffer(tenant, token) {
  const r = await pool.query(
    `UPDATE waitlist_entries SET status = 'declined', updated_at = now()
     WHERE tenant_id = $1 AND offer_token = $2 AND status = 'offered' RETURNING *`,
    [tenant.id, token]
  );
  const entry = r.rows[0];
  if (!entry) throw new BookingError("This offer is no longer open.", 410);
  autoOfferForSlot(tenant.id, entry.booking_date, entry.sitting_id).catch((e) => console.error("Auto offer failed:", e));
  return entry;
}

// Automatic mode: offer a freed table to the first waiting guest it fits, one offer at a time.
async function autoOfferForSlot(tenantId, date, sittingId) {
  if (!date || !sittingId) return null;
  const tenant = await loadTenant(pool, tenantId);
  if (!tenant || tenant.waitlist_mode !== "auto") return null;
  if (date < todayIn(tenant.timezone)) return null;
  const open = await pool.query(
    `SELECT 1 FROM waitlist_entries WHERE tenant_id = $1 AND booking_date = $2 AND sitting_id = $3
       AND status = 'offered' AND offer_expires_at > now() LIMIT 1`,
    [tenantId, date, sittingId]
  );
  if (open.rows.length) return null;
  const waiting = await pool.query(
    `SELECT id FROM waitlist_entries WHERE tenant_id = $1 AND booking_date = $2 AND sitting_id = $3
       AND kind = 'waitlist' AND status = 'waiting' ORDER BY created_at`,
    [tenantId, date, sittingId]
  );
  for (const w of waiting.rows) {
    try {
      return await offerEntry(tenantId, w.id);
    } catch (e) {
      if (!(e instanceof BookingError)) throw e; // no table for this party size; try the next guest
    }
  }
  return null;
}

// Runs every minute: closes offers nobody answered and, in automatic mode, moves to the next guest.
async function expireOffers() {
  const r = await pool.query(
    `UPDATE waitlist_entries SET status = 'expired', updated_at = now()
     WHERE status = 'offered' AND offer_expires_at < now()
     RETURNING tenant_id, booking_date, sitting_id`
  );
  for (const e of r.rows) {
    await autoOfferForSlot(e.tenant_id, e.booking_date, e.sitting_id).catch((err) => console.error("Auto offer failed:", err));
  }
}

function startWaitlistTimer() {
  setInterval(() => expireOffers().catch((e) => console.error("Waitlist timer:", e)), 60 * 1000);
}

module.exports = {
  ACTIVE,
  entryOut,
  rememberBase,
  offerEntry,
  notifyWalkIn,
  findOffer,
  acceptOffer,
  declineOffer,
  autoOfferForSlot,
  expireOffers,
  startWaitlistTimer,
  time12,
};
