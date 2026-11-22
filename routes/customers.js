const express = require("express");
const router = express.Router({ mergeParams: true });
const pool = require("../db");

// GET /api/:tenantSlug/customers?search=graz
// Lookup/search customers by name, email, or phone (partial match).
// With no ?search, returns everyone, most recently booked first.
router.get("/", async (req, res) => {
  const { search } = req.query;
  try {
    const result = await pool.query(
      `SELECT c.id, c.name, c.email, c.phone, c.notes,
              COUNT(b.id) AS booking_count,
              MAX(b.booking_date) AS last_booking
       FROM customers c
       LEFT JOIN bookings b ON b.customer_id = c.id
       WHERE c.tenant_id = $1
         AND (
           $2::text IS NULL
           OR c.name ILIKE '%' || $2 || '%'
           OR c.email ILIKE '%' || $2 || '%'
           OR c.phone ILIKE '%' || $2 || '%'
         )
       GROUP BY c.id
       ORDER BY last_booking DESC NULLS LAST`,
      [req.tenant.id, search || null]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not search customers" });
  }
});

// GET /api/:tenantSlug/customers/:id — full profile + booking history
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const customerResult = await pool.query(
      `SELECT * FROM customers WHERE id = $1 AND tenant_id = $2`,
      [id, req.tenant.id]
    );
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const bookingsResult = await pool.query(
      `SELECT id, booking_date, party_size, status, arrived_guests, sitting_id, table_id, created_at
       FROM bookings
       WHERE customer_id = $1
       ORDER BY booking_date DESC`,
      [id]
    );

    res.json({ ...customerResult.rows[0], bookings: bookingsResult.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load customer" });
  }
});

// PATCH /api/:tenantSlug/customers/:id — update notes / name / phone
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const { name, phone, notes } = req.body;
  try {
    const result = await pool.query(
      `UPDATE customers
       SET name = COALESCE($1, name),
           phone = COALESCE($2, phone),
           notes = COALESCE($3, notes)
       WHERE id = $4 AND tenant_id = $5
       RETURNING *`,
      [name ?? null, phone ?? null, notes ?? null, id, req.tenant.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Customer not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update customer" });
  }
});

module.exports = router;
