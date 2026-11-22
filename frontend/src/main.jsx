import React, { useState, useEffect, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import { CustomerBooking, OwnerDashboard, fontStyles, setRestaurantInfo, LIB_TOKENS } from "./App.jsx";
import { makeApi, loadToken, saveToken } from "./api.js";

/* Addresses:
   /                      → Dorsia holding page
   /<restaurant>          → public booking page, e.g. /don-camillo
   /<restaurant>/admin    → owner dashboard (login required)          */

function Centered({ children, dark }) {
  return (
    <div
      className="wv-body"
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: dark ? "#000" : "#F3ECDD",
        color: dark ? "#fff" : "#2A2420",
        padding: 24,
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 420 }}>{children}</div>
    </div>
  );
}

function Landing() {
  return (
    <Centered>
      <div className="wv-mono" style={{ fontSize: 11, letterSpacing: "0.2em", color: "#8B7A5E", marginBottom: 10 }}>
        RESTAURANT BOOKINGS
      </div>
      <h1 className="wv-display" style={{ fontSize: 44, fontWeight: 500, margin: 0, color: "#1B2430" }}>Dorsia</h1>
    </Centered>
  );
}

/* ---------- Public booking page ---------- */

function CustomerApp({ slug }) {
  const api = useRef(makeApi(slug)).current;
  const [config, setConfig] = useState(null);
  const [slots, setSlots] = useState([]);
  const [error, setError] = useState("");

  const refreshSlots = useCallback(async () => {
    try {
      setSlots(await api.get("/public/availability"));
    } catch {
      /* keep the last known availability; the server re-checks every booking anyway */
    }
  }, [api]);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await api.get("/public/config");
        setRestaurantInfo(cfg);
        document.title = `${cfg.name} · Book a table`;
        await refreshSlots();
        setConfig(cfg);
      } catch (e) {
        setError(e.status === 404 ? "We couldn't find that restaurant." : e.message);
      }
    })();
  }, [api, refreshSlots]);

  const submit = useCallback(
    async (details) => {
      try {
        return await api.post("/public/bookings", details);
      } finally {
        refreshSlots();
      }
    },
    [api, refreshSlots]
  );

  if (error) return <Centered>{error}</Centered>;
  if (!config) return <Centered>Loading...</Centered>;
  return (
    <div style={{ minHeight: "100vh", background: "#F3ECDD" }}>
      <CustomerBooking
        bookings={slots}
        tables={config.tables}
        sittings={config.sittings}
        terms={config.terms}
        square={config.square}
        onSubmit={submit}
      />
    </div>
  );
}

/* ---------- Owner login ---------- */

const darkInput = {
  width: "100%",
  padding: "11px 12px",
  borderRadius: 8,
  border: "1px solid #38383A",
  background: "#1C1C1E",
  color: "#fff",
  fontSize: 14,
  fontFamily: "inherit",
  boxSizing: "border-box",
  marginBottom: 12,
};
const darkButton = {
  width: "100%",
  padding: 12,
  borderRadius: 8,
  border: "none",
  background: "#0A84FF",
  color: "#fff",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};

