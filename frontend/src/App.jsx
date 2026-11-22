import React, { useState, useEffect, useCallback, useRef } from "react";

/* ---------- Design tokens ----------
Ink      #1B2430  deep charcoal navy — owner side, headers
Paper    #F3ECDD  warm linen — customer side background
Wine     #6B2737  primary accent — action, selected
Wine Lt  #8B3A47  hover state
Brass    #B8894A  deposit / pending
Sage     #5F7A5C  confirmed / success
Slate    #9CA3AF  neutral / available
--------------------------------------- */

// Restaurant details come from the server when the page loads (see main.jsx).
let RESTAURANT_NAME = "";
let DEPOSIT_THRESHOLD = 6;
let DEPOSIT_PER_HEAD = 20;
export function setRestaurantInfo({ name, depositThreshold, depositPerHead }) {
  if (name) RESTAURANT_NAME = name;
  if (depositThreshold) DEPOSIT_THRESHOLD = depositThreshold;
  if (depositPerHead) DEPOSIT_PER_HEAD = depositPerHead;
}

const FLOOR_CANVAS_W = 880;
const FLOOR_CANVAS_H = 380;
const DEFAULT_ROOM_SIZE = { w: FLOOR_CANVAS_W, h: FLOOR_CANVAS_H };
function formatTime12(time24) {
  const [hStr, mStr] = time24.split(":");
  let h = parseInt(hStr, 10);
  const period = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${mStr} ${period}`;
}
function bookingTimeDisplay(b, sittings) {
  if (b.customTime24) return formatTime12(b.customTime24);
  const s = sittings.find((x) => x.id === b.sitting);
  return s ? formatTime12(s.time24) : "";
}
function bookingSlotKey(b) {
  return b.customTime24 ? `custom-${b.customTime24}` : b.sitting;
}
function sittingDisplay(s) {
  const t = formatTime12(s.time24);
  return s.label ? `${s.label} · ${t}` : t;
}
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function dateToDayIndex(dateIso) {
  const jsDay = new Date(dateIso + "T00:00:00").getDay(); // 0=Sun..6=Sat
  return jsDay === 0 ? 6 : jsDay - 1; // convert to 0=Mon..6=Sun
}
function sittingAppliesOnDate(sitting, dateIso) {
  if (!sitting.days || sitting.days.length === 0) return true; // no days set = every day
  return sitting.days.includes(dateToDayIndex(dateIso));
}
function sittingsForDate(sittings, dateIso) {
  return sittings.filter((s) => sittingAppliesOnDate(s, dateIso));
}
const DEFAULT_BOOKING_DURATION = 90; // minutes a table is considered occupied, unless the owner sets otherwise
function timeToMinutes(time24) {
  const [h, m] = time24.split(":").map(Number);
  return h * 60 + m;
}
function bookingStartMinutes(b, sittings) {
  if (b.customTime24) return timeToMinutes(b.customTime24);
  const s = sittings.find((x) => x.id === b.sitting);
  return s ? timeToMinutes(s.time24) : null;
}
function bookingEndMinutes(b, sittings) {
  const start = bookingStartMinutes(b, sittings);
  if (start === null) return null;
  return start + (b.durationMinutes || DEFAULT_BOOKING_DURATION);
}
function minutesToTime24(mins) {
  const wrapped = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
const OCCASION_TAGS = [
  { id: "birthday", icon: "🎂", label: "Birthday", keywords: ["birthday", "bday", "b-day"] },
  { id: "anniversary", icon: "💍", label: "Anniversary", keywords: ["anniversary"] },
  { id: "proposal", icon: "💐", label: "Proposal / engagement", keywords: ["proposal", "propose", "engagement", "engaged"] },
  { id: "allergy", icon: "⚠️", label: "Allergy", keywords: ["allerg", "anaphyl", "intoleran"] },
  { id: "wheelchair", icon: "♿", label: "Accessibility", keywords: ["wheelchair", "accessib", "mobility"] },
  { id: "highchair", icon: "🍼", label: "High chair / infant", keywords: ["high chair", "highchair", "baby", "infant", "bassinet"] },
  { id: "vip", icon: "⭐", label: "VIP / regular", keywords: ["vip", "regular guest", "loyal"] },
];

function getOccasionTags(notes) {
  if (!notes) return [];
  const lower = notes.toLowerCase();
  return OCCASION_TAGS.filter((tag) => tag.keywords.some((k) => lower.includes(k)));
}

// Recurring occasions (birthday, anniversary) are assumed to happen on the same
// month/day each year. Non-recurring ones (allergy, accessibility, VIP) aren't dated.
const RECURRING_OCCASION_IDS = ["birthday", "anniversary", "proposal"];

function daysUntilNextOccurrence(dateIso) {
  const noted = new Date(dateIso + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let next = new Date(today.getFullYear(), noted.getMonth(), noted.getDate());
  if (next < today) next = new Date(today.getFullYear() + 1, noted.getMonth(), noted.getDate());
  return Math.round((next - today) / 86400000);
}

// One row per occasion TYPE for this customer, using whichever booking most recently
// mentioned it (so re-mentioning an occasion updates the tracked date).
function getCustomerOccasions(customerBookings) {
  const byTag = {};
  customerBookings.forEach((b) => {
    getOccasionTags(b.notes).forEach((tag) => {
      if (!byTag[tag.id] || b.date > byTag[tag.id].date) {
        byTag[tag.id] = { ...tag, date: b.date };
      }
    });
  });
  return Object.values(byTag).map((o) => ({
    ...o,
    recurring: RECURRING_OCCASION_IDS.includes(o.id),
    daysUntil: RECURRING_OCCASION_IDS.includes(o.id) ? daysUntilNextOccurrence(o.date) : null,
  }));
}

function OccasionIcons({ notes, size }) {
  const tags = getOccasionTags(notes);
  if (tags.length === 0) return null;
  return (
    <span style={{ display: "inline-flex", gap: 2, marginLeft: 4 }}>
      {tags.map((t) => (
        <span key={t.id} title={t.label} style={{ fontSize: size || 12, lineHeight: 1 }}>
          {t.icon}
        </span>
      ))}
    </span>
  );
}

function bookingTimeRangeLabel(b, sittings) {
  const start = bookingStartMinutes(b, sittings);
  if (start === null) return "";
  const end = start + (b.durationMinutes || DEFAULT_BOOKING_DURATION);
  return `${formatTime12(minutesToTime24(start))} – ${formatTime12(minutesToTime24(end))}`;
}
function bookingsOverlap(a, b, sittings) {
  if (a.date !== b.date || a.tableId !== b.tableId) return false;
  const aStart = bookingStartMinutes(a, sittings);
  const aEnd = bookingEndMinutes(a, sittings);
  const bStart = bookingStartMinutes(b, sittings);
  const bEnd = bookingEndMinutes(b, sittings);
  if (aStart === null || bStart === null) return false;
  return aStart < bEnd && bStart < aEnd;
}
const DEFAULT_SECTIONS = [{ id: "main", name: "Main" }];

const DEFAULT_FLOOR_ELEMENTS = [
  { id: "T1", kind: "table", shape: "square", seats: 2, x: 10, y: 17, w: 60, h: 60, rotation: 0, label: "Window 1", priority: 1, minParty: 1, maxParty: 2, section: "main" },
  { id: "T2", kind: "table", shape: "square", seats: 2, x: 10, y: 36, w: 60, h: 60, rotation: 0, label: "Window 2", priority: 2, minParty: 1, maxParty: 2, section: "main" },
  { id: "T3", kind: "table", shape: "square", seats: 2, x: 10, y: 56, w: 60, h: 60, rotation: 0, label: "Window 3", priority: 3, minParty: 1, maxParty: 2, section: "main" },
  { id: "T4", kind: "table", shape: "rect", seats: 4, x: 36, y: 17, w: 90, h: 60, rotation: 0, label: "T4", priority: 4, minParty: 1, maxParty: 4, section: "main" },
  { id: "T5", kind: "table", shape: "rect", seats: 4, x: 36, y: 38, w: 90, h: 60, rotation: 0, label: "T5", priority: 5, minParty: 1, maxParty: 4, section: "main" },
  { id: "T6", kind: "table", shape: "rect", seats: 4, x: 36, y: 60, w: 90, h: 60, rotation: 0, label: "T6", priority: 6, minParty: 1, maxParty: 4, section: "main" },
  { id: "T7", kind: "table", shape: "round", seats: 6, x: 61, y: 24, w: 90, h: 90, rotation: 0, label: "T7", priority: 7, minParty: 1, maxParty: 6, section: "main" },
  { id: "T8", kind: "table", shape: "round", seats: 6, x: 61, y: 52, w: 90, h: 90, rotation: 0, label: "T8", priority: 8, minParty: 1, maxParty: 6, section: "main" },
  { id: "T9", kind: "table", shape: "rect", seats: 8, x: 85, y: 19, w: 140, h: 60, rotation: 0, label: "The Long Table", priority: 9, minParty: 1, maxParty: 8, section: "main" },
  { id: "T10", kind: "table", shape: "rect", seats: 4, x: 84, y: 62, w: 90, h: 60, rotation: 0, label: "T10", priority: 10, minParty: 1, maxParty: 4, section: "main" },
  { id: "W1", kind: "wall", x: 19, y: 3, w: 260, h: 8, rotation: 0, label: "", section: "main" },
  { id: "W2", kind: "wall", x: 14, y: 79, w: 180, h: 8, rotation: 20, label: "", section: "main" },
];

function coversBookedForSitting(bookings, date, sittingId, excludeBookingId) {
  return bookings
    .filter((b) => b.date === date && b.sitting === sittingId && b.id !== excludeBookingId)
    .reduce((sum, b) => sum + b.partySize, 0);
}
function tableFitsParty(table, partySize) {
  const min = table.minParty ?? 1;
  const max = table.maxParty ?? table.seats;
  return partySize >= min && partySize <= max && table.seats >= partySize;
}
function sortByPriority(tableList) {
  return [...tableList].sort((a, b) => {
    const pa = a.priority ?? 9999;
    const pb = b.priority ?? 9999;
    if (pa !== pb) return pa - pb;
    return a.seats - b.seats;
  });
}

function tablesFromElements(elements) {
  return elements.filter((e) => e.kind === "table");
}

// IDs are UUIDs so the server can store them directly.
function newElementId() {
  return crypto.randomUUID();
}

function localISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayISO() {
  return localISO(new Date());
}

export function fontStyles() {
  return `
    @import url('https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,500&family=Sora:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
    .wv-display { font-family: 'Newsreader', serif; }
    .wv-body { font-family: 'Sora', sans-serif; }
    .wv-mono { font-family: 'IBM Plex Mono', monospace; }
    .wv-scroll::-webkit-scrollbar { width: 6px; }
    .wv-scroll::-webkit-scrollbar-thumb { background: #C9BFA8; border-radius: 4px; }
  `;
}

function Badge({ tone, children }) {
  const tones = {
    sage: { bg: "#E7EEE6", fg: "#3F5A3D", dot: "#5F7A5C" },
    brass: { bg: "#F5EAD8", fg: "#7A5A28", dot: "#B8894A" },
    wine: { bg: "#F1E3E6", fg: "#6B2737", dot: "#6B2737" },
    slate: { bg: "#EEF0F2", fg: "#5B6572", dot: "#9CA3AF" },
  };
  const t = tones[tone] || tones.slate;
  return (
    <span
      className="wv-body"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        fontWeight: 600,
        padding: "3px 10px",
        borderRadius: 999,
        background: t.bg,
        color: t.fg,
        letterSpacing: "0.02em",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: t.dot }} />
      {children}
    </span>
  );
}

/* ============ CUSTOMER BOOKING FLOW ============ */

export function CustomerBooking({ bookings, tables, sittings, terms, square, onSubmit }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(() => {
    const date = todayISO();
    return {
      date,
      sitting: sittingsForDate(sittings, date)[0]?.id || "",
      partySize: 2,
      name: "",
      email: "",
      phone: "",
      notes: "",
    };
  });
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // When the date changes, make sure the chosen time is one that's offered that day.
  useEffect(() => {
    const todays = sittingsForDate(sittings, form.date);
    if (!todays.some((s) => s.id === form.sitting)) {
      setForm((f) => ({ ...f, sitting: todays[0]?.id || "" }));
    }
  }, [form.date, sittings]);

  const needsDeposit = form.partySize >= DEPOSIT_THRESHOLD;
  const depositAmount = needsDeposit ? form.partySize * DEPOSIT_PER_HEAD : 0;

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function findTable() {
    const draft = { date: form.date, sitting: form.sitting, customTime24: null, durationMinutes: DEFAULT_BOOKING_DURATION };
    const candidates = tables
      .filter((t) => tableFitsParty(t, form.partySize) && !bookings.some((b) => bookingsOverlap({ ...draft, tableId: t.id }, b, sittings)));
    return sortByPriority(candidates)[0] || null;
  }

  function handleStep1Continue() {
    setError("");
    if (!form.sitting) {
      setError("There are no booking times on this day. Please choose another date.");
      return;
    }
    const activeSitting = sittings.find((s) => s.id === form.sitting);
    if (activeSitting && activeSitting.maxCovers != null) {
      const already = coversBookedForSitting(bookings, form.date, form.sitting);
      if (already + form.partySize > activeSitting.maxCovers) {
        setError(`That time is fully booked for the number of guests we can seat. Try another time.`);
        return;
      }
    }
    const table = findTable();
    if (!table) {
      setError(`Fully booked for ${sittingLabel} on ${form.date}. Try another date or sitting.`);
      return;
    }
    setStep(2);
  }

  function handleDetailsNext() {
    setError("");
    if (!form.name.trim() || !form.email.trim() || !form.phone.trim()) {
      setError("Please fill in your name, email and phone so we can confirm your table.");
      return;
    }
    const table = findTable();
    if (!table) {
      setError(`We're fully booked for that time on ${form.date}. Try another date or sitting.`);
      return;
    }
    if (needsDeposit) {
      setStep(3);
    } else {
      finalize(null);
    }
  }

  // Sends the booking to the server, which picks the table and (if needed) charges the deposit.
  async function finalize(paymentToken) {
    setError("");
    setSubmitting(true);
    try {
      const result = await onSubmit({
        date: form.date,
        sittingId: form.sitting,
        partySize: form.partySize,
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        notes: form.notes,
        paymentToken,
      });
      setConfirmed({ ...result, email: form.email.trim(), notes: form.notes });
      setStep(4);
    } catch (e) {
      setError(e.message || "Something went wrong. Please try again.");
      if (e.status === 409) setStep(1);
    } finally {
      setSubmitting(false);
    }
  }

  const selectedSitting = sittings.find((s) => s.id === form.sitting);
  const sittingLabel = selectedSitting ? sittingDisplay(selectedSitting) : "";
  const sittingTime = selectedSitting ? formatTime12(selectedSitting.time24) : "";

  return (
    <div
      className="wv-body"
      style={{
        minHeight: "100%",
        background: "#F3ECDD",
        color: "#2A2420",
        display: "flex",
        justifyContent: "center",
        padding: "48px 20px 80px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 480 }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div className="wv-mono" style={{ fontSize: 11, letterSpacing: "0.2em", color: "#8B7A5E", marginBottom: 10 }}>
            RESERVATIONS
          </div>
          <h1 className="wv-display" style={{ fontSize: 40, fontWeight: 500, margin: 0, color: "#1B2430" }}>
            {RESTAURANT_NAME}
          </h1>
          <div style={{ height: 1, width: 48, background: "#B8894A", margin: "16px auto" }} />
        </div>

        {step < 4 && (
          <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 32 }}>
            {[1, 2, 3].filter((n) => n !== 3 || needsDeposit).map((n, i, arr) => (
              <div
                key={n}
                style={{
                  width: 28,
                  height: 2,
                  background: step >= n ? "#6B2737" : "#D9CDB0",
                  transition: "background 0.2s",
                }}
              />
            ))}
          </div>
        )}

        {step === 1 && (
          <div style={cardStyle}>
            <Field label="Date">
              <input
                type="date"
                min={todayISO()}
                value={form.date}
                onChange={(e) => set("date", e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label="Time">
              {(() => {
                const todaysSittings = sittingsForDate(sittings, form.date);
                return todaysSittings.length === 0 ? (
                  <div style={{ fontSize: 13, color: "#963B3B" }}>No booking times available on this day.</div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 8 }}>
                    {todaysSittings.map((s) => (
                      <button
                        type="button"
                        key={s.id}
                        onClick={() => set("sitting", s.id)}
                        className="wv-mono"
                        style={{
                          padding: "10px 8px",
                          borderRadius: 999,
                          border: form.sitting === s.id ? "1.5px solid #6B2737" : "1.5px solid #DCD0B4",
                          background: form.sitting === s.id ? "#6B2737" : "#FBF8F0",
                          color: form.sitting === s.id ? "#FBF8F0" : "#2A2420",
                          cursor: "pointer",
                          fontSize: 13,
                          fontWeight: 600,
                          textAlign: "center",
                        }}
                      >
                        {sittingDisplay(s)}
                      </button>
                    ))}
                  </div>
                );
              })()}
            </Field>
            <Field label="Party size">
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <button type="button" onClick={() => set("partySize", Math.max(1, form.partySize - 1))} style={stepperBtn}>−</button>
                <div className="wv-mono" style={{ fontSize: 20, width: 32, textAlign: "center" }}>{form.partySize}</div>
                <button type="button" onClick={() => set("partySize", Math.min(12, form.partySize + 1))} style={stepperBtn}>+</button>
                <span style={{ fontSize: 13, color: "#8B7A5E" }}>guests</span>
              </div>
              {needsDeposit && (
                <div style={{ marginTop: 10 }}>
                  <Badge tone="brass">Deposit required for groups of {DEPOSIT_THRESHOLD}+</Badge>
                </div>
              )}
            </Field>
            {error && <ErrorText>{error}</ErrorText>}
            <SubmitButton onClick={handleStep1Continue}>Next</SubmitButton>
          </div>
        )}

        {step === 2 && (
          <div style={cardStyle}>
            <SummaryStrip date={form.date} sittingLabel={sittingLabel} partySize={form.partySize} />
            {terms && terms.trim() && (
              <div
                style={{
                  background: "#FBF8F0",
                  border: "1px solid #E7DBC0",
                  borderRadius: 8,
                  padding: "12px 14px",
                  marginBottom: 20,
                  maxHeight: 160,
                  overflowY: "auto",
                }}
              >
                <div className="wv-mono" style={{ fontSize: 10, letterSpacing: "0.1em", color: "#8B7A5E", marginBottom: 8 }}>
                  TERMS & CONDITIONS
                </div>
                <div style={{ fontSize: 12.5, lineHeight: 1.6, color: "#5B5145", whiteSpace: "pre-wrap" }}>
                  {terms}
                </div>
              </div>
            )}
            <Field label="Full name">
              <input value={form.name} onChange={(e) => set("name", e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Email">
              <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Phone">
              <input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Notes (optional)">
              <textarea
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="e.g. allergies, celebrating a birthday, high chair needed..."
                style={{ ...inputStyle, minHeight: 70, resize: "vertical", fontFamily: "inherit" }}
              />
            </Field>
            {needsDeposit && (
              <div style={{ background: "#F5EAD8", border: "1px solid #E3D2AE", borderRadius: 8, padding: "12px 14px", fontSize: 13, color: "#7A5A28", marginBottom: 20 }}>
                Groups of {DEPOSIT_THRESHOLD} or more require a ${depositAmount} deposit to confirm.
              </div>
            )}
            {error && <ErrorText>{error}</ErrorText>}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <SubmitButton onClick={handleDetailsNext} disabled={submitting}>
                {submitting ? "Booking..." : needsDeposit ? "Continue to deposit" : "Confirm booking"}
              </SubmitButton>
              <BackButton onClick={() => setStep(1)} />
            </div>
          </div>
        )}

        {step === 3 && needsDeposit && (
          <div style={cardStyle}>
            <SummaryStrip date={form.date} sittingLabel={sittingLabel} partySize={form.partySize} />
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
              Deposit: <span className="wv-mono">${depositAmount}</span>
            </div>
            {square && square.enabled ? (
              <SquareCardForm
                square={square}
                amount={depositAmount}
                contact={form}
                submitting={submitting}
                error={error}
                setError={setError}
                onToken={(token) => finalize(token)}
                onBack={() => setStep(2)}
              />
            ) : (
              <>
                <div style={{ fontSize: 13, color: "#5B5145", lineHeight: 1.6, marginBottom: 16 }}>
                  The restaurant will contact you to take the deposit and confirm your table.
                </div>
                {error && <ErrorText>{error}</ErrorText>}
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <SubmitButton onClick={() => finalize(null)} disabled={submitting}>
                    {submitting ? "Booking..." : "Request booking"}
                  </SubmitButton>
                  <BackButton onClick={() => setStep(2)} />
                </div>
              </>
            )}
          </div>
        )}

        {step === 4 && confirmed && (
          <div style={{ ...cardStyle, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 6 }}>✓</div>
            <h2 className="wv-display" style={{ fontSize: 24, margin: "0 0 6px", color: "#1B2430" }}>Booking confirmed</h2>
            <div className="wv-mono" style={{ fontSize: 13, color: "#8B7A5E", marginBottom: 20 }}>{confirmed.reference}</div>
            <div style={{ textAlign: "left", background: "#FBF8F0", borderRadius: 8, padding: 16, marginBottom: 20 }}>
              <Row label="Date" value={friendlyDate(confirmed.date)} />
              <Row label="Time" value={sittingTime} />
              <Row label="Guests" value={confirmed.partySize} />
              {confirmed.depositRequired && (
                <Row label="Deposit" value={confirmed.depositPaid ? `$${confirmed.depositAmount} paid` : `$${confirmed.depositAmount} — the restaurant will be in touch`} />
              )}
              {confirmed.notes && confirmed.notes.trim() && <Row label="Notes" value={confirmed.notes} />}
            </div>
            {confirmed.receiptUrl && (
              <div style={{ marginBottom: 14 }}>
                <a href={confirmed.receiptUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: "#6B2737" }}>
                  View your deposit receipt
                </a>
              </div>
            )}
            <div style={{ fontSize: 13, color: "#5B5145", lineHeight: 1.6 }}>
              Please keep your booking reference. To change or cancel, contact {RESTAURANT_NAME} directly.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 14 }}>
      <span style={{ color: "#8B7A5E" }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function SummaryStrip({ date, sittingLabel, partySize }) {
  return (
    <div
      className="wv-mono"
      style={{
        display: "flex",
        justifyContent: "space-between",
        fontSize: 12,
        color: "#8B7A5E",
        background: "#FBF8F0",
        borderRadius: 8,
        padding: "10px 14px",
        marginBottom: 20,
      }}
    >
      <span>{friendlyDate(date)}</span>
      <span>{sittingLabel}</span>
      <span>{partySize} guests</span>
    </div>
  );
}

function Field({ label, children, style }) {
  return (
    <div style={{ marginBottom: 18, ...style }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#5B5145", marginBottom: 6, letterSpacing: "0.02em" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function ErrorText({ children }) {
  return (
    <div style={{ fontSize: 13, color: "#963B3B", background: "#FBEAEA", border: "1px solid #EFC9C9", borderRadius: 8, padding: "10px 12px", marginBottom: 16 }}>
      {children}
    </div>
  );
}

function SubmitButton({ children, onClick, disabled }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{ ...submitBtnStyle, opacity: disabled ? 0.6 : 1, cursor: disabled ? "default" : "pointer" }}>
      {children}
    </button>
  );
}

// Loads Square's card form script once per page.
let squareScriptPromise = null;
function loadSquareScript(environment) {
  if (window.Square) return Promise.resolve(window.Square);
  if (!squareScriptPromise) {
    squareScriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = environment === "production" ? "https://web.squarecdn.com/v1/square.js" : "https://sandbox.web.squarecdn.com/v1/square.js";
      s.onload = () => resolve(window.Square);
      s.onerror = () => {
        squareScriptPromise = null;
        reject(new Error("Couldn't load the card form. Check your connection and try again."));
      };
      document.head.appendChild(s);
    });
  }
  return squareScriptPromise;
}

// Square's secure card field. Card numbers go straight to Square; Dorsia only receives a one-time token.
function SquareCardForm({ square, amount, contact, submitting, error, setError, onToken, onBack }) {
  const containerRef = useRef(null);
  const cardRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const Square = await loadSquareScript(square.environment);
        if (cancelled) return;
        const payments = Square.payments(square.applicationId, square.locationId);
        const card = await payments.card();
        if (cancelled) {
          card.destroy();
          return;
        }
        await card.attach(containerRef.current);
        cardRef.current = card;
        setReady(true);
      } catch (e) {
        if (!cancelled) setError(e.message || "Couldn't load the card form.");
      }
    })();
    return () => {
      cancelled = true;
      if (cardRef.current) cardRef.current.destroy().catch?.(() => {});
      cardRef.current = null;
    };
  }, [square.environment, square.applicationId, square.locationId]);

  async function pay() {
    if (!cardRef.current) return;
    setError("");
    setBusy(true);
    try {
      const [givenName, ...rest] = contact.name.trim().split(/\s+/);
      const result = await cardRef.current.tokenize({
        amount: Number(amount).toFixed(2),
        billingContact: {
          givenName: givenName || "",
          familyName: rest.join(" "),
          email: contact.email.trim(),
          phone: contact.phone.trim(),
          countryCode: "AU",
        },
        currencyCode: "AUD",
        intent: "CHARGE",
        customerInitiated: true,
        sellerKeyedIn: false,
      });
      if (result.status === "OK") {
        await onToken(result.token);
      } else {
        const msg = result.errors?.[0]?.message || "Please check your card details.";
        setError(msg);
      }
    } catch (e) {
      setError(e.message || "Card payment failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div ref={containerRef} style={{ minHeight: 90, marginBottom: 8 }} />
      {!ready && !error && <div style={{ fontSize: 12, color: "#8B7A5E", marginBottom: 12 }}>Loading secure card form...</div>}
      {square.environment !== "production" && (
        <div style={{ fontSize: 11, color: "#8B7A5E", marginBottom: 12 }}>
          Test mode: no real money is charged. Use card 4111 1111 1111 1111, any future expiry, CVV 111 and any postcode.
        </div>
      )}
      {error && <ErrorText>{error}</ErrorText>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <SubmitButton onClick={pay} disabled={!ready || busy || submitting}>
          {busy || submitting ? "Processing..." : `Pay $${amount} deposit and confirm`}
        </SubmitButton>
        <BackButton onClick={onBack} />
      </div>
    </>
  );
}

function BackButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ ...submitBtnStyle, flex: "0 0 auto", background: "transparent", color: "#8B7A5E", border: "1.5px solid #DCD0B4" }}
    >
      Back
    </button>
  );
}

