// Dashboard waiting list: walk-in queue and guests waiting for a full booking time.
// Every route here requires a login (see server.js).
const express = require("express");
const router = express.Router({ mergeParams: true });
const pool = require("../db");
const { requireOwner } = require("../middleware/auth");
const { todayIn } = require("../lib/availability");
const { BookingError, isValidDate } = require("../lib/bookingCore");
const { smsLive } = require("../lib/sms");
const { entryOut, offerEntry, notifyWalkIn } = require("../lib/waitlist");

function sendError(res, err, fallback) {
  if (err instanceof BookingError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: fallback });
}

async function fetchEntry(tenantId, id) {
  const r = await pool.query("SELECT * FROM waitlist_entries WHERE tenant_id = $1 AND id = $2", [tenantId, id]);
  return r.rows[0] || null;
}

// GET /api/:tenantSlug/admin/waitlist — everything from today on, plus settings and recent texts
router.get("/", async (req, res) => {
  const t = req.tenant;
  try {
    const [entries, texts] = await Promise.all([
      pool.query(
        `SELECT * FROM waitlist_entries WHERE tenant_id = $1 AND booking_date >= $2 AND status <> 'removed'
         ORDER BY created_at`,
        [t.id, todayIn(t.timezone)]
      ),
      pool.query(
        "SELECT to_phone, body, status, error, created_at FROM sms_messages WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 20",
        [t.id]
      ),
    ]);
    res.json({
      entries: entries.rows.map(entryOut),
      settings: { mode: t.waitlist_mode, offerMinutes: t.waitlist_offer_minutes },
      smsLive: smsLive(),
      texts: texts.rows.map((m) => ({ to: m.to_phone, body: m.body, status: m.status, error: m.error, at: m.created_at })),
    });
  } catch (err) {
    sendError(res, err, "Could not load the waitlist");
  }
});

// POST /api/:tenantSlug/admin/waitlist — staff add a walk-in or a guest waiting for a time
router.post("/", async (req, res) => {
  const t = req.tenant;
  const b = req.body || {};
  const kind = b.kind === "walkin" ? "walkin" : "waitlist";
  const size = parseInt(b.partySize, 10);
  const date = kind === "walkin" ? todayIn(t.timezone) : b.date;
  const name = String(b.name || "").trim();
  if (!name || !size || size < 1 || size > 100) return res.status(400).json({ error: "Add a name and party size." });
  if (!isValidDate(date)) return res.status(400).json({ error: "Pick a date." });
  if (kind === "waitlist" && !b.sittingId) return res.status(400).json({ error: "Pick a booking time." });
  try {
    const r = await pool.query(
      `INSERT INTO waitlist_entries (tenant_id, kind, name, phone, email, party_size, booking_date, sitting_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [t.id, kind, name.slice(0, 200), String(b.phone || "").trim().slice(0, 40), String(b.email || "").trim().toLowerCase() || null,
        size, date, kind === "waitlist" ? b.sittingId : null, String(b.notes || "").slice(0, 1000)]
    );
    res.status(201).json(entryOut(r.rows[0]));
  } catch (err) {
    sendError(res, err, "Could not add to the waitlist");
  }
});

// POST /:id/offer — text a waiting guest that a table is free
router.post("/:id/offer", async (req, res) => {
  try {
    res.json(entryOut(await offerEntry(req.tenant.id, req.params.id)));
  } catch (err) {
    sendError(res, err, "Could not send the offer");
  }
});

// POST /:id/notify — text a walk-in that their table is ready
router.post("/:id/notify", async (req, res) => {
  try {
    const { entry, sms } = await notifyWalkIn(req.tenant.id, req.params.id);
    if (sms.status === "failed") return res.status(502).json({ error: `Text not sent: ${sms.error}` });
    res.json(entryOut(entry));
  } catch (err) {
    sendError(res, err, "Could not send the text");
  }
});

// PATCH /:id { status } — mark seated, remove, or put back in the queue
router.patch("/:id", async (req, res) => {
  const status = (req.body || {}).status;
  if (!["seated", "removed", "waiting"].includes(status)) return res.status(400).json({ error: "Invalid status" });
  try {
    const entry = await fetchEntry(req.tenant.id, req.params.id);
    if (!entry) return res.status(404).json({ error: "Entry not found" });
    const r = await pool.query(
      `UPDATE waitlist_entries SET status = $2, updated_at = now(),
         offer_token = CASE WHEN $2 = 'waiting' THEN NULL ELSE offer_token END
       WHERE id = $1 RETURNING *`,
      [entry.id, status]
    );
    res.json(entryOut(r.rows[0]));
  } catch (err) {
    sendError(res, err, "Could not update the waitlist");
  }
});

// PUT /settings { mode: 'manual'|'auto', offerMinutes } — owners only
router.put("/settings", requireOwner, async (req, res) => {
  const { mode, offerMinutes } = req.body || {};
  const minutes = parseInt(offerMinutes, 10);
  if (!["manual", "auto"].includes(mode) || !minutes || minutes < 5 || minutes > 240) {
    return res.status(400).json({ error: "Choose manual or automatic, and a confirm time between 5 and 240 minutes." });
  }
  try {
    await pool.query("UPDATE tenants SET waitlist_mode = $2, waitlist_offer_minutes = $3 WHERE id = $1", [req.tenant.id, mode, minutes]);
    res.json({ mode, offerMinutes: minutes });
  } catch (err) {
    sendError(res, err, "Could not save waitlist settings");
  }
});

module.exports = router;