function Login({ slug, api, onLoggedIn }) {
  const [status, setStatus] = useState(null);
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [setupKey, setSetupKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get("/auth/status")
      .then((s) => {
        setStatus(s);
        if (!s.hasOwner && s.setupEnabled) setMode("setup");
      })
      .catch((e) => setError(e.status === 404 ? "We couldn't find that restaurant." : e.message));
  }, [api]);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res =
        mode === "setup"
          ? await api.post("/auth/setup", { setupKey, email, password })
          : await api.post("/auth/login", { email, password });
      onLoggedIn(res.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Centered dark>
      <form onSubmit={submit} style={{ textAlign: "left", width: 340, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
        <div style={{ fontSize: 11, letterSpacing: "0.2em", color: "#636366", marginBottom: 6 }}>DORSIA · OWNER DASHBOARD</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 20px" }}>{mode === "setup" ? "Create the owner account" : "Log in"}</h1>
        {mode === "setup" && (
          <>
            <div style={{ fontSize: 12, color: "#98989D", marginBottom: 12, lineHeight: 1.5 }}>
              First-time setup for <strong>{slug}</strong>. Enter the setup key from Render's environment settings.
            </div>
            <input placeholder="Setup key" value={setupKey} onChange={(e) => setSetupKey(e.target.value)} style={darkInput} autoComplete="off" />
          </>
        )}
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={darkInput} autoComplete="username" required />
        <input
          type="password"
          placeholder={mode === "setup" ? "Choose a password (10+ characters)" : "Password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={darkInput}
          autoComplete={mode === "setup" ? "new-password" : "current-password"}
          required
        />
        {error && <div style={{ fontSize: 13, color: "#FF453A", marginBottom: 12 }}>{error}</div>}
        <button type="submit" disabled={busy || !status} style={{ ...darkButton, opacity: busy ? 0.6 : 1 }}>
          {busy ? "Please wait..." : mode === "setup" ? "Create account" : "Log in"}
        </button>
        {status && !status.hasOwner && status.setupEnabled && (
          <button
            type="button"
            onClick={() => setMode(mode === "setup" ? "login" : "setup")}
            style={{ marginTop: 14, background: "none", border: "none", color: "#0A84FF", cursor: "pointer", fontSize: 12, padding: 0 }}
          >
            {mode === "setup" ? "I already have an account" : "First time? Create the owner account"}
          </button>
        )}
      </form>
    </Centered>
  );
}

/* ---------- Owner dashboard ---------- */

// Turns a booking from the dashboard into what the server expects.
function bookingPayload(b) {
  const out = {};
  [
    "date", "sitting", "customTime24", "durationMinutes", "partySize", "name", "email", "phone",
    "tableId", "depositPaid", "notes", "source", "arrived",
  ].forEach((k) => {
    if (b[k] !== undefined) out[k] = b[k];
  });
  return out;
}

function AdminApp({ slug }) {
  const [token, setTokenState] = useState(() => loadToken(slug));
  const tokenRef = useRef(token);
  const setToken = useCallback(
    (t) => {
      tokenRef.current = t;
      saveToken(slug, t);
      setTokenState(t);
    },
    [slug]
  );
  const api = useRef(makeApi(slug, () => tokenRef.current, () => setToken(null))).current;

  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [user, setUser] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [floorElements, setFloorElementsState] = useState([]);
  const [roomSize, setRoomSizeState] = useState({ w: 880, h: 380 });
  const [sections, setSectionsState] = useState([{ id: "main", name: "Main" }]);
  const [sittings, setSittingsState] = useState([]);
  const [terms, setTermsState] = useState("");
  const [customers, setCustomers] = useState([]);

  const bookingsRef = useRef([]);
  bookingsRef.current = bookings;
  const pending = useRef(0);
  const floorRef = useRef({ elements: [], roomSize: { w: 880, h: 380 }, sections: [] });
  const floorTimer = useRef(null);

  const report = useCallback((e) => {
    setNotice(e.message || "Something went wrong. Your last change may not have saved.");
  }, []);

  const loadState = useCallback(async () => {
    const s = await api.get("/admin/state");
    setRestaurantInfo(s.restaurant);
    document.title = `${s.restaurant.name} · Dashboard`;
    setUser(s.user);
    setBookings(s.bookings);
    setFloorElementsState(s.floorElements);
    setRoomSizeState(s.restaurant.roomSize);
    setSectionsState(s.restaurant.sections);
    setSittingsState(s.sittings);
    setTermsState(s.restaurant.terms);
    setCustomers(s.customers);
    floorRef.current = { elements: s.floorElements, roomSize: s.restaurant.roomSize, sections: s.restaurant.sections };
  }, [api]);

  useEffect(() => {
    if (!token) return;
    setLoaded(false);
    setLoadError("");
    loadState()
      .then(() => setLoaded(true))
      .catch((e) => {
        if (e.status !== 401) setLoadError(e.message);
      });
  }, [token, loadState]);

  // Pick up new online bookings every 30 seconds.
  useEffect(() => {
    if (!token || !loaded) return;
    const id = setInterval(async () => {
      if (pending.current > 0) return;
      try {
        const fresh = await api.get("/admin/bookings");
        if (pending.current === 0) setBookings(fresh);
      } catch {
        /* try again next time */
      }
    }, 30000);
    return () => clearInterval(id);
  }, [token, loaded, api]);

  // Runs a save; if it fails, shows the error and reloads bookings from the server.
  const run = useCallback(
    async (fn) => {
      pending.current += 1;
      try {
        return await fn();
      } catch (e) {
        report(e);
        try {
          setBookings(await api.get("/admin/bookings"));
        } catch {
          /* ignore */
        }
        return null;
      } finally {
        pending.current -= 1;
      }
    },
    [api, report]
  );

  const replaceBooking = (saved) => setBookings((prev) => prev.map((b) => (b.id === saved.id ? saved : b)));

  const addBooking = useCallback(
    (b) =>
      run(async () => {
        const saved = await api.post("/admin/bookings", bookingPayload(b));
        setBookings((prev) => [...prev, saved]);
      }),
    [api, run]
  );

  const removeBooking = useCallback(
    (id) => {
      setBookings((prev) => prev.filter((b) => b.id !== id));
      return run(() => api.del(`/admin/bookings/${id}`));
    },
    [api, run]
  );

  const updateBooking = useCallback(
    (id, patch) => {
      setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
      return run(async () => replaceBooking(await api.patch(`/admin/bookings/${id}`, bookingPayload(patch))));
    },
    [api, run]
  );

  const saveArrived = useCallback(
    (id, makeArrived) => {
      const current = bookingsRef.current.find((b) => b.id === id);
      if (!current) return;
      const arrived = makeArrived(current);
      setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, arrived } : b)));
      return run(async () => replaceBooking(await api.patch(`/admin/bookings/${id}`, { arrived })));
    },
    [api, run]
  );

  const toggleArrival = useCallback(
    (id, index) =>
      saveArrived(id, (b) => {
        const cur = Array.isArray(b.arrived) && b.arrived.length === b.partySize ? b.arrived : Array(b.partySize).fill(false);
        const next = [...cur];
        next[index] = !next[index];
        return next;
      }),
    [saveArrived]
  );
  const setArrivalAll = useCallback((id, value) => saveArrived(id, (b) => Array(b.partySize).fill(value)), [saveArrived]);

  const refundDeposit = useCallback(
    (id) => run(async () => replaceBooking(await api.post(`/admin/bookings/${id}/refund`))),
    [api, run]
  );

  // Floor plan, room size and sections are saved together, half a second after the last change.
  const scheduleFloorSave = useCallback(() => {
    clearTimeout(floorTimer.current);
    floorTimer.current = setTimeout(() => {
      run(() => api.put("/admin/floor", floorRef.current));
    }, 500);
  }, [api, run]);

  const makeFloorSetter = (key, setState) => (value) => {
    setState((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      floorRef.current = { ...floorRef.current, [key]: next };
      return next;
    });
    scheduleFloorSave();
  };
  const setFloorElements = useCallback(makeFloorSetter("elements", setFloorElementsState), [scheduleFloorSave]);
  const setRoomSize = useCallback(makeFloorSetter("roomSize", setRoomSizeState), [scheduleFloorSave]);
  const setSections = useCallback(makeFloorSetter("sections", setSectionsState), [scheduleFloorSave]);

  const setSittings = useCallback(
    (next) => {
      setSittingsState(next);
      return run(async () => setSittingsState(await api.put("/admin/sittings", next)));
    },
    [api, run]
  );

  const setTerms = useCallback(
    (next) => {
      setTermsState(next);
      return run(() => api.put("/admin/settings", { terms: next }));
    },
    [api, run]
  );

  const customerNotes = Object.fromEntries(customers.map((c) => [c.email, c.notes]));
  const setCustomerNote = useCallback(
    (email, text) =>
      run(async () => {
        let list = customers;
        let c = list.find((x) => x.email === email);
        if (!c) {
          list = (await api.get("/customers")).map((x) => ({ id: x.id, email: x.email, notes: x.notes || "" }));
          c = list.find((x) => x.email === email);
        }
        if (!c) throw new Error("Couldn't find that customer to save the note.");
        await api.patch(`/customers/${c.id}`, { notes: text });
        setCustomers(list.map((x) => (x.id === c.id ? { ...x, notes: text } : x)));
      }),
    [api, run, customers]
  );

  if (!token) return <Login slug={slug} api={api} onLoggedIn={setToken} />;
  if (loadError)
    return (
      <Centered dark>
        <div style={{ marginBottom: 16 }}>{loadError}</div>
        <button onClick={() => window.location.reload()} style={darkButton}>Try again</button>
      </Centered>
    );
  if (!loaded) return <Centered dark>Loading...</Centered>;

  return (
    <div style={{ minHeight: "100vh", background: "#000" }}>
      {notice && (
        <div
          style={{
            position: "fixed",
            top: 12,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 100,
            background: "#FF453A",
            color: "#fff",
            padding: "10px 16px",
            borderRadius: 10,
            fontSize: 13,
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            display: "flex",
            gap: 12,
            alignItems: "center",
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}
        >
          {notice}
          <button onClick={() => setNotice("")} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: 14 }}>
            ✕
          </button>
        </div>
      )}
      <OwnerDashboard
        bookings={bookings}
        floorElements={floorElements}
        setFloorElements={setFloorElements}
        roomSize={roomSize}
        setRoomSize={setRoomSize}
        sittings={sittings}
        setSittings={setSittings}
        terms={terms}
        setTerms={setTerms}
        sections={sections}
        setSections={setSections}
        addBooking={addBooking}
        removeBooking={removeBooking}
        updateBooking={updateBooking}
        toggleArrival={toggleArrival}
        setArrivalAll={setArrivalAll}
        customerNotes={customerNotes}
        setCustomerNote={setCustomerNote}
        refundDeposit={refundDeposit}
        userEmail={user?.email}
        bookingPageUrl={`/${slug}`}
        onLogout={() => setToken(null)}
      />
    </div>
  );
}

/* ---------- Start ---------- */

function Root() {
  const parts = window.location.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  let page;
  if (parts.length === 0) page = <Landing />;
  else if (parts.length === 1) page = <CustomerApp slug={parts[0]} />;
  else if (parts.length === 2 && parts[1] === "admin") page = <AdminApp slug={parts[0]} />;
  else page = <Centered>Page not found.</Centered>;
  return (
    <>
      <style>{fontStyles()}</style>
      <style>{LIB_TOKENS}</style>
      <style>{`html, body { margin: 0; padding: 0; } * { box-sizing: border-box; }`}</style>
      {page}
    </>
  );
}

createRoot(document.getElementById("root")).render(<Root />);