const cardStyle = {
  background: "#FFFDF8",
  border: "1px solid #E7DBC0",
  borderRadius: 14,
  padding: 28,
  boxShadow: "0 1px 3px rgba(27,36,48,0.06)",
};

const inputStyle = {
  width: "100%",
  padding: "11px 12px",
  borderRadius: 8,
  border: "1.5px solid #DCD0B4",
  background: "#FBF8F0",
  fontSize: 14,
  color: "#2A2420",
  fontFamily: "inherit",
  boxSizing: "border-box",
  outline: "none",
};

const stepperBtn = {
  width: 34,
  height: 34,
  borderRadius: 8,
  border: "1.5px solid #DCD0B4",
  background: "#FBF8F0",
  fontSize: 18,
  cursor: "pointer",
  color: "#2A2420",
};

const submitBtnStyle = {
  flex: 1,
  width: "100%",
  padding: "13px 16px",
  borderRadius: 8,
  border: "none",
  background: "#6B2737",
  color: "#FBF8F0",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

/* ============ OWNER DASHBOARD (matches Rewind Library design system) ============ */

const LIB_TOKENS = `
  .lib-scope {
    --bg: #000000;
    --panel: #1C1C1E;
    --panel-raised: #2C2C2E;
    --border: #38383A;
    --text: #FFFFFF;
    --text-dim: #98989D;
    --text-faint: #636366;
    --accent: #0A84FF;
    --danger: #FF453A;
    --success: #34C759;
    --warning: #FF9F0A;
    --font-body: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  }
  .lib-scope[data-theme="light"] {
    --bg: #FFFFFF;
    --panel: #F2F2F7;
    --panel-raised: #E5E5EA;
    --border: #D1D1D6;
    --text: #000000;
    --text-dim: #6D6D72;
    --text-faint: #AEAEB2;
    --accent: #007AFF;
    --danger: #FF3B30;
    --success: #30D158;
    --warning: #FF9500;
  }
  .lib-scope * { box-sizing: border-box; }
  .lib-scope { font-family: var(--font-body); background: var(--bg); color: var(--text); }
  .lib-scope ::-webkit-scrollbar { width: 8px; height: 8px; }
  .lib-scope ::-webkit-scrollbar-track { background: transparent; }
  .lib-scope ::-webkit-scrollbar-thumb { background-color: var(--text-faint); border-radius: 999px; }
  .lib-pill {
    padding: 8px 16px; border-radius: 999px; font-size: 13px; font-weight: 600;
    background: var(--panel-raised); color: var(--text-dim); border: none; cursor: pointer;
    font-family: inherit; white-space: nowrap;
  }
  .lib-pill.is-active { background: var(--accent); color: #fff; }
  .lib-icon-btn {
    background: none; border: none; color: var(--text); padding: 8px; cursor: pointer;
    display: flex; align-items: center; justify-content: center; border-radius: 8px;
  }
  .lib-icon-btn:hover { background: var(--panel); }
  .lib-icon-btn.is-active { background: var(--accent); color: #fff; }
  .lib-nav-row {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 9px 14px; border-radius: 10px; cursor: pointer; font-size: 13px; color: var(--text);
  }
  .lib-nav-row:hover { background: var(--panel); }
  .lib-nav-row.is-active { background: var(--panel-raised); }
  .lib-badge {
    display: inline-flex; align-items: center; padding: 2px 9px; border-radius: 999px;
    font-size: 11px; font-weight: 700; letter-spacing: 0.02em;
  }
  .lib-card {
    background: var(--panel); border: 1px solid var(--border); border-radius: 14px;
    overflow: hidden; cursor: pointer; transition: border-color 0.15s ease;
  }
  .lib-card:hover { border-color: var(--text-faint); }
  .lib-card.is-selected { border-color: var(--accent); }
`;

function dayLabel(iso) {
  const d = new Date(iso + "T00:00:00");
  const today = todayISO();
  if (iso === today) return "Today";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function upcomingDates(n) {
  const out = [];
  const base = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    out.push(localISO(d));
  }
  return out;
}

function shiftDate(iso, delta) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return localISO(d);
}

