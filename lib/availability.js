// Server-side copy of the booking app's table-allocation rules, so the server
// has the final say and two people can't grab the same table at once.

const DEFAULT_DURATION = 90;

function toMinutes(time) {
  if (!time) return null;
  const [h, m] = String(time).split(":").map(Number);
  return h * 60 + m;
}

function dayIndex(dateIso) {
  const js = new Date(dateIso + "T00:00:00Z").getUTCDay(); // 0=Sun
  return js === 0 ? 6 : js - 1; // 0=Mon..6=Sun
}

function sittingAppliesOnDate(sitting, dateIso) {
  if (!sitting.days || sitting.days.length === 0) return true;
  return sitting.days.includes(dayIndex(dateIso));
}

// b uses database column names: custom_time, sitting_id, duration_minutes, table_id
function startMinutes(b, sittingsById) {
  if (b.custom_time) return toMinutes(b.custom_time);
  const s = sittingsById[b.sitting_id];
  return s ? toMinutes(s.time_of_day) : null;
}

function overlaps(a, b, sittingsById) {
  if (a.booking_date !== b.booking_date || !a.table_id || a.table_id !== b.table_id) return false;
  const aStart = startMinutes(a, sittingsById);
  const bStart = startMinutes(b, sittingsById);
  if (aStart === null || bStart === null) return false;
  const aEnd = aStart + (a.duration_minutes || DEFAULT_DURATION);
  const bEnd = bStart + (b.duration_minutes || DEFAULT_DURATION);
  return aStart < bEnd && bStart < aEnd;
}

function tableFits(table, partySize) {
  const min = table.min_party ?? 1;
  const max = table.max_party ?? table.seats;
  return partySize >= min && partySize <= max && table.seats >= partySize;
}

function byPriority(a, b) {
  const pa = a.priority ?? 9999;
  const pb = b.priority ?? 9999;
  if (pa !== pb) return pa - pb;
  return a.seats - b.seats;
}

function findFreeTable(tables, existing, draft, partySize, sittingsById) {
  return (
    tables
      .filter((t) => t.kind === "table" && tableFits(t, partySize))
      .filter((t) => !existing.some((b) => overlaps({ ...draft, table_id: t.id }, b, sittingsById)))
      .sort(byPriority)[0] || null
  );
}

function coversBooked(existing, sittingId) {
  return existing.filter((b) => b.sitting_id === sittingId).reduce((sum, b) => sum + b.party_size, 0);
}

function todayIn(timezone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone || "Australia/Hobart" }).format(new Date());
}

function newReference() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "BK-";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

module.exports = {
  DEFAULT_DURATION,
  sittingAppliesOnDate,
  overlaps,
  tableFits,
  findFreeTable,
  coversBooked,
  todayIn,
  newReference,
};
