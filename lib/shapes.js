// Converts database rows into the shapes the booking app uses, and back.

function trimTime(t) {
  return t ? String(t).slice(0, 5) : null;
}

function sittingOut(r) {
  return {
    id: r.id,
    time24: trimTime(r.time_of_day),
    label: r.label || "",
    maxCovers: r.max_covers ?? null,
    days: r.days || [],
  };
}

function elementOut(r) {
  return {
    id: r.id,
    kind: r.kind,
    shape: r.shape,
    seats: r.seats,
    x: Number(r.x_pct),
    y: Number(r.y_pct),
    w: r.width_px,
    h: r.height_px,
    rotation: r.rotation_deg,
    label: r.label || "",
    priority: r.priority,
    minParty: r.min_party,
    maxParty: r.max_party,
    section: r.section || "main",
  };
}

// Full booking, for the owner dashboard only (includes guest details).
function bookingOut(r) {
  return {
    id: r.id,
    reference: r.reference || r.id.slice(0, 8).toUpperCase(),
    date: r.booking_date,
    sitting: r.sitting_id || "",
    customTime24: trimTime(r.custom_time),
    durationMinutes: r.duration_minutes,
    partySize: r.party_size,
    name: r.name || "",
    email: r.email || "",
    phone: r.phone || "",
    notes: r.notes || "",
    tableId: r.table_id,
    depositRequired: r.deposit_required,
    depositAmount: Number(r.deposit_amount),
    depositPaid: r.deposit_paid,
    paidByCard: Boolean(r.payment_id),
    depositRefunded: Boolean(r.payment_refunded),
    status: r.status,
    source: r.source,
    createdAt: r.created_at,
    arrived: r.arrived_guests || [],
  };
}

// Booking with no personal details, for the public booking page's availability checks.
function slotOut(r) {
  return {
    date: r.booking_date,
    sitting: r.sitting_id || "",
    customTime24: trimTime(r.custom_time),
    durationMinutes: r.duration_minutes,
    tableId: r.table_id,
    partySize: r.party_size,
  };
}

module.exports = { sittingOut, elementOut, bookingOut, slotOut };