function formatDMY(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function friendlyDate(iso) {
  const d = new Date(iso + "T00:00:00");
  const weekday = d.toLocaleDateString(undefined, { weekday: "short" });
  return `${weekday} ${d.getDate()}-${d.getMonth() + 1}-${d.getFullYear()}`;
}

function arrivedArray(b) {
  if (Array.isArray(b.arrived) && b.arrived.length === b.partySize) return b.arrived;
  return Array(b.partySize).fill(false);
}

function statusOf(booking) {
  if (!booking) return { tone: "faint", label: "Available" };
  if (booking.depositRequired && !booking.depositPaid) return { tone: "warning", label: "Deposit pending" };
  return { tone: "success", label: "Confirmed" };
}

export function OwnerDashboard({ bookings, floorElements, setFloorElements, roomSize, setRoomSize, sittings, setSittings, terms, setTerms, sections, setSections, addBooking, removeBooking, updateBooking, toggleArrival, setArrivalAll, customerNotes, setCustomerNote, refundDeposit, onLogout, userEmail, bookingPageUrl }) {
  const [date, setDate] = useState(todayISO());
  const [sitting, setSitting] = useState(sittings[0]?.id || "");
  const [view, setView] = useState("timeline");
  const [theme, setTheme] = useState("dark");
  const [selectedTable, setSelectedTable] = useState(null);
  const [customersOpen, setCustomersOpen] = useState(false);
  const [customerPortalInitialEmail, setCustomerPortalInitialEmail] = useState(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [newBookingOpen, setNewBookingOpen] = useState(false);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [editingBookingId, setEditingBookingId] = useState(null);
  const [timeSlotsOpen, setTimeSlotsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [floorSection, setFloorSection] = useState(sections[0]?.id || "main");

  useEffect(() => {
    if (sections.length && !sections.some((s) => s.id === floorSection)) {
      setFloorSection(sections[0].id);
    }
  }, [sections, floorSection]);

  const tables = tablesFromElements(floorElements);
  const walls = floorElements.filter((e) => e.kind === "wall");
  const sectionTables = tables.filter((t) => (t.section || "main") === floorSection);
  const sectionWalls = walls.filter((w) => (w.section || "main") === floorSection);

  const dayBookings = bookings.filter((b) => b.date === date);
  const sittingBookings = dayBookings.filter((b) => b.sitting === sitting);

  const totalGuests = dayBookings.reduce((s, b) => s + b.partySize, 0);

  function bookingsForTableToday(tableId) {
    return dayBookings
      .filter((b) => b.tableId === tableId)
      .sort((a, b) => (bookingStartMinutes(a, sittings) ?? 0) - (bookingStartMinutes(b, sittings) ?? 0));
  }

  return (
    <div className="lib-scope" data-theme={theme} style={{ minHeight: "100%", background: "var(--bg)", color: "var(--text)" }}>
      <style>{LIB_TOKENS}</style>
      <div style={{ padding: "28px 28px 0" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <div className="wv-mono" style={{ fontSize: 11, letterSpacing: "0.2em", color: "var(--text-faint)", marginBottom: 6 }}>
              OWNER DASHBOARD
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>{RESTAURANT_NAME}</h1>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setNewBookingOpen(true)}
                className="lib-pill is-active"
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                New booking
              </button>
              <button
                onClick={() => setWalkInOpen(true)}
                className="lib-pill"
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z" /><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" /><path d="M2 8l3 3-3 3" /></svg>
                Walk-in
              </button>
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="lib-pill"
              >
                {theme === "dark" ? "Light Mode" : "Dark Mode"}
              </button>
              <button
                onClick={() => { setCustomerPortalInitialEmail(null); setCustomersOpen(true); }}
                className="lib-pill"
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a8 8 0 0 1 16 0v1" /></svg>
                Customers
              </button>
              <button
                onClick={() => setSettingsOpen(true)}
                className="lib-pill"
              >
                Settings
              </button>
            </div>
            <div style={{ display: "flex", gap: 22, alignItems: "flex-end" }}>
              <MiniStat label="Bookings today" value={dayBookings.length} />
              <MiniStat label="Guests" value={totalGuests} />
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 12, color: "var(--text-dim)" }}>
              {bookingPageUrl && (
                <a href={bookingPageUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", textDecoration: "none" }}>
                  Customer booking page
                </a>
              )}
              {userEmail && <span>{userEmail}</span>}
              {onLogout && (
                <button onClick={onLogout} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", padding: 0, fontFamily: "inherit", fontSize: 12 }}>
                  Log out
                </button>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 20 }}>
          <div
            style={{
              display: "flex",
              alignItems: "stretch",
              border: "1px solid var(--border)",
              borderRadius: 8,
              overflow: "hidden",
              background: "var(--panel)",
            }}
          >
            <button
              onClick={() => setDate((d) => shiftDate(d, -1))}
              title="Previous day"
              style={{ background: "none", border: "none", borderRight: "1px solid var(--border)", color: "var(--text)", padding: "0 10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <div
              className="wv-mono"
              style={{
                padding: "9px 14px",
                color: "var(--text)",
                fontSize: 13,
                minWidth: 96,
                textAlign: "center",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRight: "1px solid var(--border)",
              }}
            >
              {formatDMY(date)}
            </div>
            <button
              onClick={() => setDate((d) => shiftDate(d, 1))}
              title="Next day"
              style={{ background: "none", border: "none", borderRight: "1px solid var(--border)", color: "var(--text)", padding: "0 10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
            <div
              style={{
                position: "relative",
                width: 36,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: "var(--text)",
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="5" width="18" height="16" rx="2" />
                <line x1="3" y1="10" x2="21" y2="10" />
                <line x1="8" y1="3" x2="8" y2="7" />
                <line x1="16" y1="3" x2="16" y2="7" />
              </svg>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                title="Pick a date"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  opacity: 0,
                  cursor: "pointer",
                  border: "none",
                }}
              />
            </div>
          </div>
          <button onClick={() => setDate(todayISO())} className="lib-pill">Today</button>
          <div style={{ display: "flex", gap: 6 }}>
            {["live", "timeline", "floor", "list"].map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`lib-pill${view === v ? " is-active" : ""}`}
                style={{ textTransform: "capitalize" }}
              >
                {v === "live" ? "Live Board ✦" : v === "timeline" ? "Timeline" : v === "floor" ? "Floor plan" : "Bookings"}
              </button>
            ))}
          </div>
        </div>

        {view === "list" && (
          <div style={{ display: "flex", gap: 8, marginBottom: 22, flexWrap: "wrap" }}>
            {sittingsForDate(sittings, date).map((s) => (
              <button
                key={s.id}
                onClick={() => { setSitting(s.id); setSelectedTable(null); }}
                className={`lib-pill${sitting === s.id ? " is-active" : ""}`}
              >
                <span className="wv-mono">{sittingDisplay(s)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {view === "live" && (
        <LiveBoard bookings={dayBookings} tables={tables} sittings={sittings} date={date} toggleArrival={toggleArrival} setArrivalAll={setArrivalAll} onEditBooking={setEditingBookingId} />
      )}

      {view === "timeline" && (
        <TimelineDay bookings={dayBookings} tables={tables} sittings={sittings} date={date} onEditBooking={setEditingBookingId} />
      )}

      {view !== "timeline" && view !== "live" && (view === "floor" ? (
        <div>
          {sections.length > 1 && (
            <div style={{ display: "flex", gap: 8, marginBottom: 14, marginLeft: 28, flexWrap: "wrap" }}>
              {sections.map((sec) => (
                <button
                  key={sec.id}
                  onClick={() => setFloorSection(sec.id)}
                  className={`lib-pill${floorSection === sec.id ? " is-active" : ""}`}
                >
                  {sec.name}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 0 }}>
          <div style={{ flex: 1, display: "flex", justifyContent: "center", margin: "0 0 28px 28px" }}>
            <div
              style={{
                position: "relative",
                width: roomSize.w,
                maxWidth: "100%",
                height: roomSize.h,
                flexShrink: 0,
                background: "var(--panel)",
                borderRadius: 14,
                border: "1px solid var(--border)",
              }}
            >
            <div className="wv-mono" style={{ position: "absolute", top: 10, left: 16, fontSize: 10, color: "var(--text-faint)", letterSpacing: "0.15em" }}>
              WINDOW SIDE
            </div>
            {sectionWalls.map((w) => (
              <div
                key={w.id}
                style={{
                  position: "absolute",
                  left: `${w.x}%`,
                  top: `${w.y}%`,
                  width: w.w,
                  height: w.h,
                  background: "var(--text-faint)",
                  borderRadius: 2,
                  transform: `translate(-50%, -50%) rotate(${w.rotation}deg)`,
                  transformOrigin: "center",
                  opacity: 0.5,
                }}
              />
            ))}
            {sectionTables.map((t) => {
              const todaysBookings = bookingsForTableToday(t.id);
              const hasDeposit = todaysBookings.some((b) => b.depositRequired && !b.depositPaid);
              const bg = todaysBookings.length === 0 ? "var(--panel-raised)" : hasDeposit ? "var(--warning)" : "var(--accent)";
              const fg = todaysBookings.length === 0 ? "var(--text-dim)" : "#FFFFFF";
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedTable(t.id)}
                  style={{
                    position: "absolute",
                    left: `${t.x}%`,
                    top: `${t.y}%`,
                    width: t.w,
                    height: t.h,
                    borderRadius: t.shape === "round" ? "50%" : 10,
                    transform: `translate(-50%, -50%) rotate(${t.rotation || 0}deg)`,
                    transformOrigin: "center",
                    border: selectedTable === t.id ? "2px solid var(--text)" : "1px solid var(--border)",
                    background: bg,
                    color: fg,
                    cursor: "pointer",
                    padding: 0,
                    fontFamily: "inherit",
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      transform: `rotate(${-(t.rotation || 0)}deg)`,
                      padding: "2px 4px",
                      overflow: "hidden",
                    }}
                  >
                    <div className="wv-mono" style={{ fontSize: 11, fontWeight: 700, textAlign: "center", wordBreak: "break-word", lineHeight: 1.15, maxHeight: "70%", overflow: "hidden" }}>{t.label}</div>
                    <div style={{ fontSize: 9, opacity: 0.9 }}>
                      {todaysBookings.length > 0 ? `${todaysBookings.length} booking${todaysBookings.length > 1 ? "s" : ""} today` : `${t.seats} seats`}
                    </div>
                  </div>
                </button>
              );
            })}
            </div>
          </div>

          <div style={{ width: 300, marginRight: 28, marginBottom: 28 }}>
            <button
              onClick={() => setBuilderOpen(true)}
              className="lib-pill"
              style={{ width: "100%", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
              Edit floor layout
            </button>
            <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 14, padding: 18, marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", color: "var(--text-dim)", marginBottom: 12 }}>LEGEND</div>
              <LegendRow color="var(--panel-raised)" label="Available" />
              <LegendRow color="var(--accent)" label="Booked & confirmed" />
              <LegendRow color="var(--warning)" label="Deposit pending" />
            </div>

            {selectedTable && (() => {
              const t = tables.find((x) => x.id === selectedTable);
              const todaysBookings = bookingsForTableToday(selectedTable);
              return (
                <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 14, padding: 18 }}>
                  <div className="wv-mono" style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 4 }}>{t.label}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>{t.seats}-seat table</div>
                  {todaysBookings.length === 0 ? (
                    <div style={{ fontSize: 13, color: "var(--text-dim)" }}>No bookings today. Free to walk in.</div>
                  ) : (
                    todaysBookings.map((b, i) => (
                      <div key={b.id} style={{ paddingTop: i > 0 ? 14 : 0, marginTop: i > 0 ? 14 : 0, borderTop: i > 0 ? "1px solid var(--border)" : "none" }}>
                        <div className="wv-mono" style={{ fontSize: 11, color: "var(--accent)", marginBottom: 6 }}>{bookingTimeRangeLabel(b, sittings)}</div>
                        <Row2 label="Guest" value={b.name} />
                        <Row2 label="Party" value={`${b.partySize} guests`} />
                        <Row2 label="Phone" value={b.phone} />
                        <Row2 label="Email" value={b.email} />
                        <Row2 label="Booking ID" value={b.reference || b.id} />
                        {b.depositRequired && (
                          <div style={{ marginTop: 8 }}>
                            <span className="lib-badge" style={{ background: b.depositPaid ? "rgba(52,199,89,0.18)" : "rgba(255,159,10,0.18)", color: b.depositPaid ? "var(--success)" : "var(--warning)" }}>
                              {b.depositPaid ? `Deposit paid $${b.depositAmount}` : "Deposit pending"}
                            </span>
                          </div>
                        )}
                        <button
                          onClick={() => { removeBooking(b.id); setSelectedTable(null); }}
                          style={{ marginTop: 12, width: "100%", padding: "9px", borderRadius: 8, border: "1px solid var(--danger)", background: "transparent", color: "var(--danger)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
                        >
                          Cancel booking
                        </button>
                      </div>
                    ))
                  )}
                </div>
              );
            })()}
          </div>
        </div>
        </div>
      ) : (
        <div style={{ padding: "0 28px 40px" }}>
          <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 0.9fr 0.6fr 0.6fr 1.2fr 1.6fr 40px", padding: "12px 18px", fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", color: "var(--text-dim)", borderBottom: "1px solid var(--border)" }}>
              <span>NAME</span><span>TIME</span><span>PARTY</span><span>TABLE</span><span>CONTACT</span><span>STATUS</span><span></span>
            </div>
            <div className="wv-scroll" style={{ maxHeight: "60vh", overflowY: "auto" }}>
              {dayBookings.length === 0 && (
                <div style={{ padding: 24, fontSize: 13, color: "var(--text-faint)" }}>No bookings yet for this date.</div>
              )}
              {dayBookings
                .sort((a, b) => (bookingStartMinutes(a, sittings) ?? 0) - (bookingStartMinutes(b, sittings) ?? 0))
                .map((b) => {
                  const arrived = arrivedArray(b);
                  const arrivedCount = arrived.filter(Boolean).length;
                  const allArrived = arrivedCount === b.partySize;
                  const depositDotColor = !b.depositRequired ? "var(--text-faint)" : b.depositPaid ? "var(--success)" : "var(--warning)";
                  return (
                    <div key={b.id} style={{ display: "grid", gridTemplateColumns: "1fr 0.9fr 0.6fr 0.6fr 1.2fr 1.6fr 40px", padding: "16px 18px", fontSize: 13, borderBottom: "1px solid var(--border)", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center" }}>
                        <button
                          onClick={() => { setCustomerPortalInitialEmail(b.email); setCustomersOpen(true); }}
                          style={{ fontWeight: 600, background: "none", border: "none", color: "var(--accent)", cursor: "pointer", padding: 0, textAlign: "left", fontFamily: "inherit", fontSize: 13 }}
                        >
                          {b.name}
                        </button>
                        <OccasionIcons notes={b.notes} />
                      </div>
                      <span className="wv-mono" style={{ color: "var(--text)", fontWeight: 500 }}>{bookingTimeDisplay(b, sittings)}</span>
                      <span style={{ color: "var(--text)", fontWeight: 500 }}>{b.partySize}</span>
                      <span className="wv-mono" style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text)", fontWeight: 500 }}>
                        <span title={b.depositRequired ? (b.depositPaid ? "Deposit paid" : "Deposit pending") : "No deposit"} style={{ width: 6, height: 6, borderRadius: 999, background: depositDotColor, flexShrink: 0 }} />
                        {tables.find((t) => t.id === b.tableId)?.label || b.tableId}
                      </span>
                      <span style={{ color: "var(--text)", fontWeight: 500, fontSize: 12 }}>{b.phone}</span>
                      <span>
                        {allArrived ? (
                          <button
                            onClick={() => setArrivalAll(b.id, false)}
                            title="Click to undo check-in"
                            className="lib-badge"
                            style={{ background: "rgba(52,199,89,0.18)", color: "var(--success)", border: "none", cursor: "pointer", fontFamily: "inherit" }}
                          >
                            Checked in
                          </button>
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                              {arrived.map((isIn, i) => (
                                <button
                                  key={i}
                                  onClick={() => toggleArrival(b.id, i)}
                                  title={`Guest ${i + 1}${isIn ? " — arrived" : ""}`}
                                  className="wv-mono"
                                  style={{
                                    width: 20,
                                    height: 20,
                                    borderRadius: 999,
                                    border: isIn ? "1px solid var(--success)" : "1px solid var(--text-dim)",
                                    background: isIn ? "rgba(52,199,89,0.18)" : "var(--panel-raised)",
                                    color: isIn ? "var(--success)" : "var(--text)",
                                    fontSize: 10,
                                    fontWeight: 700,
                                    cursor: "pointer",
                                    padding: 0,
                                    lineHeight: 1,
                                  }}
                                >
                                  {i + 1}
                                </button>
                              ))}
                            </div>
                            <span style={{ fontSize: 11, color: "var(--text)", fontWeight: 500 }}>{arrivedCount}/{b.partySize} arrived</span>
                            <button
                              onClick={() => setArrivalAll(b.id, true)}
                              title="Mark the whole party as arrived"
                              style={{ fontSize: 11, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit", fontWeight: 600 }}
                            >
                              Check all in
                            </button>
                          </div>
                        )}
                      </span>
                      <button
                        onClick={() => setEditingBookingId(b.id)}
                        title="Edit this booking"
                        style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", padding: 4, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                      </button>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      ))}

      {builderOpen && (
        <FloorPlanBuilder
          initialElements={floorElements}
          initialRoomSize={roomSize}
          initialSections={sections}
          onSave={(nextElements, nextRoomSize, nextSections, nextActiveSection) => {
            setFloorElements(nextElements);
            setRoomSize(nextRoomSize);
            setSections(nextSections);
            setFloorSection(nextActiveSection);
            setBuilderOpen(false);
          }}
          onClose={() => setBuilderOpen(false)}
        />
      )}

      {newBookingOpen && (
        <NewBookingModal
          bookings={bookings}
          tables={tables}
          sittings={sittings}
          defaultDate={date}
          defaultSitting={sitting}
          onCreate={(booking) => {
            addBooking(booking);
            setNewBookingOpen(false);
          }}
          onClose={() => setNewBookingOpen(false)}
        />
      )}

      {editingBookingId && (() => {
        const editingBooking = bookings.find((b) => b.id === editingBookingId);
        if (!editingBooking) return null;
        return (
          <NewBookingModal
            bookings={bookings}
            tables={tables}
            sittings={sittings}
            editingBooking={editingBooking}
            onUpdate={(patch) => {
              updateBooking(editingBookingId, patch);
              setEditingBookingId(null);
            }}
            onDelete={() => {
              removeBooking(editingBookingId);
              setEditingBookingId(null);
            }}
            onRefund={refundDeposit ? () => refundDeposit(editingBookingId) : null}
            onClose={() => setEditingBookingId(null)}
          />
        );
      })()}

      {walkInOpen && (
        <WalkInModal
          bookings={bookings}
          tables={tables}
          onCreate={(booking) => {
            addBooking(booking);
            setWalkInOpen(false);
          }}
          onClose={() => setWalkInOpen(false)}
        />
      )}

      {timeSlotsOpen && (
        <TimeSlotsEditor
          initialSittings={sittings}
          onSave={(next) => {
            setSittings(next);
            setTimeSlotsOpen(false);
          }}
          onBack={() => { setTimeSlotsOpen(false); setSettingsOpen(true); }}
          onClose={() => setTimeSlotsOpen(false)}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          terms={terms}
          onSaveTerms={setTerms}
          onOpenTimeSlots={() => { setSettingsOpen(false); setTimeSlotsOpen(true); }}
          tables={tables}
          onUpdateTable={(id, patch) => {
            setFloorElements((prev) => prev.map((el) => (el.id === id ? { ...el, ...patch } : el)));
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {customersOpen && (
        <CustomerPortal
          bookings={bookings}
          tables={tables}
          sittings={sittings}
          customerNotes={customerNotes}
          onSaveNote={setCustomerNote}
          initialEmail={customerPortalInitialEmail}
          onClose={() => setCustomersOpen(false)}
        />
      )}
    </div>
  );
}

function SettingsModal({ terms, onSaveTerms, onOpenTimeSlots, tables, onUpdateTable, onClose }) {
  const [draftTerms, setDraftTerms] = useState(terms);
  const [justSaved, setJustSaved] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const rowRefs = useRef({});
  const sortedTables = sortByPriority(tables);

  function handleSave() {
    onSaveTerms(draftTerms);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1800);
  }

  function moveTable(id, direction) {
    const idx = sortedTables.findIndex((t) => t.id === id);
    const swapIdx = idx + direction;
    if (idx === -1 || swapIdx < 0 || swapIdx >= sortedTables.length) return;
    const a = sortedTables[idx];
    const b = sortedTables[swapIdx];
    const aPriority = a.priority ?? idx + 1;
    const bPriority = b.priority ?? swapIdx + 1;
    onUpdateTable(a.id, { priority: bPriority });
    onUpdateTable(b.id, { priority: aPriority });
  }

  function startDrag(id, e) {
    e.preventDefault();
    setDragId(id);
    let currentOverId = null;

    function handleMove(ev) {
      const clientY = ev.touches ? ev.touches[0].clientY : ev.clientY;
      let closestId = null;
      let closestDist = Infinity;
      Object.entries(rowRefs.current).forEach(([rowId, el]) => {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const rowCenter = rect.top + rect.height / 2;
        const dist = Math.abs(clientY - rowCenter);
        if (dist < closestDist) {
          closestDist = dist;
          closestId = rowId;
        }
      });
      currentOverId = closestId;
      setDragOverId(closestId);
    }

    function handleUp() {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleUp);

      if (currentOverId && currentOverId !== id) {
        const fromIdx = sortedTables.findIndex((t) => t.id === id);
        const toIdx = sortedTables.findIndex((t) => t.id === currentOverId);
        if (fromIdx !== -1 && toIdx !== -1) {
          const reordered = [...sortedTables];
          const [moved] = reordered.splice(fromIdx, 1);
          reordered.splice(toIdx, 0, moved);
          reordered.forEach((t, i) => onUpdateTable(t.id, { priority: i + 1 }));
        }
      }
      setDragId(null);
      setDragOverId(null);
    }

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    window.addEventListener("touchmove", handleMove);
    window.addEventListener("touchend", handleUp);
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 55 }} />
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 56,
          width: 500,
          maxWidth: "calc(100vw - 40px)",
          maxHeight: "calc(100vh - 60px)",
          overflowY: "auto",
          background: "#1C1C1E",
          border: "1px solid #38383A",
          borderRadius: 14,
          boxShadow: "0 16px 48px rgba(0,0,0,0.55)",
          padding: 22,
          color: "#FFFFFF",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Settings</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#98989D", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 4 }}>✕</button>
        </div>

        <div style={{ background: "#2C2C2E", border: "1px solid #38383A", borderRadius: 10, padding: 14, marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Booking times</div>
            <div style={{ fontSize: 12, color: "#98989D", marginTop: 2 }}>The times customers can pick from</div>
          </div>
          <button
            onClick={onOpenTimeSlots}
            style={{ padding: "9px 14px", borderRadius: 8, border: "none", background: "#0A84FF", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}
          >
            Edit
          </button>
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: "#98989D", marginBottom: 6 }}>TABLE PRIORITY & PARTY SIZES</div>
        <div style={{ fontSize: 12, color: "#636366", marginBottom: 10 }}>
          Order controls which table gets auto-assigned first. Min/max limits which party sizes a table is offered for — e.g. a 2-top only for parties of 2, a big round table only for 5–8.
        </div>
        <div style={{ background: "#2C2C2E", border: "1px solid #38383A", borderRadius: 10, marginBottom: 18, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "72px 1fr 60px 60px", padding: "8px 12px", fontSize: 10, fontWeight: 700, color: "#636366", letterSpacing: "0.05em", borderBottom: "1px solid #38383A" }}>
            <span>ORDER</span><span>TABLE</span><span>MIN</span><span>MAX</span>
          </div>
          {sortedTables.length === 0 && (
            <div style={{ padding: 14, fontSize: 12, color: "#636366" }}>No tables yet — add some in the Floor Plan Builder.</div>
          )}
          {sortedTables.map((t, i) => (
            <div
              key={t.id}
              ref={(el) => { rowRefs.current[t.id] = el; }}
              style={{
                display: "grid",
                gridTemplateColumns: "72px 1fr 60px 60px",
                padding: "8px 12px",
                alignItems: "center",
                borderBottom: i < sortedTables.length - 1 ? "1px solid #38383A" : "none",
                background: dragOverId === t.id && dragId && dragId !== t.id ? "rgba(10,132,255,0.15)" : "transparent",
                opacity: dragId === t.id ? 0.4 : 1,
                transition: "background 0.1s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <div
                  onMouseDown={(e) => startDrag(t.id, e)}
                  onTouchStart={(e) => startDrag(t.id, e)}
                  title="Drag to reorder"
                  style={{ cursor: "grab", color: "#636366", padding: "2px 2px 2px 0", touchAction: "none" }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" /><circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" /><circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" /></svg>
                </div>
                <button
                  onClick={() => moveTable(t.id, -1)}
                  disabled={i === 0}
                  title="Move up"
                  style={{ background: "none", border: "none", color: i === 0 ? "#38383A" : "#98989D", cursor: i === 0 ? "default" : "pointer", padding: 2 }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="18 15 12 9 6 15" /></svg>
                </button>
                <button
                  onClick={() => moveTable(t.id, 1)}
                  disabled={i === sortedTables.length - 1}
                  title="Move down"
                  style={{ background: "none", border: "none", color: i === sortedTables.length - 1 ? "#38383A" : "#98989D", cursor: i === sortedTables.length - 1 ? "default" : "pointer", padding: 2 }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
                </button>
              </div>
              <div style={{ fontSize: 13 }}>
                <span className="wv-mono" style={{ fontWeight: 600 }}>{i + 1}.</span> {t.label} <span style={{ color: "#636366", fontSize: 11 }}>({t.seats} seats)</span>
              </div>
              <input
                type="number"
                min={1}
                max={t.seats}
                value={t.minParty ?? 1}
                onChange={(e) => onUpdateTable(t.id, { minParty: Math.max(1, Math.min(t.seats, parseInt(e.target.value) || 1)) })}
                style={{ width: 48, padding: "5px 6px", borderRadius: 6, border: "1px solid #38383A", background: "#1C1C1E", color: "#fff", fontFamily: "inherit", fontSize: 12 }}
              />
              <input
                type="number"
                min={1}
                max={t.seats}
                value={t.maxParty ?? t.seats}
                onChange={(e) => onUpdateTable(t.id, { maxParty: Math.max(1, Math.min(t.seats, parseInt(e.target.value) || t.seats)) })}
                style={{ width: 48, padding: "5px 6px", borderRadius: 6, border: "1px solid #38383A", background: "#1C1C1E", color: "#fff", fontFamily: "inherit", fontSize: 12 }}
              />
            </div>
          ))}
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: "#98989D", marginBottom: 6 }}>TERMS & CONDITIONS</div>
        <div style={{ fontSize: 12, color: "#636366", marginBottom: 10 }}>
          Shown to customers on the booking page after they pick a date, time and party size.
        </div>
        <textarea
          value={draftTerms}
          onChange={(e) => setDraftTerms(e.target.value)}
          placeholder="e.g. deposit policy, cancellation notice, dietary requirements..."
          style={{
            width: "100%",
            minHeight: 200,
            borderRadius: 8,
            border: "1px solid #38383A",
            background: "#2C2C2E",
            color: "#FFFFFF",
            fontFamily: "inherit",
            fontSize: 13,
            lineHeight: 1.6,
            padding: 12,
            resize: "vertical",
            boxSizing: "border-box",
            marginBottom: 14,
          }}
        />

        <button
          onClick={handleSave}
          style={{
            width: "100%",
            padding: "11px",
            borderRadius: 8,
            border: "none",
            background: justSaved ? "#34C759" : "#0A84FF",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
            transition: "background 0.15s ease",
          }}
        >
          {justSaved ? "Saved ✓" : "Save settings"}
        </button>
      </div>
    </>
  );
}

function TimeSlotsEditor({ initialSittings, onSave, onBack, onClose }) {
  const [slots, setSlots] = useState(() => [...initialSittings].sort((a, b) => a.time24.localeCompare(b.time24)));
  const [bulkStart, setBulkStart] = useState("17:30");
  const [bulkEnd, setBulkEnd] = useState("21:00");
  const [bulkStep, setBulkStep] = useState(30);

  function addSlot() {
    const id = newElementId();
    setSlots((prev) => [...prev, { id, time24: "18:00", label: "", maxCovers: null, days: [] }].sort((a, b) => a.time24.localeCompare(b.time24)));
  }

  function updateSlot(id, patch) {
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function toggleSlotDay(id, dayIndex) {
    setSlots((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const current = !s.days || s.days.length === 0 ? [0, 1, 2, 3, 4, 5, 6] : s.days;
        const next = current.includes(dayIndex) ? current.filter((d) => d !== dayIndex) : [...current, dayIndex].sort();
        return { ...s, days: next.length === 7 ? [] : next };
      })
    );
  }

  function removeSlot(id) {
    setSlots((prev) => prev.filter((s) => s.id !== id));
  }

  function generateBulk() {
    const [startH, startM] = bulkStart.split(":").map(Number);
    const [endH, endM] = bulkEnd.split(":").map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    const step = Math.max(5, parseInt(bulkStep, 10) || 30);
    const generated = [];
    for (let m = startMinutes; m <= endMinutes; m += step) {
      const h = Math.floor(m / 60);
      const mm = m % 60;
      const time24 = `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
      generated.push({ id: newElementId(), time24, label: "", maxCovers: null, days: [] });
    }
    setSlots(generated);
  }

  function handleSave() {
    onSave([...slots].sort((a, b) => a.time24.localeCompare(b.time24)));
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 55 }} />
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 56,
          width: 460,
          maxWidth: "calc(100vw - 40px)",
          maxHeight: "calc(100vh - 60px)",
          overflowY: "auto",
          background: "#1C1C1E",
          border: "1px solid #38383A",
          borderRadius: 14,
          boxShadow: "0 16px 48px rgba(0,0,0,0.55)",
          padding: 22,
          color: "#FFFFFF",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {onBack && (
              <button
                onClick={onBack}
                title="Back to Settings"
                style={{ background: "none", border: "none", color: "#98989D", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
            )}
            <div style={{ fontSize: 18, fontWeight: 700 }}>Booking times</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#98989D", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 4 }}>✕</button>
        </div>
        <div style={{ fontSize: 12, color: "#98989D", marginBottom: 18 }}>
          These are the exact times customers can pick from on your booking page — set them however suits your service.
        </div>

        <div style={{ background: "#2C2C2E", border: "1px solid #38383A", borderRadius: 10, padding: 14, marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#98989D", marginBottom: 10 }}>QUICK GENERATE</div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <label style={editorLabelStyle}>From</label>
              <input type="time" value={bulkStart} onChange={(e) => setBulkStart(e.target.value)} style={editorInputStyle} />
            </div>
            <div>
              <label style={editorLabelStyle}>To</label>
              <input type="time" value={bulkEnd} onChange={(e) => setBulkEnd(e.target.value)} style={editorInputStyle} />
            </div>
            <div>
              <label style={editorLabelStyle}>Every (min)</label>
              <input type="number" min={5} step={5} value={bulkStep} onChange={(e) => setBulkStep(e.target.value)} style={{ ...editorInputStyle, width: 70 }} />
            </div>
            <button
              onClick={generateBulk}
              style={{ padding: "9px 14px", borderRadius: 8, border: "none", background: "#0A84FF", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
            >
              Generate
            </button>
          </div>
          <div style={{ fontSize: 11, color: "#636366", marginTop: 8 }}>
            This replaces the list below — use it as a fast starting point, then fine-tune individual times underneath.
          </div>
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: "#98989D", marginBottom: 8 }}>TIMES ({slots.length})</div>
        <div style={{ fontSize: 11, color: "#636366", marginBottom: 10 }}>
          "Max covers" caps total guests bookable for that time online — leave blank for no limit.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
          {slots.length === 0 && (
            <div style={{ fontSize: 13, color: "#636366" }}>No times yet — generate some above or add one manually.</div>
          )}
          {slots.map((s) => {
            const activeDays = !s.days || s.days.length === 0 ? [0, 1, 2, 3, 4, 5, 6] : s.days;
            return (
              <div key={s.id} style={{ background: "#232323", border: "1px solid #38383A", borderRadius: 8, padding: 8 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                  <input
                    type="time"
                    value={s.time24}
                    onChange={(e) => updateSlot(s.id, { time24: e.target.value })}
                    style={{ ...editorInputStyle, width: 110 }}
                  />
                  <input
                    value={s.label}
                    onChange={(e) => updateSlot(s.id, { label: e.target.value })}
                    placeholder="Optional label, e.g. Lunch"
                    style={{ ...editorInputStyle, flex: 1 }}
                  />
                  <input
                    type="number"
                    min={0}
                    value={s.maxCovers ?? ""}
                    onChange={(e) => updateSlot(s.id, { maxCovers: e.target.value === "" ? null : Math.max(0, parseInt(e.target.value) || 0) })}
                    placeholder="Max"
                    title="Max covers for this time — blank means no limit"
                    style={{ ...editorInputStyle, width: 64 }}
                  />
                  <button
                    onClick={() => removeSlot(s.id)}
                    title="Remove this time"
                    style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid #FF453A", background: "transparent", color: "#FF453A", cursor: "pointer", fontSize: 14, flexShrink: 0 }}
                  >
                    ✕
                  </button>
                </div>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <span style={{ fontSize: 10, color: "#636366", marginRight: 4 }}>DAYS:</span>
                  {DAY_LABELS.map((label, i) => (
                    <button
                      key={i}
                      onClick={() => toggleSlotDay(s.id, i)}
                      title={label}
                      style={{
                        width: 26,
                        height: 22,
                        borderRadius: 5,
                        border: "1px solid #38383A",
                        background: activeDays.includes(i) ? "#0A84FF" : "transparent",
                        color: activeDays.includes(i) ? "#fff" : "#636366",
                        fontSize: 10,
                        fontWeight: 700,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      {label[0]}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={addSlot}
          style={{ width: "100%", padding: "9px", borderRadius: 8, border: "1px dashed #38383A", background: "transparent", color: "#98989D", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginBottom: 18 }}
        >
          + Add a single time
        </button>

        <button
          onClick={handleSave}
          style={{ width: "100%", padding: "11px", borderRadius: 8, border: "none", background: "#0A84FF", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
        >
          Save booking times
        </button>
      </div>
    </>
  );
}

const editorLabelStyle = { display: "block", fontSize: 10, fontWeight: 600, color: "#636366", marginBottom: 4 };
const editorInputStyle = {
  padding: "7px 9px",
  borderRadius: 6,
  border: "1px solid #38383A",
  background: "#2C2C2E",
  color: "#FFFFFF",
  fontFamily: "inherit",
  fontSize: 13,
  boxSizing: "border-box",
};

function WalkInModal({ bookings, tables, onCreate, onClose }) {
  const [partySize, setPartySize] = useState(2);
  const [name, setName] = useState("");
  const [tableId, setTableId] = useState("");
  const [error, setError] = useState("");

  const now = new Date();
  const time24 = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const date = todayISO();

  function handleAdd() {
    setError("");
    const table = tableId ? tables.find((t) => t.id === tableId) : sortByPriority(tables.filter((t) => tableFitsParty(t, partySize)))[0];
    if (!table) {
      setError("No table big enough for that party size.");
      return;
    }
    const booking = {
      id: "BK-" + Math.random().toString(36).slice(2, 8).toUpperCase(),
      date,
      sitting: "",
      customTime24: time24,
      durationMinutes: DEFAULT_BOOKING_DURATION,
      partySize,
      name: name.trim() || "Walk-in",
      email: "",
      phone: "",
      tableId: table.id,
      depositRequired: false,
      depositAmount: 0,
      depositPaid: false,
      cardLast4: null,
      status: "confirmed",
      createdAt: new Date().toISOString(),
      source: "walkin",
      notes: "",
      syncStatus: "local-only",
      arrived: Array(partySize).fill(true),
    };
    onCreate(booking);
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 49 }} />
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 50,
          width: 360,
          maxWidth: "calc(100vw - 40px)",
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          boxShadow: "0 16px 48px rgba(0,0,0,0.55)",
          padding: 22,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Walk-in</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 4 }}>✕</button>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 18 }}>Seating right now, no advance booking</div>

        <div style={{ marginBottom: 14 }}>
          <label style={modalLabelStyle}>Party size</label>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <button type="button" onClick={() => setPartySize((p) => Math.max(1, p - 1))} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--border)", background: "var(--panel-raised)", color: "var(--text)", fontSize: 16, cursor: "pointer" }}>−</button>
            <div className="wv-mono" style={{ fontSize: 18, width: 28, textAlign: "center" }}>{partySize}</div>
            <button type="button" onClick={() => setPartySize((p) => Math.min(20, p + 1))} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--border)", background: "var(--panel-raised)", color: "var(--text)", fontSize: 16, cursor: "pointer" }}>+</button>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={modalLabelStyle}>Name (optional)</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Walk-in" style={modalInputStyle} />
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={modalLabelStyle}>Table</label>
          <select value={tableId} onChange={(e) => setTableId(e.target.value)} style={modalInputStyle}>
            <option value="">Auto-assign smallest fit</option>
            {sortByPriority(tables.filter((t) => tableFitsParty(t, partySize))).map((t) => (
              <option key={t.id} value={t.id}>{t.label} · {t.seats} seats</option>
            ))}
          </select>
          <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>
            Shows tables that fit this party size — double check it's actually free on the floor.
          </div>
        </div>

        {error && (
          <div style={{ fontSize: 13, color: "var(--danger)", background: "rgba(255,69,58,0.12)", border: "1px solid var(--danger)", borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>
            {error}
          </div>
        )}

        <button
          onClick={handleAdd}
          style={{ width: "100%", padding: "11px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
        >
          Seat walk-in
        </button>
      </div>
    </>
  );
}

function NewBookingModal({ bookings, tables, sittings, defaultDate, defaultSitting, editingBooking, onCreate, onUpdate, onDelete, onRefund, onClose }) {
  const isEditing = !!editingBooking;
  const [form, setForm] = useState(() =>
    editingBooking
      ? {
          name: editingBooking.name || "",
          email: editingBooking.email || "",
          phone: editingBooking.phone || "",
          date: editingBooking.date,
          sitting: editingBooking.sitting || "",
          customTime24: editingBooking.customTime24 || "",
          partySize: editingBooking.partySize,
          tableId: editingBooking.tableId || "",
          depositPaid: !!editingBooking.depositPaid,
          notes: editingBooking.notes || "",
          durationMinutes: editingBooking.durationMinutes || DEFAULT_BOOKING_DURATION,
        }
      : {
          name: "",
          email: "",
          phone: "",
          date: defaultDate || todayISO(),
          sitting: defaultSitting || sittings[0]?.id || "",
          customTime24: "",
          partySize: 2,
          tableId: "",
          depositPaid: false,
          notes: "",
          durationMinutes: DEFAULT_BOOKING_DURATION,
        }
  );
  const [error, setError] = useState("");

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function selectSitting(id) {
    setForm((f) => ({ ...f, sitting: id, customTime24: "" }));
  }

  function setCustomTime(value) {
    setForm((f) => ({ ...f, customTime24: value, sitting: "" }));
  }

  const needsDeposit = form.partySize >= DEPOSIT_THRESHOLD;
  const depositAmount = needsDeposit ? form.partySize * DEPOSIT_PER_HEAD : 0;

  const draftBooking = {
    date: form.date,
    sitting: form.customTime24 ? "" : form.sitting,
    customTime24: form.customTime24 || null,
    durationMinutes: form.durationMinutes || DEFAULT_BOOKING_DURATION,
  };
  const otherBookings = bookings.filter((b) => b.id !== editingBooking?.id);
  const bookedTableIds = tables
    .filter((t) => otherBookings.some((b) => bookingsOverlap({ ...draftBooking, tableId: t.id }, b, sittings)))
    .map((t) => t.id);
  const availableTables = sortByPriority(tables.filter((t) => tableFitsParty(t, form.partySize) && !bookedTableIds.includes(t.id)));

  function handleSubmit() {
    setError("");
    if (!form.name.trim() || !form.phone.trim()) {
      setError("At minimum, add a name and phone number.");
      return;
    }
    if (!form.sitting && !form.customTime24) {
      setError("Pick a time, or enter a custom one.");
      return;
    }
    if (form.sitting) {
      const activeSitting = sittings.find((s) => s.id === form.sitting);
      if (activeSitting && activeSitting.maxCovers != null) {
        const already = coversBookedForSitting(otherBookings, form.date, form.sitting);
        if (already + form.partySize > activeSitting.maxCovers) {
          setError(`That time's cover limit (${activeSitting.maxCovers}) would be exceeded.`);
          return;
        }
      }
    }
    const table = form.tableId ? tables.find((t) => t.id === form.tableId) : availableTables[0];
    if (!table) {
      setError("No table available for that date, sitting and party size.");
      return;
    }
    const finalConflict = otherBookings.some((b) => bookingsOverlap({ ...draftBooking, tableId: table.id }, b, sittings));
    if (finalConflict) {
      setError("That table is already booked for an overlapping time. Pick another table or time.");
      return;
    }

    if (isEditing) {
      onUpdate({
        date: form.date,
        sitting: form.customTime24 ? "" : form.sitting,
        customTime24: form.customTime24 || null,
        durationMinutes: form.durationMinutes || DEFAULT_BOOKING_DURATION,
        partySize: form.partySize,
        name: form.name,
        email: form.email || "",
        phone: form.phone,
        tableId: table.id,
        depositRequired: needsDeposit,
        depositAmount,
        depositPaid: needsDeposit ? form.depositPaid : false,
        notes: form.notes,
      });
      return;
    }

    const booking = {
      id: "BK-" + Math.random().toString(36).slice(2, 8).toUpperCase(),
      date: form.date,
      sitting: form.customTime24 ? "" : form.sitting,
      customTime24: form.customTime24 || null,
      durationMinutes: form.durationMinutes || DEFAULT_BOOKING_DURATION,
      partySize: form.partySize,
      name: form.name,
      email: form.email || "",
      phone: form.phone,
      tableId: table.id,
      depositRequired: needsDeposit,
      depositAmount,
      depositPaid: needsDeposit ? form.depositPaid : false,
      cardLast4: null,
      status: "confirmed",
      createdAt: new Date().toISOString(),
      source: "phone",
      notes: form.notes,
      syncStatus: "local-only",
    };
    onCreate(booking);
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 49 }} />
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 50,
          width: 440,
          maxWidth: "calc(100vw - 40px)",
          maxHeight: "calc(100vh - 60px)",
          overflowY: "auto",
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          boxShadow: "0 16px 48px rgba(0,0,0,0.55)",
          padding: 22,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{isEditing ? "Edit booking" : "New booking"}</div>
            <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 2 }}>
              {isEditing ? `Booking ${editingBooking.reference || editingBooking.id}` : "For a phone call, email, or walk-in request"}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 4 }}>✕</button>
        </div>

        <div>
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={modalLabelStyle}>Date</label>
              <input type="date" value={form.date} min={todayISO()} onChange={(e) => set("date", e.target.value)} style={modalInputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={modalLabelStyle}>Party size</label>
              <input type="number" min={1} max={20} value={form.partySize} onChange={(e) => set("partySize", Math.max(1, parseInt(e.target.value) || 1))} style={modalInputStyle} />
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={modalLabelStyle}>Time</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              {sittingsForDate(sittings, form.date).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => selectSitting(s.id)}
                  className={`lib-pill${form.sitting === s.id ? " is-active" : ""}`}
                >
                  <span className="wv-mono">{sittingDisplay(s)}</span>
                </button>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: "var(--text-dim)" }}>or any time:</span>
              <input
                type="time"
                value={form.customTime24}
                onChange={(e) => setCustomTime(e.target.value)}
                style={{ ...modalInputStyle, width: 130 }}
              />
              {form.customTime24 && (
                <button
                  type="button"
                  onClick={() => set("customTime24", "")}
                  style={{ fontSize: 11, color: "var(--text-dim)", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}
                >
                  clear
                </button>
              )}
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={modalLabelStyle}>Table occupied for (minutes)</label>
            <input
              type="number"
              min={15}
              step={15}
              value={form.durationMinutes}
              onChange={(e) => set("durationMinutes", Math.max(15, parseInt(e.target.value) || DEFAULT_BOOKING_DURATION))}
              style={{ ...modalInputStyle, width: 100 }}
            />
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>
              The table is blocked from other bookings for this long from the start time.
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={modalLabelStyle}>Table {availableTables.length === 0 && <span style={{ color: "var(--danger)" }}>— none available</span>}</label>
            <select value={form.tableId} onChange={(e) => set("tableId", e.target.value)} style={modalInputStyle}>
              <option value="">Auto-assign smallest fit</option>
              {availableTables.map((t) => (
                <option key={t.id} value={t.id}>{t.label} · {t.seats} seats</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={modalLabelStyle}>Guest name</label>
            <input value={form.name} onChange={(e) => set("name", e.target.value)} style={modalInputStyle} placeholder="Who's the booking for" />
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={modalLabelStyle}>Phone</label>
              <input value={form.phone} onChange={(e) => set("phone", e.target.value)} style={modalInputStyle} placeholder="For reminders" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={modalLabelStyle}>Email (optional)</label>
              <input value={form.email} onChange={(e) => set("email", e.target.value)} style={modalInputStyle} />
            </div>
          </div>

          {needsDeposit && (
            <div style={{ background: "var(--panel-raised)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", marginBottom: 12, fontSize: 13 }}>
              <div style={{ marginBottom: 8 }}>
                Groups of {DEPOSIT_THRESHOLD}+ need a <strong>${depositAmount}</strong> deposit.
              </div>
              {isEditing && editingBooking.paidByCard ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 12, color: "var(--text-dim)" }}>
                  <span>
                    {editingBooking.depositRefunded
                      ? `$${editingBooking.depositAmount} card deposit refunded`
                      : `$${editingBooking.depositAmount} paid by card online`}
                  </span>
                  {!editingBooking.depositRefunded && onRefund && (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Refund the $${editingBooking.depositAmount} deposit to the guest's card? This can't be undone.`)) onRefund();
                      }}
                      style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", background: "none", border: "1px solid var(--accent)", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}
                    >
                      Refund deposit
                    </button>
                  )}
                </div>
              ) : (
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-dim)", cursor: "pointer" }}>
                  <input type="checkbox" checked={form.depositPaid} onChange={(e) => set("depositPaid", e.target.checked)} />
                  Deposit already taken over the phone
                </label>
              )}
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <label style={modalLabelStyle}>Notes (optional)</label>
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="e.g. birthday, window table requested..."
              style={{ ...modalInputStyle, minHeight: 60, resize: "vertical", fontFamily: "inherit" }}
            />
          </div>

          {error && (
            <div style={{ fontSize: 13, color: "var(--danger)", background: "rgba(255,69,58,0.12)", border: "1px solid var(--danger)", borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            style={{ width: "100%", padding: "11px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
          >
            {isEditing ? "Save changes" : "Add booking"}
          </button>

          {isEditing && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Cancel this booking?")) onDelete();
              }}
              style={{ width: "100%", marginTop: 10, padding: "10px", borderRadius: 8, border: "1px solid var(--danger)", background: "transparent", color: "var(--danger)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
            >
              Delete booking
            </button>
          )}
        </div>
      </div>
    </>
  );
}

const modalLabelStyle = { display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-dim)", marginBottom: 5 };
const modalInputStyle = {
  width: "100%",
  padding: "9px 10px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--panel-raised)",
  color: "var(--text)",
  fontFamily: "inherit",
  fontSize: 13,
  boxSizing: "border-box",
};

function FloorPlanBuilder({ initialElements, initialRoomSize, initialSections, onSave, onClose }) {
  const [elements, setElements] = useState(() => initialElements.map((e) => ({ ...e })));
  const [roomSize, setRoomSize] = useState(initialRoomSize || DEFAULT_ROOM_SIZE);
  const [sections, setSections] = useState(() => (initialSections && initialSections.length ? initialSections.map((s) => ({ ...s })) : DEFAULT_SECTIONS.map((s) => ({ ...s }))));
  const [activeSection, setActiveSection] = useState(() => (initialSections && initialSections[0] ? initialSections[0].id : "main"));
  const [newSectionName, setNewSectionName] = useState("");
  const [addingSection, setAddingSection] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const canvasRef = useRef(null);
  const dragRef = useRef(null);
  const rotateRef = useRef(null);
  const resizeRef = useRef(null);

  function resetToDefaultLayout() {
    setElements(DEFAULT_FLOOR_ELEMENTS.map((e) => ({ ...e, id: newElementId() })));
    setSections(DEFAULT_SECTIONS.map((s) => ({ ...s })));
    setActiveSection(DEFAULT_SECTIONS[0].id);
    setSelectedId(null);
    setConfirmingReset(false);
  }

  function addSection() {
    const name = newSectionName.trim();
    if (!name) return;
    const id = newElementId();
    setSections((prev) => [...prev, { id, name }]);
    setActiveSection(id);
    setNewSectionName("");
    setAddingSection(false);
  }

  function renameSection(id, name) {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
  }

  function deleteSection(id) {
    if (sections.length <= 1) return;
    const remaining = sections.filter((s) => s.id !== id);
    const fallback = remaining[0].id;
    setElements((prev) => prev.map((el) => ((el.section || "main") === id ? { ...el, section: fallback } : el)));
    setSections(remaining);
    if (activeSection === id) setActiveSection(fallback);
  }

  useEffect(() => {
    function handleMove(e) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (dragRef.current) {
        const pointerXPct = ((e.clientX - rect.left) / rect.width) * 100;
        const pointerYPct = ((e.clientY - rect.top) / rect.height) * 100;
        let xPct = pointerXPct - dragRef.current.offsetXPercent;
        let yPct = pointerYPct - dragRef.current.offsetYPercent;
        xPct = Math.max(0, Math.min(100, xPct));
        yPct = Math.max(0, Math.min(100, yPct));
        const id = dragRef.current.id;
        setElements((prev) => prev.map((el) => (el.id === id ? { ...el, x: xPct, y: yPct } : el)));
      } else if (rotateRef.current) {
        const id = rotateRef.current.id;
        setElements((prev) =>
          prev.map((el) => {
            if (el.id !== id) return el;
            const centerX = rect.left + (el.x / 100) * rect.width;
            const centerY = rect.top + (el.y / 100) * rect.height;
            const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI) + 90;
            return { ...el, rotation: Math.round(angle < 0 ? angle + 360 : angle) };
          })
        );
      } else if (resizeRef.current) {
        const { id, edge, startW, startH, startMouseX, startMouseY, thetaRad } = resizeRef.current;
        const dx = e.clientX - startMouseX;
        const dy = e.clientY - startMouseY;
        const cosT = Math.cos(thetaRad);
        const sinT = Math.sin(thetaRad);
        // project the world-space mouse delta into the element's own (rotated) local axes
        const localDx = dx * cosT + dy * sinT;
        const localDy = -dx * sinT + dy * cosT;
        setElements((prev) =>
          prev.map((el) => {
            if (el.id !== id) return el;
            let w = el.w;
            let h = el.h;
            if (edge === "right") w = Math.max(20, startW + localDx * 2);
            if (edge === "left") w = Math.max(20, startW - localDx * 2);
            if (edge === "bottom") h = Math.max(8, startH + localDy * 2);
            if (edge === "top") h = Math.max(8, startH - localDy * 2);
            return { ...el, w, h };
          })
        );
      }
    }
    function handleUp() {
      dragRef.current = null;
      rotateRef.current = null;
      resizeRef.current = null;
    }
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, []);

  function startDrag(e, el) {
    e.stopPropagation();
    setSelectedId(el.id);
    const rect = canvasRef.current.getBoundingClientRect();
    const pointerXPct = ((e.clientX - rect.left) / rect.width) * 100;
    const pointerYPct = ((e.clientY - rect.top) / rect.height) * 100;
    dragRef.current = { id: el.id, offsetXPercent: pointerXPct - el.x, offsetYPercent: pointerYPct - el.y };
  }

  function startRotate(e, el) {
    e.stopPropagation();
    setSelectedId(el.id);
    rotateRef.current = { id: el.id };
  }

  function startResize(e, el, edge) {
    e.stopPropagation();
    setSelectedId(el.id);
    resizeRef.current = {
      id: el.id,
      edge,
      startW: el.w,
      startH: el.h,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      thetaRad: ((el.rotation || 0) * Math.PI) / 180,
    };
  }

  function addTable(shape) {
    const id = newElementId();
    const base =
      shape === "round" ? { w: 90, h: 90, seats: 4 } : shape === "square" ? { w: 60, h: 60, seats: 2 } : { w: 100, h: 60, seats: 4 };
    const nextPriority = elements.filter((e) => e.kind === "table").length + 1;
    const el = { id, kind: "table", shape, x: 40, y: 40, rotation: 0, label: `T${elements.filter((e) => e.kind === "table").length + 1}`, priority: nextPriority, minParty: 1, maxParty: base.seats, section: activeSection, ...base };
    setElements((prev) => [...prev, el]);
    setSelectedId(id);
  }

  function addWall() {
    const id = newElementId();
    const el = { id, kind: "wall", x: 10, y: 10, w: 160, h: 8, rotation: 0, label: "", section: activeSection };
    setElements((prev) => [...prev, el]);
    setSelectedId(id);
  }

  function duplicateSelected() {
    const original = elements.find((el) => el.id === selectedId);
    if (!original) return;
    const id = newElementId();
    const copy = {
      ...original,
      id,
      x: Math.min(95, original.x + 6),
      y: Math.min(95, original.y + 6),
      label: original.kind === "wall" ? "" : `${original.label} copy`,
    };
    setElements((prev) => [...prev, copy]);
    setSelectedId(id);
  }

  function updateSelected(patch) {
    setElements((prev) => prev.map((el) => (el.id === selectedId ? { ...el, ...patch } : el)));
  }

  function deleteSelected() {
    setElements((prev) => prev.filter((el) => el.id !== selectedId));
    setSelectedId(null);
  }

  const selected = elements.find((el) => el.id === selectedId);

  return (
    <div className="lib-scope" data-theme="dark" style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.78)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{LIB_TOKENS}</style>
      <div
        style={{
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          width: "98vw",
          height: "96vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>Floor plan builder</div>
            <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Drag to position · use the top handle to rotate</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {confirmingReset ? (
              <>
                <span style={{ fontSize: 12, color: "var(--danger)" }}>Clear all tables and start fresh?</span>
                <button onClick={resetToDefaultLayout} className="lib-pill" style={{ background: "var(--danger)", color: "#fff" }}>Yes, reset</button>
                <button onClick={() => setConfirmingReset(false)} className="lib-pill">Cancel</button>
              </>
            ) : (
              <button onClick={() => setConfirmingReset(true)} className="lib-pill" style={{ color: "var(--danger)" }}>Reset layout</button>
            )}
            <button onClick={onClose} className="lib-pill">Cancel</button>
            <button onClick={() => onSave(elements, roomSize, sections, activeSection)} className="lib-pill is-active">Save layout</button>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 20px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", letterSpacing: "0.05em", marginRight: 4 }}>SECTION</span>
          {sections.map((sec) => (
            <div key={sec.id} style={{ display: "flex", alignItems: "center", gap: 0 }}>
              <button
                onClick={() => { setActiveSection(sec.id); setSelectedId(null); }}
                className={`lib-pill${activeSection === sec.id ? " is-active" : ""}`}
                style={{ borderRadius: sections.length > 1 ? "8px 0 0 8px" : 8 }}
              >
                {sec.name}
              </button>
              {sections.length > 1 && (
                <button
                  onClick={() => deleteSection(sec.id)}
                  title={`Delete ${sec.name}`}
                  className="lib-pill"
                  style={{ borderRadius: "0 8px 8px 0", padding: "8px 10px", color: "var(--danger)" }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {addingSection ? (
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <input
                autoFocus
                value={newSectionName}
                onChange={(e) => setNewSectionName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addSection(); if (e.key === "Escape") { setAddingSection(false); setNewSectionName(""); } }}
                placeholder="e.g. Upstairs"
                style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--panel-raised)", color: "var(--text)", fontFamily: "inherit", fontSize: 13, width: 130 }}
              />
              <button onClick={addSection} className="lib-pill is-active">Add</button>
              <button onClick={() => { setAddingSection(false); setNewSectionName(""); }} className="lib-pill">✕</button>
            </div>
          ) : (
            <button onClick={() => setAddingSection(true)} className="lib-pill" style={{ opacity: 0.8 }}>
              + Add section
            </button>
          )}
          {sections.find((s) => s.id === activeSection) && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 8 }}>
              <span style={{ fontSize: 11, color: "var(--text-dim)" }}>Rename:</span>
              <input
                value={sections.find((s) => s.id === activeSection)?.name || ""}
                onChange={(e) => renameSection(activeSection, e.target.value)}
                style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel-raised)", color: "var(--text)", fontFamily: "inherit", fontSize: 12, width: 110 }}
              />
            </div>
          )}
        </div>

        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          <div style={{ width: 180, borderRight: "1px solid var(--border)", padding: 14, display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", letterSpacing: "0.05em", marginBottom: 4 }}>ADD ELEMENT</div>
            <ToolButton onClick={() => addTable("round")} label="Round table" icon="circle" />
            <ToolButton onClick={() => addTable("square")} label="Square table" icon="square" />
            <ToolButton onClick={() => addTable("rect")} label="Rect. table" icon="rect" />
            <ToolButton onClick={addWall} label="Wall" icon="wall" />

            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", letterSpacing: "0.05em", marginTop: 16, marginBottom: 4 }}>ROOM SIZE</div>
            <PropField label={`Width: ${roomSize.w}px`}>
              <input
                type="range"
                min={400}
                max={1600}
                step={10}
                value={roomSize.w}
                onChange={(e) => setRoomSize((r) => ({ ...r, w: parseInt(e.target.value) }))}
                style={sliderStyle}
              />
            </PropField>
            <PropField label={`Depth: ${roomSize.h}px`}>
              <input
                type="range"
                min={250}
                max={1000}
                step={10}
                value={roomSize.h}
                onChange={(e) => setRoomSize((r) => ({ ...r, h: parseInt(e.target.value) }))}
                style={sliderStyle}
              />
            </PropField>
          </div>

          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 14,
              overflow: "auto",
            }}
          >
            <div
              ref={canvasRef}
              onClick={(e) => { if (e.target === e.currentTarget) setSelectedId(null); }}
              style={{
                position: "relative",
                width: roomSize.w,
                height: roomSize.h,
                flexShrink: 0,
                background: "var(--panel)",
                borderRadius: 12,
                border: "1px solid var(--border)",
                backgroundImage: "linear-gradient(#2A2A2C 1px, transparent 1px), linear-gradient(90deg, #2A2A2C 1px, transparent 1px)",
                backgroundSize: "24px 24px",
                overflow: "hidden",
              }}
            >
            {elements.filter((el) => (el.section || "main") === activeSection).map((el) => {
              const isWall = el.kind === "wall";
              const isSelected = el.id === selectedId;
              return (
                <div
                  key={el.id}
                  onMouseDown={(e) => startDrag(e, el)}
                  style={{
                    position: "absolute",
                    left: `${el.x}%`,
                    top: `${el.y}%`,
                    width: el.w,
                    height: el.h,
                    borderRadius: isWall ? 2 : el.shape === "round" ? "50%" : 8,
                    background: isWall ? "var(--text-faint)" : "var(--accent)",
                    opacity: isWall ? 0.6 : 1,
                    border: isSelected ? "2px solid #fff" : "1px solid var(--border)",
                    transform: `translate(-50%, -50%) rotate(${el.rotation || 0}deg)`,
                    transformOrigin: "center",
                    cursor: "move",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    userSelect: "none",
                  }}
                >
                  {!isWall && (
                    <>
                      <div className="wv-mono" style={{ fontSize: 11, fontWeight: 700, textAlign: "center", padding: "0 4px", wordBreak: "break-word", lineHeight: 1.15, maxHeight: "70%", overflow: "hidden" }}>{el.label}</div>
                      <div style={{ fontSize: 9, opacity: 0.85 }}>{el.seats} seats</div>
                    </>
                  )}
                  {isSelected && (
                    <>
                      <div
                        onMouseDown={(e) => startRotate(e, el)}
                        title="Drag to rotate"
                        style={{
                          position: "absolute",
                          top: -26,
                          left: "50%",
                          marginLeft: -8,
                          width: 16,
                          height: 16,
                          borderRadius: "50%",
                          background: "#fff",
                          border: "2px solid var(--accent)",
                          cursor: "grab",
                          zIndex: 2,
                        }}
                      />
                      <div
                        onMouseDown={(e) => startResize(e, el, "top")}
                        title="Drag to resize height"
                        style={{ position: "absolute", top: -5, left: "50%", marginLeft: -6, width: 12, height: 10, borderRadius: 3, background: "#fff", border: "1px solid var(--accent)", cursor: "ns-resize", zIndex: 2 }}
                      />
                      <div
                        onMouseDown={(e) => startResize(e, el, "bottom")}
                        title="Drag to resize height"
                        style={{ position: "absolute", bottom: -5, left: "50%", marginLeft: -6, width: 12, height: 10, borderRadius: 3, background: "#fff", border: "1px solid var(--accent)", cursor: "ns-resize", zIndex: 2 }}
                      />
                      <div
                        onMouseDown={(e) => startResize(e, el, "left")}
                        title="Drag to resize width"
                        style={{ position: "absolute", left: -5, top: "50%", marginTop: -6, width: 10, height: 12, borderRadius: 3, background: "#fff", border: "1px solid var(--accent)", cursor: "ew-resize", zIndex: 2 }}
                      />
                      <div
                        onMouseDown={(e) => startResize(e, el, "right")}
                        title="Drag to resize width"
                        style={{ position: "absolute", right: -5, top: "50%", marginTop: -6, width: 10, height: 12, borderRadius: 3, background: "#fff", border: "1px solid var(--accent)", cursor: "ew-resize", zIndex: 2 }}
                      />
                    </>
                  )}
                </div>
              );
            })}
            </div>
          </div>

          <div style={{ width: 240, borderLeft: "1px solid var(--border)", padding: 16, overflowY: "auto" }}>
            {selected ? (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", letterSpacing: "0.05em", marginBottom: 12 }}>
                  {selected.kind === "wall" ? "WALL" : "TABLE"}
                </div>
                {selected.kind === "table" && (
                  <>
                    <PropField label="Label">
                      <input value={selected.label} onChange={(e) => updateSelected({ label: e.target.value })} style={propInputStyle} />
                    </PropField>
                    <PropField label="Seats">
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={selected.seats}
                        onChange={(e) => updateSelected({ seats: Math.max(1, parseInt(e.target.value) || 1) })}
                        style={propInputStyle}
                      />
                    </PropField>
                  </>
                )}
                <PropField label={`Width: ${selected.w}px`}>
                  <input
                    type="range"
                    min={20}
                    max={320}
                    value={selected.w}
                    onChange={(e) => updateSelected({ w: parseInt(e.target.value) })}
                    style={sliderStyle}
                  />
                </PropField>
                <PropField label={`Height: ${selected.h}px`}>
                  <input
                    type="range"
                    min={8}
                    max={320}
                    value={selected.h}
                    onChange={(e) => updateSelected({ h: parseInt(e.target.value) })}
                    style={sliderStyle}
                  />
                </PropField>
                <PropField label={`Rotation: ${Math.round(selected.rotation || 0)}°`}>
                  <input
                    type="range"
                    min={0}
                    max={359}
                    value={Math.round(selected.rotation || 0)}
                    onChange={(e) => updateSelected({ rotation: parseInt(e.target.value) })}
                    style={sliderStyle}
                  />
                </PropField>
                <button
                  onClick={duplicateSelected}
                  style={{ marginTop: 6, width: "100%", padding: "9px", borderRadius: 8, border: "1px solid var(--accent)", background: "transparent", color: "var(--accent)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
                >
                  Duplicate
                </button>
                <button
                  onClick={deleteSelected}
                  style={{ marginTop: 8, width: "100%", padding: "9px", borderRadius: 8, border: "1px solid var(--danger)", background: "transparent", color: "var(--danger)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
                >
                  Delete element
                </button>
              </>
            ) : (
              <div style={{ fontSize: 13, color: "var(--text-dim)" }}>
                Select a table or wall to edit its details, or add a new one from the left.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolButton({ onClick, label, icon }) {
  const icons = {
    circle: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
      </svg>
    ),
    square: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="4" y="4" width="16" height="16" rx="2" />
      </svg>
    ),
    rect: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="7" width="20" height="10" rx="2" />
      </svg>
    ),
    wall: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
        <line x1="3" y1="12" x2="21" y2="12" />
      </svg>
    ),
  };
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "9px 10px",
        borderRadius: 8,
        border: "1px solid var(--border)",
        background: "var(--panel)",
        color: "var(--text)",
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "inherit",
        textAlign: "left",
      }}
    >
      {icons[icon]}
      {label}
    </button>
  );
}

function PropField({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

const propInputStyle = {
  width: "100%",
  padding: "7px 9px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--panel-raised)",
  color: "var(--text)",
  fontFamily: "inherit",
  fontSize: 12,
  boxSizing: "border-box",
};

const sliderStyle = {
  width: "100%",
  accentColor: "var(--accent)",
  cursor: "pointer",
};


function LegendRow({ color, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-dim)", marginBottom: 6 }}>
      <span style={{ width: 14, height: 14, borderRadius: 4, background: color, border: "1px solid var(--border)" }} />
      {label}
    </div>
  );
}

function LiveBoard({ bookings, tables, sittings, date, toggleArrival, setArrivalAll, onEditBooking }) {
  const [tick, setTick] = useState(0);
  const [kiosk, setKiosk] = useState(false);
  const kioskRef = useRef(null);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000); // re-check every 30s so cards move lanes on their own
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    function handleFsChange() {
      if (!document.fullscreenElement) setKiosk(false);
    }
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  async function enterKiosk() {
    setKiosk(true);
    try {
      if (kioskRef.current && kioskRef.current.requestFullscreen) {
        await kioskRef.current.requestFullscreen();
      }
    } catch (err) {
      // Fullscreen can be blocked by the browser/embed context — the big vertical layout still applies either way.
    }
  }

  function exitKiosk() {
    setKiosk(false);
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }

  if (date !== todayISO()) {
    return (
      <div style={{ padding: "0 28px 40px" }}>
        <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 14, padding: 40, textAlign: "center", color: "var(--text-dim)", fontSize: 14 }}>
          Live Board shows real-time status and only makes sense for today.
          <br />
          Switch the date back to today to use it.
        </div>
      </div>
    );
  }

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const lanes = { upcoming: [], arriving: [], seated: [], attention: [], finished: [] };

  bookings.forEach((b) => {
    const start = bookingStartMinutes(b, sittings);
    const end = bookingEndMinutes(b, sittings);
    if (start === null) return;
    const arrived = arrivedArray(b);
    const allArrived = arrived.every(Boolean);
    const anyArrived = arrived.some(Boolean);

    if (allArrived && nowMinutes > end + 30) {
      lanes.finished.push(b);
    } else if (allArrived && nowMinutes > end) {
      lanes.attention.push(b);
    } else if (allArrived) {
      lanes.seated.push(b);
    } else if (anyArrived && nowMinutes > start) {
      lanes.attention.push(b); // partially arrived, overdue on the rest
    } else if (!anyArrived && nowMinutes > start + 15) {
      lanes.attention.push(b); // no-show risk
    } else if (start - nowMinutes <= 15) {
      lanes.arriving.push(b);
    } else {
      lanes.upcoming.push(b);
    }
  });

  const laneOrder = [
    { key: "upcoming", label: "Upcoming", color: "var(--text-dim)" },
    { key: "arriving", label: "Arriving Soon", color: "var(--accent)" },
    { key: "seated", label: "Seated", color: "var(--success)" },
    { key: "attention", label: "Needs Attention", color: "var(--danger)" },
  ];

  function renderBoard(big) {
    return (
      <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: big ? 24 : 16 }}>
          {laneOrder.map((lane) => (
            <div key={lane.key}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: big ? 16 : 12 }}>
                <span style={{ width: big ? 12 : 8, height: big ? 12 : 8, borderRadius: 999, background: lane.color }} />
                <div style={{ fontSize: big ? 16 : 12, fontWeight: 700, letterSpacing: "0.05em", color: "var(--text-dim)" }}>
                  {lane.label.toUpperCase()} ({lanes[lane.key].length})
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: big ? 14 : 10 }}>
                {lanes[lane.key].length === 0 && (
                  <div style={{ fontSize: big ? 15 : 12, color: "var(--text-faint)", fontStyle: "italic" }}>Nothing here</div>
                )}
                {lanes[lane.key].map((b) => {
                  const table = tables.find((t) => t.id === b.tableId);
                  const arrived = arrivedArray(b);
                  const arrivedCount = arrived.filter(Boolean).length;
                  const isAttention = lane.key === "attention";
                  const end = bookingEndMinutes(b, sittings);
                  const overMinutes = isAttention && end !== null ? Math.max(0, nowMinutes - end) : 0;
                  return (
                    <div
                      key={b.id}
                      onClick={() => onEditBooking(b.id)}
                      title="Click to edit this booking"
                      style={{
                        background: "var(--panel)",
                        border: `${big ? 2 : 1.5}px solid ${isAttention ? "var(--danger)" : "var(--border)"}`,
                        borderRadius: big ? 16 : 12,
                        padding: big ? 20 : 14,
                        animation: isAttention ? "liveGlow 1.6s ease-in-out infinite" : "none",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ fontSize: big ? 22 : 16, fontWeight: 800, marginBottom: 2, display: "flex", alignItems: "center" }}>
                        {b.name}
                        <OccasionIcons notes={b.notes} size={big ? 16 : 13} />
                      </div>
                      <div className="wv-mono" style={{ fontSize: big ? 16 : 12, color: "var(--text-dim)", marginBottom: big ? 14 : 10 }}>
                        {table?.label || b.tableId} · {b.partySize}p · {bookingTimeRangeLabel(b, sittings)}
                      </div>
                      {isAttention && overMinutes > 0 && (
                        <div style={{ fontSize: big ? 15 : 12, fontWeight: 700, color: "var(--danger)", marginBottom: big ? 14 : 10 }}>
                          ⚠ {overMinutes} min over
                        </div>
                      )}
                      {isAttention && overMinutes === 0 && arrivedCount < b.partySize && (
                        <div style={{ fontSize: big ? 15 : 12, fontWeight: 700, color: "var(--danger)", marginBottom: big ? 14 : 10 }}>
                          ⚠ Not fully checked in — {arrivedCount}/{b.partySize} arrived
                        </div>
                      )}
                      {lane.key !== "seated" && lane.key !== "finished" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setArrivalAll(b.id, true); }}
                          style={{ width: "100%", padding: big ? "10px" : "7px", borderRadius: 7, border: "none", background: "var(--accent)", color: "#fff", fontSize: big ? 14 : 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                        >
                          Check in
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {lanes.finished.length > 0 && (
          <div style={{ marginTop: big ? 32 : 24, fontSize: big ? 14 : 12, color: "var(--text-faint)" }}>
            {lanes.finished.length} booking{lanes.finished.length > 1 ? "s" : ""} finished tonight — {lanes.finished.map((b) => b.name).join(", ")}
          </div>
        )}
      </>
    );
  }

  return (
    <div ref={kioskRef} style={{ padding: "0 28px 40px" }}>
      <style>{`
        @keyframes liveGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,69,58,0.5); }
          50% { box-shadow: 0 0 0 8px rgba(255,69,58,0); }
        }
      `}</style>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button onClick={enterKiosk} className="lib-pill is-active" style={{ fontSize: 13 }}>⛶ Full Screen</button>
      </div>

      {renderBoard(false)}

      {kiosk && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 30,
            background: "var(--bg)",
            overflow: "auto",
            padding: 32,
          }}
        >
          <style>{`
            @keyframes liveGlow {
              0%, 100% { box-shadow: 0 0 0 0 rgba(255,69,58,0.5); }
              50% { box-shadow: 0 0 0 8px rgba(255,69,58,0); }
            }
          `}</style>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
            <button onClick={exitKiosk} className="lib-pill" style={{ fontSize: 14 }}>✕ Exit Full Screen</button>
          </div>
          {renderBoard(true)}
        </div>
      )}
    </div>
  );
}

function TimelineDay({ bookings, tables, sittings, date, onEditBooking }) {
  const PX_PER_MIN = 2.2;
  const ROW_H = 48;
  const LABEL_W = 140;

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000); // keep the now-line moving
    return () => clearInterval(id);
  }, []);

  const isToday = date === todayISO();
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const starts = bookings.map((b) => bookingStartMinutes(b, sittings)).filter((x) => x !== null);
  const ends = bookings.map((b) => bookingEndMinutes(b, sittings)).filter((x) => x !== null);
  const sittingTimes = sittings.map((s) => timeToMinutes(s.time24));
  const allPoints = [...starts, ...sittingTimes, ...(isToday ? [nowMinutes] : [])];

  let axisStart = allPoints.length ? Math.min(...allPoints) : 17 * 60;
  let axisEnd = ends.length ? Math.max(...ends, ...sittingTimes.map((m) => m + DEFAULT_BOOKING_DURATION), ...(isToday ? [nowMinutes] : [])) : 23 * 60;
  axisStart = Math.floor((axisStart - 30) / 30) * 30;
  axisEnd = Math.ceil((axisEnd + 30) / 30) * 30;
  const totalWidth = Math.max(200, (axisEnd - axisStart) * PX_PER_MIN);
  const nowLineLeft = isToday && nowMinutes >= axisStart && nowMinutes <= axisEnd ? (nowMinutes - axisStart) * PX_PER_MIN : null;

  const hourMarks = [];
  for (let m = Math.ceil(axisStart / 60) * 60; m <= axisEnd; m += 60) {
    hourMarks.push({ minutes: m, label: formatTime12(minutesToTime24(m)) });
  }

  const sortedTables = sortByPriority(tables);

  return (
    <div style={{ padding: "0 28px 40px" }}>
      <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
        {sortedTables.length === 0 ? (
          <div style={{ padding: 24, fontSize: 13, color: "var(--text-faint)" }}>No tables set up yet — add some in the Floor Plan Builder.</div>
        ) : (
          <div style={{ maxHeight: "65vh", overflow: "auto" }}>
            <div style={{ width: LABEL_W + totalWidth, position: "relative" }}>
              {nowLineLeft !== null && (
                <div
                  style={{
                    position: "absolute",
                    left: LABEL_W + nowLineLeft,
                    top: 0,
                    bottom: 0,
                    width: 2,
                    background: "var(--danger)",
                    zIndex: 5,
                    pointerEvents: "none",
                  }}
                >
                  <div
                    className="wv-mono"
                    style={{
                      position: "sticky",
                      top: 0,
                      transform: "translateX(-50%)",
                      background: "var(--danger)",
                      color: "#fff",
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "2px 6px",
                      borderRadius: 4,
                      whiteSpace: "nowrap",
                    }}
                  >
                    NOW {formatTime12(minutesToTime24(nowMinutes))}
                  </div>
                </div>
              )}
              {/* Header row: hour marks, sticky to top */}
              <div style={{ display: "flex", position: "sticky", top: 0, zIndex: 3 }}>
                <div style={{ width: LABEL_W, flexShrink: 0, position: "sticky", left: 0, zIndex: 4, background: "var(--panel)", borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }} />
                <div style={{ position: "relative", width: totalWidth, height: 32, background: "var(--panel)", borderBottom: "1px solid var(--border)" }}>
                  {hourMarks.map((h) => (
                    <div
                      key={h.minutes}
                      className="wv-mono"
                      style={{
                        position: "absolute",
                        left: (h.minutes - axisStart) * PX_PER_MIN,
                        top: 0,
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        fontSize: 11,
                        color: "var(--text-dim)",
                        borderLeft: "1px solid var(--border)",
                        paddingLeft: 6,
                      }}
                    >
                      {h.label}
                    </div>
                  ))}
                </div>
              </div>

              {/* Table rows */}
              {sortedTables.map((t) => {
                const rowBookings = bookings
                  .filter((b) => b.tableId === t.id)
                  .map((b) => ({ b, start: bookingStartMinutes(b, sittings), end: bookingEndMinutes(b, sittings) }))
                  .filter((x) => x.start !== null);
                return (
                  <div key={t.id} style={{ display: "flex", borderBottom: "1px solid var(--border)" }}>
                    <div
                      style={{
                        width: LABEL_W,
                        flexShrink: 0,
                        position: "sticky",
                        left: 0,
                        zIndex: 2,
                        background: "var(--panel)",
                        borderRight: "1px solid var(--border)",
                        padding: "8px 12px",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 700 }}>{t.label}</div>
                      <div style={{ fontSize: 10, color: "var(--text-dim)" }}>{t.seats} seats</div>
                    </div>
                    <div style={{ position: "relative", width: totalWidth, height: ROW_H, background: "var(--bg)" }}>
                      {hourMarks.map((h) => (
                        <div key={h.minutes} style={{ position: "absolute", left: (h.minutes - axisStart) * PX_PER_MIN, top: 0, bottom: 0, borderLeft: "1px solid var(--border)", opacity: 0.5 }} />
                      ))}
                      {rowBookings.map(({ b, start, end }) => {
                        const left = (start - axisStart) * PX_PER_MIN;
                        const width = Math.max(50, (end - start) * PX_PER_MIN);
                        const barBg = b.depositRequired && !b.depositPaid ? "var(--warning)" : "var(--accent)";
                        const canShowDetail = width >= 130;
                        return (
                          <div
                            key={b.id}
                            onClick={() => onEditBooking(b.id)}
                            title={`${b.name} · ${b.partySize} guests · ${bookingTimeRangeLabel(b, sittings)} — click to edit`}
                            style={{
                              position: "absolute",
                              left,
                              top: 5,
                              width,
                              height: ROW_H - 10,
                              background: barBg,
                              borderRadius: 6,
                              display: "flex",
                              flexDirection: "column",
                              justifyContent: "center",
                              padding: "0 8px",
                              overflow: "hidden",
                              cursor: "pointer",
                              boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
                            }}
                          >
                            <span className="wv-mono" style={{ fontSize: 11, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {b.name}
                              {canShowDetail && <OccasionIcons notes={b.notes} size={11} />}
                            </span>
                            {canShowDetail && (
                              <span className="wv-mono" style={{ fontSize: 9.5, color: "rgba(255,255,255,0.85)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {bookingTimeRangeLabel(b, sittings)} · {b.partySize}p
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CustomerPortal({ bookings, tables, sittings, customerNotes, onSaveNote, initialEmail, onClose }) {
  const [search, setSearch] = useState("");
  const [onlyUpcoming, setOnlyUpcoming] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState(initialEmail || null);
  const [draftNote, setDraftNote] = useState(() => (initialEmail ? customerNotes[initialEmail] || "" : ""));
  const [justSaved, setJustSaved] = useState(false);

  // Derive one row per unique customer (by email) from every booking ever made,
  // same shape the real customers table on the backend produces.
  const customers = {};
  bookings.forEach((b) => {
    if (!b.email) return;
    if (!customers[b.email]) {
      customers[b.email] = { email: b.email, name: b.name, phone: b.phone, bookings: [] };
    }
    customers[b.email].bookings.push(b);
    // keep the most recently created booking's name/phone as the "current" details
    const existing = customers[b.email];
    const latest = existing.bookings.reduce((a, c) => (new Date(c.createdAt) > new Date(a.createdAt) ? c : a));
    existing.name = latest.name;
    existing.phone = latest.phone;
  });
  let customerList = Object.values(customers).map((c) => ({
    ...c,
    lastBookingDate: c.bookings.reduce((max, b) => (b.date > max ? b.date : max), ""),
    occasions: getCustomerOccasions(c.bookings),
  }));
  customerList.forEach((c) => {
    const upcoming = c.occasions.filter((o) => o.recurring && o.daysUntil <= 30);
    c.soonestUpcoming = upcoming.length ? upcoming.reduce((a, o) => (o.daysUntil < a.daysUntil ? o : a)) : null;
  });
  customerList.sort((a, b) => (b.lastBookingDate > a.lastBookingDate ? 1 : -1));

  const upcomingCount = customerList.filter((c) => c.soonestUpcoming).length;

  if (onlyUpcoming) {
    customerList = customerList.filter((c) => c.soonestUpcoming).sort((a, b) => a.soonestUpcoming.daysUntil - b.soonestUpcoming.daysUntil);
  }

  const q = search.trim().toLowerCase();
  if (q) {
    customerList = customerList.filter(
      (c) =>
        (c.name || "").toLowerCase().includes(q) ||
        (c.email || "").toLowerCase().includes(q) ||
        (c.phone || "").toLowerCase().includes(q)
    );
  }

  const selected = selectedEmail ? customers[selectedEmail] : null;

  function openCustomer(email) {
    setSelectedEmail(email);
    setDraftNote(customerNotes[email] || "");
  }

  function saveNote() {
    onSaveNote(selectedEmail, draftNote);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1500);
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 55 }} />
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 56,
          width: 820,
          maxWidth: "calc(100vw - 40px)",
          height: "min(680px, calc(100vh - 60px))",
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          boxShadow: "0 16px 48px rgba(0,0,0,0.55)",
          display: "flex",
          overflow: "hidden",
        }}
      >
        {/* Left: search + results */}
        <div style={{ width: 320, flexShrink: 0, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: 18, borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Customers</div>
              <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>✕</button>
            </div>
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, or phone..."
              style={{ width: "100%", padding: "9px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--panel-raised)", color: "var(--text)", fontFamily: "inherit", fontSize: 13, boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
                {customerList.length} customer{customerList.length !== 1 ? "s" : ""}
              </div>
              {upcomingCount > 0 && (
                <button
                  onClick={() => setOnlyUpcoming((v) => !v)}
                  className="wv-mono"
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "4px 8px",
                    borderRadius: 6,
                    border: `1px solid ${onlyUpcoming ? "var(--accent)" : "var(--border)"}`,
                    background: onlyUpcoming ? "var(--accent)" : "transparent",
                    color: onlyUpcoming ? "#fff" : "var(--text-dim)",
                    cursor: "pointer",
                  }}
                >
                  🎉 Upcoming ({upcomingCount})
                </button>
              )}
            </div>
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {customerList.length === 0 && (
              <div style={{ padding: 18, fontSize: 13, color: "var(--text-faint)" }}>No matches.</div>
            )}
            {customerList.map((c) => (
              <button
                key={c.email}
                onClick={() => openCustomer(c.email)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "12px 18px",
                  background: selectedEmail === c.email ? "var(--panel-raised)" : "transparent",
                  border: "none",
                  borderBottom: "1px solid var(--border)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  color: "var(--text)",
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                  {c.name}
                  {c.soonestUpcoming && (
                    <span title={`${c.soonestUpcoming.label} in ${c.soonestUpcoming.daysUntil} days`} style={{ fontSize: 13 }}>
                      {c.soonestUpcoming.icon}
                    </span>
                  )}
                </div>
                <div className="wv-mono" style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>{c.email}</div>
                <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 3 }}>
                  {c.bookings.length} booking{c.bookings.length !== 1 ? "s" : ""} · last {formatDMY(c.lastBookingDate)}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right: selected customer detail */}
        <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          {!selected ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-faint)", fontSize: 14 }}>
              Select a customer to see their history
            </div>
          ) : (
            <>
              <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>{selected.name}</div>
              <div className="wv-mono" style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 20 }}>
                {selected.email} · {selected.phone}
              </div>

              {(() => {
                const occasions = getCustomerOccasions(selected.bookings);
                if (occasions.length === 0) return null;
                return (
                  <div style={{ marginBottom: 22 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", color: "var(--text-dim)", marginBottom: 10 }}>
                      SPECIAL OCCASIONS
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {occasions.map((o) => (
                        <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--panel-raised)", borderRadius: 8, padding: "8px 12px" }}>
                          <span style={{ fontSize: 18 }}>{o.icon}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{o.label}</div>
                            <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                              Last mentioned {formatDMY(o.date)}
                              {o.recurring && (
                                <span style={{ color: o.daysUntil <= 30 ? "var(--accent)" : "var(--text-dim)", fontWeight: o.daysUntil <= 30 ? 700 : 400 }}>
                                  {" "}· next up {o.daysUntil === 0 ? "today" : `in ${o.daysUntil} days`}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", color: "var(--text-dim)", marginBottom: 10 }}>
                BOOKING HISTORY ({selected.bookings.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
                {[...selected.bookings]
                  .sort((a, b) => (b.date > a.date ? 1 : -1))
                  .map((b) => {
                    const table = tables.find((t) => t.id === b.tableId);
                    return (
                      <div key={b.id} style={{ background: "var(--panel-raised)", borderRadius: 8, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{formatDMY(b.date)}</div>
                          <div className="wv-mono" style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>
                            {bookingTimeDisplay(b, sittings)} · {table?.label || b.tableId || "—"} · {b.partySize}p
                          </div>
                        </div>
                        <span
                          className="lib-badge"
                          style={{
                            background: b.status === "cancelled" ? "rgba(255,69,58,0.18)" : "rgba(52,199,89,0.18)",
                            color: b.status === "cancelled" ? "var(--danger)" : "var(--success)",
                          }}
                        >
                          {b.status || "confirmed"}
                        </span>
                      </div>
                    );
                  })}
              </div>

              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", color: "var(--text-dim)", marginBottom: 10 }}>
                NOTES
              </div>
              <textarea
                value={draftNote}
                onChange={(e) => setDraftNote(e.target.value)}
                placeholder="e.g. allergies, seating preference, birthday..."
                style={{
                  width: "100%",
                  minHeight: 90,
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--panel-raised)",
                  color: "var(--text)",
                  fontFamily: "inherit",
                  fontSize: 13,
                  lineHeight: 1.6,
                  padding: 10,
                  resize: "vertical",
                  boxSizing: "border-box",
                  marginBottom: 10,
                }}
              />
              <button
                onClick={saveNote}
                style={{
                  padding: "9px 16px",
                  borderRadius: 8,
                  border: "none",
                  background: justSaved ? "var(--success)" : "var(--accent)",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {justSaved ? "Saved ✓" : "Save note"}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function MiniStat({ label, value, warn }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-dim)", letterSpacing: "0.05em", marginBottom: 2 }}>{label.toUpperCase()}</div>
      <div className="wv-mono" style={{ fontSize: 18, fontWeight: 800, color: warn ? "var(--warning)" : "var(--text)" }}>{value}</div>
    </div>
  );
}

function Row2({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "4px 0", color: "var(--text)" }}>
      <span style={{ color: "var(--text-dim)" }}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: "right", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}

export { LIB_TOKENS };
