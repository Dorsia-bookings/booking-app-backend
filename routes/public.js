// Routes the public booking page uses. Nothing here returns guests' personal details.
const express = require("express");
const router = express.Router({ mergeParams: true });
const pool = require("../db");
const { sittingOut, slotOut } = require("../lib/shapes");
const { todayIn, newReference, DEFAULT_DURATION, tooLateToBook, BOOKING_CUTOFF_MINUTES } = require("../lib/availability");
const { publicSquareConfig, squareConfig, chargeDeposit, refundPayment } = require("../lib/square");
const { BookingError, resolveCustomer, lockAndLoad, placeBooking, isValidDate } = require("../lib/bookingCore");
const { tooManyAttempts, recordFailure } = require("../lib/rateLimit");
const { findOffer, acceptOffer, declineOffer, time12 } = require("../lib/waitlist");
const { cleanSite } = require("../lib/site");

// GET /api/:tenantSlug/public/config — restaurant name, times, tables, terms, deposit rules
router.get("/config", async (req, res) => {
  try {
    const t = req.tenant;
    const sittings = await pool.query(
      "SELECT * FROM sittings WHERE tenant_id = $1 ORDER BY time_of_day, sort_order",
      [t.id]
    );
    const tables = await pool.query(
      `SELECT id, seats, priority, min_party, max_party FROM floor_elements
       WHERE tenant_id = $1 AND kind = 'table'`,
      [t.id]
    );
    res.json({
      slug: t.slug,
      name: t.name,
      terms: t.terms || "",
      today: todayIn(t.timezone),
      depositThreshold: t.deposit_threshold,
      depositPerHead: Number(t.deposit_per_head),
      cutoffMinutes: BOOKING_CUTOFF_MINUTES,
      sittings: sittings.rows.map(sittingOut),
      tables: tables.rows.map((r) => ({
        id: r.id,
        kind: "table",
        seats: r.seats,
        priority: r.priority,
        minParty: r.min_party,
        maxParty: r.max_party,
      })),
      square: publicSquareConfig(),
      siteEnabled: Boolean(t.site_enabled && t.site),
      site: t.site_enabled && t.site ? cleanSite(t.site, t.name) : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load restaurant details" });
  }
});

// GET /api/:tenantSlug/public/availability — which tables are taken when, from today on (no names)
router.get("/availability", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT booking_date, sitting_id, custom_time, duration_minutes, table_id, party_size
       FROM bookings
       WHERE tenant_id = $1 AND status = 'confirmed' AND booking_date >= $2`,
      [req.tenant.id, todayIn(req.tenant.timezone)]
    );
    res.json(result.rows.map(slotOut));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load availability" });
  }
});

// POST /api/:tenantSlug/public/bookings — a guest books a table (and pays a deposit if required)
router.post("/bookings", async (req, res) => {
  const { date, sittingId, partySize, name, email, phone, notes, paymentToken } = req.body || {};
  const t = req.tenant;
  const size = parseInt(partySize, 10);

  if (!isValidDate(date) || !sittingId || !size || size < 1 || size > 50) {
    return res.status(400).json({ error: "Please choose a date, time and party size." });
  }
  if (!String(name || "").trim() || !String(email || "").trim() || !String(phone || "").trim()) {
    return res.status(400).json({ error: "Please fill in your name, email and phone." });
  }
  if (date < todayIn(t.timezone)) {
    return res.status(400).json({ error: "That date has already passed." });
  }

  const depositRequired = size >= t.deposit_threshold;
  const depositAmount = depositRequired ? size * Number(t.deposit_per_head) : 0;
  const square = squareConfig();
  if (depositRequired && square.enabled && !paymentToken) {
    return res.status(400).json({ error: "Card details are needed to pay the deposit." });
  }

  const client = await pool.connect();
  let payment = null;
  try {
    await client.query("BEGIN");
    const ctx = await lockAndLoad(client, t.id, date);
    const chosen = ctx.sittingsById[sittingId];
    if (chosen && tooLateToBook(t.timezone, date, chosen.time_of_day)) {
      throw new BookingError("That time has passed or is too soon to book online. Please pick a later time or call us.");
    }
    const draft = {
      booking_date: date,
      sitting_id: sittingId,
      custom_time: null,
      duration_minutes: DEFAULT_DURATION,
      party_size: size,
      table_id: null,
    };
    draft.table_id = placeBooking(draft, ctx, { enforceSittingDays: true });

    const reference = newReference();

    // Take the deposit only once a table is confirmed free.
    if (depositRequired && square.enabled) {
      try {
        payment = await chargeDeposit({
          sourceId: paymentToken,
          amount: depositAmount,
          email,
          reference,
          note: `${t.name} booking deposit ${reference} — ${date}, ${size} guests`,
        });
      } catch (err) {
        throw new BookingError(`Your card wasn't charged: ${err.message}`, 402);
      }
    }

    const customerId = await resolveCustomer(client, t.id, { name, email, phone });
    const inserted = await client.query(
      `INSERT INTO bookings
        (tenant_id, customer_id, table_id, sitting_id, booking_date, party_size, duration_minutes,
         deposit_required, deposit_amount, deposit_paid, payment_id, arrived_guests, notes, source, reference)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'online',$14)
       RETURNING id, reference, booking_date, sitting_id, party_size, deposit_required, deposit_amount, deposit_paid`,
      [
        t.id, customerId, draft.table_id, sittingId, date, size, DEFAULT_DURATION,
        depositRequired, depositAmount, Boolean(payment), payment ? payment.id : null,
        Array(size).fill(false), String(notes || "").slice(0, 2000), reference,
      ]
    );
    await client.query("COMMIT");

    const b = inserted.rows[0];
    res.status(201).json({
      reference: b.reference,
      date: b.booking_date,
      sitting: b.sitting_id,
      partySize: b.party_size,
      depositRequired: b.deposit_required,
      depositAmount: Number(b.deposit_amount),
      depositPaid: b.deposit_paid,
      receiptUrl: payment?.receipt_url || null,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    // If the card was charged but saving failed, give the money back.
    if (payment) {
      refundPayment({ paymentId: payment.id, amount: depositAmount, reason: "Booking could not be saved" }).catch((e) =>
        console.error("REFUND FAILED for payment", payment.id, e)
      );
    }
    if (err instanceof BookingError) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Sorry, something went wrong saving your booking. Please try again." });
  } finally {
    client.release();
  }
});

