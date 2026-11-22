// Owner dashboard: create, edit, cancel and check in bookings.
// Every route here requires a login (see server.js).
const express = require("express");
const router = express.Router({ mergeParams: true });
const pool = require("../db");
const { bookingOut } = require("../lib/shapes");
const { newReference, DEFAULT_DURATION } = require("../lib/availability");
const { refundPayment } = require("../lib/square");
const { requireOwner } = require("../middleware/auth");
const {
  BookingError,
  resolveCustomer,
  lockAndLoad,
  placeBooking,
  fetchBooking,
  isValidDate,
  isValidTime,
} = require("../lib/bookingCore");

const SOURCES = ["online", "phone", "walkin"];

function sendError(res, err, fallback) {
  if (err instanceof BookingError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: fallback });
}

function cleanArrived(arrived, partySize) {
  const out = Array(partySize).fill(false);
  if (Array.isArray(arrived)) arrived.slice(0, partySize).forEach((v, i) => (out[i] = Boolean(v)));
  return out;
}

// POST /api/:tenantSlug/admin/bookings — phone bookings and walk-ins
router.post("/", async (req, res) => {
  const t = req.tenant;
  const body = req.body || {};
  const size = parseInt(body.partySize, 10);
  const sittingId = body.customTime24 ? null : body.sitting || null;
  const customTime = body.customTime24 || null;

  if (!isValidDate(body.date) || !size || size < 1 || size > 100) {
    return res.status(400).json({ error: "Missing date or party size." });
  }
  if (customTime && !isValidTime(customTime)) return res.status(400).json({ error: "Invalid time." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ctx = await lockAndLoad(client, t.id, body.date);
    const draft = {
      booking_date: body.date,
      sitting_id: sittingId,
      custom_time: customTime,
      duration_minutes: Math.max(15, parseInt(body.durationMinutes, 10) || DEFAULT_DURATION),
      party_size: size,
      table_id: body.tableId || null,
    };
    draft.table_id = placeBooking(draft, ctx, { enforceSittingDays: false });

    const depositRequired = size >= t.deposit_threshold;
    const depositAmount = depositRequired ? size * Number(t.deposit_per_head) : 0;
    const customerId = await resolveCustomer(client, t.id, body);
    const inserted = await client.query(
      `INSERT INTO bookings
        (tenant_id, customer_id, table_id, sitting_id, custom_time, booking_date, party_size, duration_minutes,
         deposit_required, deposit_amount, deposit_paid, arrived_guests, notes, source, reference)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING id`,
      [
        t.id, customerId, draft.table_id, sittingId, customTime, body.date, size, draft.duration_minutes,
        depositRequired, depositAmount, depositRequired && Boolean(body.depositPaid),
        cleanArrived(body.arrived, size), String(body.notes || "").slice(0, 2000),
        SOURCES.includes(body.source) ? body.source : "phone", newReference(),
      ]
    );
    await client.query("COMMIT");
    res.status(201).json(bookingOut(await fetchBooking(pool, t.id, inserted.rows[0].id)));
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    sendError(res, err, "Could not create the booking");
  } finally {
    client.release();
  }
});

// PATCH /api/:tenantSlug/admin/bookings/:id — edit details, move tables, check guests in
router.patch("/:id", async (req, res) => {
  const t = req.tenant;
  const body = req.body || {};
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await fetchBooking(client, t.id, req.params.id);
    if (!current || current.status !== "confirmed") throw new BookingError("Booking not found", 404);

    const next = {
      booking_date: body.date !== undefined ? body.date : current.booking_date,
      sitting_id: current.sitting_id,
      custom_time: current.custom_time ? String(current.custom_time).slice(0, 5) : null,
      duration_minutes: body.durationMinutes !== undefined ? Math.max(15, parseInt(body.durationMinutes, 10) || DEFAULT_DURATION) : current.duration_minutes,
      party_size: body.partySize !== undefined ? parseInt(body.partySize, 10) : current.party_size,
      table_id: body.tableId !== undefined ? body.tableId || null : current.table_id,
    };
    if (body.customTime24 !== undefined || body.sitting !== undefined) {
      next.custom_time = body.customTime24 || null;
      next.sitting_id = next.custom_time ? null : body.sitting || null;
    }
    if (!isValidDate(next.booking_date) || !next.party_size || next.party_size < 1) {
      throw new BookingError("Invalid date or party size.");
    }
    if (next.custom_time && !isValidTime(next.custom_time)) throw new BookingError("Invalid time.");

    // Only re-check the table when something that affects seating changed.
    const seatingChanged =
      next.booking_date !== current.booking_date ||
      next.sitting_id !== current.sitting_id ||
      next.custom_time !== (current.custom_time ? String(current.custom_time).slice(0, 5) : null) ||
      next.duration_minutes !== current.duration_minutes ||
      next.party_size !== current.party_size ||
      next.table_id !== current.table_id;
    if (seatingChanged) {
      const ctx = await lockAndLoad(client, t.id, next.booking_date, current.id);
      next.table_id = placeBooking(next, ctx, { enforceSittingDays: false });
    }

    let customerId = current.customer_id;
    if (body.name !== undefined || body.email !== undefined || body.phone !== undefined) {
      customerId = await resolveCustomer(client, t.id, {
        name: body.name !== undefined ? body.name : current.name,
        email: body.email !== undefined ? body.email : current.email,
        phone: body.phone !== undefined ? body.phone : current.phone,
      });
    }

    const depositRequired = next.party_size >= t.deposit_threshold;
    const depositAmount = depositRequired ? next.party_size * Number(t.deposit_per_head) : 0;
    // A deposit actually paid by card stays paid even if staff untick the box.
    const depositPaid = current.payment_id
      ? true
      : depositRequired && (body.depositPaid !== undefined ? Boolean(body.depositPaid) : current.deposit_paid);
    const arrived = cleanArrived(body.arrived !== undefined ? body.arrived : current.arrived_guests, next.party_size);

    await client.query(
      `UPDATE bookings SET
         customer_id = $3, table_id = $4, sitting_id = $5, custom_time = $6, booking_date = $7,
         party_size = $8, duration_minutes = $9, deposit_required = $10,
         deposit_amount = CASE WHEN payment_id IS NOT NULL THEN deposit_amount ELSE $11 END,
         deposit_paid = $12, arrived_guests = $13, notes = $14, updated_at = now()
       WHERE tenant_id = $1 AND id = $2`,
      [
        t.id, current.id, customerId, next.table_id, next.sitting_id, next.custom_time, next.booking_date,
        next.party_size, next.duration_minutes, depositRequired || Boolean(current.payment_id), depositAmount,
        depositPaid, arrived, body.notes !== undefined ? String(body.notes).slice(0, 2000) : current.notes,
      ]
    );
    await client.query("COMMIT");
    res.json(bookingOut(await fetchBooking(pool, t.id, current.id)));
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    sendError(res, err, "Could not update the booking");
  } finally {
    client.release();
  }
});

