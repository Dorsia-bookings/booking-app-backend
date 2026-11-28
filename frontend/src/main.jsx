import React, { useState, useEffect, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import { CustomerBooking, OwnerDashboard, fontStyles, setRestaurantInfo, LIB_TOKENS } from "./App.jsx";
import { makeApi, loadToken, saveToken, PLATFORM } from "./api.js";
import { Login, TeamModal, PasswordModal, PlatformApp, darkButton } from "./accounts.jsx";
import { SitePage } from "./site.jsx";
import { SiteEditor } from "./siteEditor.jsx";

/* Addresses:
   /                      → Dorsia holding page
   /<restaurant>          → the restaurant's website (if switched on), otherwise its booking page
   /<restaurant>/book     → the plain booking page
   /<restaurant>/admin    → restaurant dashboard (owner or staff login)
   /<restaurant>/offer/x  → waitlist offer link sent by text
   /admin                 → Dorsia master page (all restaurants)       */

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

function CustomerApp({ slug, bookingOnly = false }) {
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
        document.title = cfg.siteEnabled && !bookingOnly ? cfg.name : `${cfg.name} · Book a table`;
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

  const joinWaitlist = useCallback((details) => api.post("/public/waitlist", details), [api]);

  if (error) return <Centered>{error}</Centered>;
  if (!config) return <Centered>Loading...</Centered>;
  const bookingProps = {
    onJoinWaitlist: joinWaitlist,
    cutoffMinutes: config.cutoffMinutes,
    bookings: slots,
    tables: config.tables,
    sittings: config.sittings,
    terms: config.terms,
    square: config.square,
    onSubmit: submit,
  };
  if (config.siteEnabled && config.site && !bookingOnly) {
    return <SitePage name={config.name} site={config.site} booking={bookingProps} />;
  }
  return (
    <div style={{ minHeight: "100vh", background: "#F3ECDD" }}>
      <CustomerBooking
        onJoinWaitlist={joinWaitlist}
        cutoffMinutes={config.cutoffMinutes}
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

/* ---------- Waitlist offer link ---------- */

function friendlyDay(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });
}

const offerButton = {
  width: "100%",
  padding: "13px",
  borderRadius: 8,
  border: "none",
  background: "#6B2737",
  color: "#FBF8F0",
  fontSize: 15,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};

function OfferPage({ slug, token }) {
  const api = useRef(makeApi(slug)).current;
  const [offer, setOffer] = useState(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get(`/public/offer/${encodeURIComponent(token)}`)
      .then((o) => {
        setOffer(o);
        document.title = `${o.restaurant} · Table offer`;
      })
      .catch((e) => setError(e.message));
  }, [api, token]);

  async function answer(action) {
    setBusy(true);
    setError("");
    try {
      const r = await api.post(`/public/offer/${encodeURIComponent(token)}/${action}`);
      setDone(action === "accept" ? { accepted: true, ...r } : { accepted: false });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!offer) return <Centered>{error || "Loading..."}</Centered>;
  const card = { background: "#FFFDF8", border: "1px solid #E7DBC0", borderRadius: 14, padding: 28, textAlign: "left" };
  return (
    <Centered>
      <div className="wv-mono" style={{ fontSize: 11, letterSpacing: "0.2em", color: "#8B7A5E", marginBottom: 10 }}>WAITLIST</div>
      <h1 className="wv-display" style={{ fontSize: 34, fontWeight: 500, margin: "0 0 24px", color: "#1B2430" }}>{offer.restaurant}</h1>
      <div style={card}>
        <div style={{ fontSize: 15, marginBottom: 14 }}>
          {done?.accepted || offer.status === "booked" ? "Your table is booked." : `Hi ${offer.name}, a table has come free:`}
        </div>
        <div style={{ background: "#FBF8F0", borderRadius: 8, padding: 14, marginBottom: 18, fontSize: 14, lineHeight: 1.8 }}>
          <div>{friendlyDay(offer.date)}</div>
          <div>{offer.time}</div>
          <div>{offer.partySize} {offer.partySize === 1 ? "guest" : "guests"}</div>
          {done?.reference && <div className="wv-mono" style={{ color: "#8B7A5E" }}>{done.reference}</div>}
        </div>
        {error && <div style={{ color: "#963B3B", fontSize: 13, marginBottom: 14 }}>{error}</div>}
        {done ? (
          <div style={{ fontSize: 13, color: "#5B5145", lineHeight: 1.6 }}>
            {done.accepted
              ? done.depositRequired
                ? `Confirmed. A $${done.depositAmount} deposit applies; the restaurant will be in touch about it.`
                : "Confirmed. See you then."
              : "No problem, we've let the table go to the next person."}
          </div>
        ) : offer.status === "offered" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button style={offerButton} disabled={busy} onClick={() => answer("accept")}>{busy ? "Confirming..." : "Confirm this table"}</button>
            <button style={{ ...offerButton, background: "transparent", color: "#8B7A5E", border: "1.5px solid #DCD0B4" }} disabled={busy} onClick={() => answer("decline")}>
              No thanks
            </button>
            <div style={{ fontSize: 12, color: "#8B7A5E", textAlign: "center" }}>
              Please confirm by {new Date(offer.expiresAt).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: "#5B5145" }}>
            {offer.status === "booked" ? "See you then." : "Sorry, this offer is no longer available."}
          </div>
        )}
      </div>
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
  // Use this restaurant's own login if there is one, otherwise the Dorsia master login.
  const [login, setLogin] = useState(() => {
    const own = loadToken(slug);
    if (own) return { token: own, kind: "tenant" };
    const master = loadToken(PLATFORM);
    return master ? { token: master, kind: "platform" } : null;
  });
  const tokenRef = useRef(login?.token || null);
  const token = login?.token || null;
  const setToken = useCallback(
    (t) => {
      tokenRef.current = t;
      saveToken(slug, t);
      setLogin(t ? { token: t, kind: "tenant" } : null);
    },
    [slug]
  );
  const logOut = useCallback(() => {
    if (login?.kind === "platform") saveToken(PLATFORM, null);
    else saveToken(slug, null);
    tokenRef.current = null;
    setLogin(null);
  }, [login, slug]);
  const logOutRef = useRef(logOut);
  logOutRef.current = logOut;
  const api = useRef(makeApi(slug, () => tokenRef.current, () => logOutRef.current())).current;
  const [teamOpen, setTeamOpen] = useState(false);
  const [websiteOpen, setWebsiteOpen] = useState(false);
  const [restaurantName, setRestaurantName] = useState("");
  const [passwordOpen, setPasswordOpen] = useState(false);

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
  const [waitlist, setWaitlist] = useState(null);

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
    setRestaurantName(s.restaurant.name);
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

  const loadWaitlist = useCallback(async () => {
    try {
      setWaitlist(await api.get("/admin/waitlist"));
    } catch {
      /* try again next time */
    }
  }, [api]);

  // Pick up new online bookings and waitlist changes every 30 seconds.
  useEffect(() => {
    if (!token || !loaded) return;
    loadWaitlist();
    const id = setInterval(async () => {
      loadWaitlist();
      if (pending.current > 0) return;
      try {
        const fresh = await api.get("/admin/bookings");
        if (pending.current === 0) setBookings(fresh);
      } catch {
        /* try again next time */
      }
    }, 30000);
    return () => clearInterval(id);
  }, [token, loaded, api, loadWaitlist]);

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
  const removeBookingRef = useRef(removeBooking);
  removeBookingRef.current = removeBooking;

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

  // Waitlist actions throw on failure so the panel can show the message.
  const waitlistActions = {
    add: async (entry) => {
      await api.post("/admin/waitlist", entry);
      await loadWaitlist();
    },
    offer: async (id) => {
      await api.post(`/admin/waitlist/${id}/offer`);
      await loadWaitlist();
    },
    notify: async (id) => {
      try {
        await api.post(`/admin/waitlist/${id}/notify`);
      } finally {
        await loadWaitlist();
      }
    },
    setStatus: async (id, status) => {
      await api.patch(`/admin/waitlist/${id}`, { status });
      await loadWaitlist();
    },
    saveSettings: async (settings) => {
      await api.put("/admin/waitlist/settings", settings);
      await loadWaitlist();
    },
  };

  // A cancellation may free a table for someone on the waitlist (automatic mode texts them).
  const removeAndRefresh = useCallback(
    async (id) => {
      await removeBookingRef.current(id);
      setTimeout(loadWaitlist, 1500);
    },
    [loadWaitlist]
  );

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

  if (!token)
    return (
      <Login
        api={api}
        label="DORSIA · RESTAURANT DASHBOARD"
        paths={{ status: "/auth/status", login: "/auth/login", setup: "/auth/setup" }}
        setupHint={`First-time setup for "${slug}": this creates the owner login. Enter the setup key from Render's environment settings.`}
        onLoggedIn={setToken}
      />
    );
  const isOwner = user?.role === "owner";
  if (loadError)
    return (
      <Centered dark>
        <div style={{ marginBottom: 16 }}>{loadError}</div>
        <button onClick={() => window.location.reload()} style={darkButton}>Try again</button>
      </Centered>
    );
  if (!loaded) return <Centered dark>Loading...</Centered>;

  return (
    <div style={{ minHeight: "100vh" }}>
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
        removeBooking={removeAndRefresh}
        updateBooking={updateBooking}
        toggleArrival={toggleArrival}
        setArrivalAll={setArrivalAll}
        customerNotes={customerNotes}
        setCustomerNote={setCustomerNote}
        refundDeposit={isOwner ? refundDeposit : null}
        userEmail={user?.email}
        roleLabel={user?.master ? "Dorsia master" : isOwner ? "Owner" : "Staff"}
        isOwner={isOwner}
        onOpenTeam={() => setTeamOpen(true)}
        onChangePassword={user?.master ? null : () => setPasswordOpen(true)}
        allRestaurantsUrl={user?.master ? "/admin" : null}
        bookingPageUrl={`/${slug}`}
        waitlist={waitlist}
        waitlistActions={waitlistActions}
        onOpenWebsite={isOwner ? () => setWebsiteOpen(true) : null}
        onLogout={logOut}
      />
      {websiteOpen && (
        <SiteEditor
          api={api}
          slug={slug}
          name={restaurantName}
          previewBooking={{
            bookings,
            tables: floorElements.filter((e) => e.kind === "table"),
            sittings,
            terms,
            square: null,
            cutoffMinutes: 30,
            onSubmit: async () => {
              throw new Error("This is a preview, so bookings aren't saved here.");
            },
            onJoinWaitlist: async () => {
              throw new Error("This is a preview, so nothing is saved here.");
            },
          }}
          onClose={() => setWebsiteOpen(false)}
        />
      )}
      {teamOpen && <TeamModal api={api} currentEmail={user?.email} onClose={() => setTeamOpen(false)} />}
      {passwordOpen && <PasswordModal api={api} path="/auth/password" onClose={() => setPasswordOpen(false)} />}
    </div>
  );
}

/* ---------- Start ---------- */

function Root() {
  const parts = window.location.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  let page;
  if (parts.length === 0) page = <Landing />;
  else if (parts.length === 1 && parts[0] === "admin") page = <PlatformApp />;
  else if (parts.length === 1) page = <CustomerApp slug={parts[0]} />;
  else if (parts.length === 2 && parts[1] === "admin") page = <AdminApp slug={parts[0]} />;
  else if (parts.length === 2 && parts[1] === "book") page = <CustomerApp slug={parts[0]} bookingOnly />;
  else if (parts.length === 3 && parts[1] === "offer") page = <OfferPage slug={parts[0]} token={parts[2]} />;
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
