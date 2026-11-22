// Starting setup for a brand-new restaurant: a sample floor plan, booking
// times and terms. The owner changes all of these from the dashboard.

const DEFAULT_TERMS = `Bookings of 6 guests or more require a deposit of $20 per person to secure the table.

Please let us know of any dietary requirements when booking. We hold tables for 15 minutes past the booking time before releasing them.

Cancellations should be made at least 24 hours in advance where possible.`;

const DEFAULT_SECTIONS = [{ id: "main", name: "Main" }];

const DEFAULT_FLOOR = [
  { kind: "table", shape: "square", seats: 2, x: 10, y: 17, w: 60, h: 60, label: "Window 1", minParty: 1, maxParty: 2 },
  { kind: "table", shape: "square", seats: 2, x: 10, y: 36, w: 60, h: 60, label: "Window 2", minParty: 1, maxParty: 2 },
  { kind: "table", shape: "square", seats: 2, x: 10, y: 56, w: 60, h: 60, label: "Window 3", minParty: 1, maxParty: 2 },
  { kind: "table", shape: "rect", seats: 4, x: 36, y: 17, w: 90, h: 60, label: "T4", minParty: 1, maxParty: 4 },
  { kind: "table", shape: "rect", seats: 4, x: 36, y: 38, w: 90, h: 60, label: "T5", minParty: 1, maxParty: 4 },
  { kind: "table", shape: "rect", seats: 4, x: 36, y: 60, w: 90, h: 60, label: "T6", minParty: 1, maxParty: 4 },
  { kind: "table", shape: "round", seats: 6, x: 61, y: 24, w: 90, h: 90, label: "T7", minParty: 1, maxParty: 6 },
  { kind: "table", shape: "round", seats: 6, x: 61, y: 52, w: 90, h: 90, label: "T8", minParty: 1, maxParty: 6 },
  { kind: "table", shape: "rect", seats: 8, x: 85, y: 19, w: 140, h: 60, label: "The Long Table", minParty: 1, maxParty: 8 },
  { kind: "table", shape: "rect", seats: 4, x: 84, y: 62, w: 90, h: 60, label: "T10", minParty: 1, maxParty: 4 },
  { kind: "wall", x: 19, y: 3, w: 260, h: 8, rotation: 0, label: "" },
  { kind: "wall", x: 14, y: 79, w: 180, h: 8, rotation: 20, label: "" },
];

// Days: 0 = Monday ... 6 = Sunday
function times(from, to, step = 30) {
  const out = [];
  const [fh, fm] = from.split(":").map(Number);
  const [th, tm] = to.split(":").map(Number);
  for (let m = fh * 60 + fm; m <= th * 60 + tm; m += step) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
}

// Don Camillo's published hours (doncamillorestaurant.com, checked 22 Nov 2026):
// dinner Tue–Sat 5:30–9:30pm, Sun 5:30–8:30pm, Friday lunch 11:30am–2pm.
// Last booking is set one hour before closing.
const DON_CAMILLO_SITTINGS = [
  ...times("11:30", "13:00").map((t) => ({ time: t, days: [4] })),
  ...times("17:30", "20:30").map((t) => ({ time: t, days: [1, 2, 3, 4, 5] })),
  ...times("17:30", "19:30").map((t) => ({ time: t, days: [6] })),
];

// Merge identical times so each appears once with all its days.
function mergeSittings(list) {
  const byTime = {};
  list.forEach(({ time, days }) => {
    byTime[time] = Array.from(new Set([...(byTime[time] || []), ...days])).sort();
  });
  return Object.entries(byTime)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, days]) => ({ time, days: days.length === 7 ? [] : days }));
}

const GENERIC_SITTINGS = [
  { time: "18:00", days: [] },
  { time: "20:30", days: [] },
];

const SEED_TENANTS = [
  { slug: "don-camillo", name: "Don Camillo", sittings: mergeSittings(DON_CAMILLO_SITTINGS) },
];

module.exports = { DEFAULT_TERMS, DEFAULT_SECTIONS, DEFAULT_FLOOR, GENERIC_SITTINGS, SEED_TENANTS };