// DELETE /api/:tenantSlug/admin/bookings/:id — cancels the booking (kept in history as cancelled)
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE bookings SET status = 'cancelled', updated_at = now()
       WHERE tenant_id = $1 AND id = $2 AND status = 'confirmed' RETURNING id`,
      [req.tenant.id, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Booking not found" });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err, "Could not cancel the booking");
  }
});

// POST /api/:tenantSlug/admin/bookings/:id/refund — gives a card deposit back through Square
router.post("/:id/refund", requireOwner, async (req, res) => {
  try {
    const b = await fetchBooking(pool, req.tenant.id, req.params.id);
    if (!b) return res.status(404).json({ error: "Booking not found" });
    if (!b.payment_id) return res.status(400).json({ error: "This deposit wasn't paid by card through Dorsia." });
    if (b.payment_refunded) return res.status(400).json({ error: "This deposit has already been refunded." });
    await refundPayment({ paymentId: b.payment_id, amount: Number(b.deposit_amount), reason: `Deposit refund ${b.reference}` });
    await pool.query("UPDATE bookings SET payment_refunded = true, updated_at = now() WHERE id = $1", [b.id]);
    res.json(bookingOut(await fetchBooking(pool, req.tenant.id, b.id)));
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: `Refund failed: ${err.message}` });
  }
});

module.exports = router;
