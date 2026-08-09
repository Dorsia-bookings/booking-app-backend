const express = require("express");
const router = express.Router({ mergeParams: true });
const pool = require("../db");

// GET /api/:tenantSlug/bookings?date=2026-08-08
router.get("/", async (req, res) => {
  const { date } = req.query;
  try {
    const result = await pool.query(
      `SELECT b.*, c.name, c.email, c.phone
       FROM bookings b
       JOIN customers c ON c.id = b.customer_id
       WHERE b.tenant_id = $1 AND ($2::date IS NULL OR b.booking_date = $2)
       ORDER BY b.booking_date, b.created_at`,
      [req.tenant.id, date || null]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load bookings" });
  }
});

// POST /api/:tenantSlug/bookings — create a new booking
router.post("/", async (req, res) => {
  const { name, email, phone, date, sittingId, partySize, tableId } = req.body;
  if (!name || !email || !phone || !date || !partySize) {
    return res.status(400).json({ error: "Missing required booking details" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Find or create the customer record for this tenant
    const customerResult = await client.query(
      `INSERT INTO customers (tenant_id, email, name, phone)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, email) DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone
       RETURNING id`,
      [req.tenant.id, email, name, phone]
    );
    const customerId = customerResult.rows[0].id;

    const depositRequired = partySize >= req.tenant.deposit_threshold;
    const depositAmount = depositRequired ? partySize * req.tenant.deposit_per_head : 0;

    const bookingResult = await client.query(
      `INSERT INTO bookings
        (tenant_id, customer_id, table_id, sitting_id, booking_date, party_size,
         deposit_required, deposit_amount, arrived_guests)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        req.tenant.id,
        customerId,
        tableId || null,
        sittingId || null,
        date,
        partySize,
        depositRequired,
        depositAmount,
        Array(partySize).fill(false),
      ]
    );

    await client.query("COMMIT");
    res.status(201).json(bookingResult.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Could not create booking" });
  } finally {
    client.release();
  }
});

// PATCH /api/:tenantSlug/bookings/:id/arrival — toggle a single guest's check-in
router.patch("/:id/arrival", async (req, res) => {
  const { id } = req.params;
  const { guestIndex } = req.body;
  try {
    const result = await pool.query(
      `UPDATE bookings
       SET arrived_guests[$1 + 1] = NOT COALESCE(arrived_guests[$1 + 1], false)
       WHERE id = $2 AND tenant_id = $3
       RETURNING *`,
      [guestIndex, id, req.tenant.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update check-in status" });
  }
});

module.exports = router;