// POST /api/:tenantSlug/public/waitlist — a guest joins the waitlist for a full booking time
router.post("/waitlist", async (req, res) => {
  const t = req.tenant;
  const { date, sittingId, partySize, name, phone, email, notes } = req.body || {};
  const size = parseInt(partySize, 10);
  const limitKey = `waitlist:${t.id}:${req.ip}`;
  if (tooManyAttempts(limitKey)) return res.status(429).json({ error: "Too many requests. Please try again later." });
  if (!isValidDate(date) || !sittingId || !size || size < 1 || size > 50) {
    return res.status(400).json({ error: "Please choose a date, time and party size." });
  }
  if (!String(name || "").trim() || !String(phone || "").trim()) {
    return res.status(400).json({ error: "Please add your name and mobile number." });
  }
  if (date < todayIn(t.timezone)) return res.status(400).json({ error: "That date has already passed." });
  try {
    const sitting = await pool.query("SELECT id, time_of_day FROM sittings WHERE tenant_id = $1 AND id = $2", [t.id, sittingId]);
    if (!sitting.rows.length) return res.status(400).json({ error: "That booking time no longer exists." });
    if (tooLateToBook(t.timezone, date, sitting.rows[0].time_of_day)) {
      return res.status(400).json({ error: "That time has passed or is too soon. Please pick a later time." });
    }
    recordFailure(limitKey); // counts joins, not failures: at most 10 per 15 minutes from one connection
    const cleanPhone = String(phone).trim().slice(0, 40);
    const existing = await pool.query(
      `SELECT id FROM waitlist_entries WHERE tenant_id = $1 AND booking_date = $2 AND sitting_id = $3
         AND phone = $4 AND status = 'waiting'`,
      [t.id, date, sittingId, cleanPhone]
    );
    if (existing.rows.length) {
      await pool.query("UPDATE waitlist_entries SET party_size = $2, name = $3, updated_at = now() WHERE id = $1", [
        existing.rows[0].id, size, String(name).trim().slice(0, 200),
      ]);
    } else {
      await pool.query(
        `INSERT INTO waitlist_entries (tenant_id, kind, name, phone, email, party_size, booking_date, sitting_id, notes)
         VALUES ($1,'waitlist',$2,$3,$4,$5,$6,$7,$8)`,
        [t.id, String(name).trim().slice(0, 200), cleanPhone, String(email || "").trim().toLowerCase() || null,
          size, date, sittingId, String(notes || "").slice(0, 1000)]
      );
    }
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Sorry, something went wrong. Please try again." });
  }
});

// GET /api/:tenantSlug/public/offer/:token — what the text-message link shows
router.get("/offer/:token", async (req, res) => {
  try {
    const o = await findOffer(req.tenant.id, req.params.token);
    if (!o) return res.status(404).json({ error: "This link isn't valid." });
    const expired = o.status === "expired" || (o.status === "offered" && new Date(o.offer_expires_at) < new Date());
    res.json({
      restaurant: req.tenant.name,
      name: o.name,
      date: o.booking_date,
      time: time12(o.time_of_day),
      partySize: o.party_size,
      status: expired ? "expired" : o.status,
      expiresAt: o.offer_expires_at,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load this offer" });
  }
});

router.post("/offer/:token/accept", async (req, res) => {
  try {
    res.json(await acceptOffer(req.tenant, req.params.token));
  } catch (err) {
    if (err instanceof BookingError) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Sorry, something went wrong. Please try again." });
  }
});

router.post("/offer/:token/decline", async (req, res) => {
  try {
    await declineOffer(req.tenant, req.params.token);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof BookingError) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Sorry, something went wrong. Please try again." });
  }
});

module.exports = router;
