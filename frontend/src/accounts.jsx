// Login, team management, change password and the Dorsia master page.
import React, { useState, useEffect } from "react";
import { makeApiAt, loadToken, saveToken, PLATFORM } from "./api.js";

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

export const darkInput = {
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
export const darkButton = {
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
const linkButton = { background: "none", border: "none", color: "#0A84FF", cursor: "pointer", fontSize: 12, padding: 0, fontFamily: "inherit" };

export function DarkPage({ children }) {
  return (
    <div style={{ minHeight: "100vh", background: "#000", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: FONT }}>
      {children}
    </div>
  );
}

/* ---------- Login / first-time setup (restaurant or master) ---------- */

export function Login({ api, label, paths, onLoggedIn, setupHint }) {
  const [status, setStatus] = useState(null);
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [setupKey, setSetupKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get(paths.status)
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
          ? await api.post(paths.setup, { setupKey, email, password })
          : await api.post(paths.login, { email, password });
      onLoggedIn(res.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <DarkPage>
      <form onSubmit={submit} style={{ width: 340 }}>
        <div style={{ fontSize: 11, letterSpacing: "0.2em", color: "#636366", marginBottom: 6 }}>{label}</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 20px" }}>{mode === "setup" ? "Create the first login" : "Log in"}</h1>
        {mode === "setup" && (
          <>
            <div style={{ fontSize: 12, color: "#98989D", marginBottom: 12, lineHeight: 1.5 }}>{setupHint}</div>
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
          {busy ? "Please wait..." : mode === "setup" ? "Create login" : "Log in"}
        </button>
        {status && !status.hasOwner && status.setupEnabled && (
          <button type="button" onClick={() => setMode(mode === "setup" ? "login" : "setup")} style={{ ...linkButton, marginTop: 14 }}>
            {mode === "setup" ? "I already have a login" : "First time? Create the first login"}
          </button>
        )}
      </form>
    </DarkPage>
  );
}

/* ---------- Pop-up panel shell ---------- */

function Panel({ title, onClose, width = 460, children }) {
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 80 }} />
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 81,
          width,
          maxWidth: "calc(100vw - 40px)",
          maxHeight: "calc(100vh - 60px)",
          overflowY: "auto",
          background: "#1C1C1E",
          border: "1px solid #38383A",
          borderRadius: 14,
          boxShadow: "0 16px 48px rgba(0,0,0,0.55)",
          padding: 22,
          color: "#fff",
          fontFamily: FONT,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#98989D", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 4 }}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

/* ---------- Change password ---------- */

export function PasswordModal({ api, path, onClose }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (next !== again) return setError("The new passwords don't match.");
    setBusy(true);
    try {
      await api.post(path, { currentPassword: current, newPassword: next });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Change password" onClose={onClose} width={380}>
      {done ? (
        <>
          <div style={{ fontSize: 14, marginBottom: 16 }}>Your password has been changed.</div>
          <button onClick={onClose} style={darkButton}>Done</button>
        </>
      ) : (
        <form onSubmit={submit}>
          <input type="password" placeholder="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} style={darkInput} autoComplete="current-password" required />
          <input type="password" placeholder="New password (10+ characters)" value={next} onChange={(e) => setNext(e.target.value)} style={darkInput} autoComplete="new-password" required />
          <input type="password" placeholder="New password again" value={again} onChange={(e) => setAgain(e.target.value)} style={darkInput} autoComplete="new-password" required />
          {error && <div style={{ fontSize: 13, color: "#FF453A", marginBottom: 12 }}>{error}</div>}
          <button type="submit" disabled={busy} style={{ ...darkButton, opacity: busy ? 0.6 : 1 }}>
            {busy ? "Saving..." : "Change password"}
          </button>
        </form>
      )}
    </Panel>
  );
}

/* ---------- Team (owners only) ---------- */

export function TeamModal({ api, currentEmail, onClose }) {
  const [team, setTeam] = useState(null);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("staff");
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState("");

  async function load() {
    try {
      setTeam(await api.get("/team"));
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function add(e) {
    e.preventDefault();
    setError("");
    setAdded("");
    setBusy(true);
    try {
      const person = await api.post("/team", { email, password, role });
      setAdded(`Added ${person.email}. Give them their starting password; they can change it after logging in.`);
      setEmail("");
      setPassword("");
      setRole("staff");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(person, newRole) {
    setError("");
    try {
      await api.patch(`/team/${person.id}`, { role: newRole });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(person) {
    if (!window.confirm(`Remove ${person.email}? They won't be able to log in any more.`)) return;
    setError("");
    try {
      await api.del(`/team/${person.id}`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const selectStyle = { padding: "6px 8px", borderRadius: 6, border: "1px solid #38383A", background: "#2C2C2E", color: "#fff", fontFamily: "inherit", fontSize: 12 };

  return (
    <Panel title="Team" onClose={onClose} width={520}>
      <div style={{ fontSize: 12, color: "#98989D", marginBottom: 14, lineHeight: 1.5 }}>
        <strong style={{ color: "#fff" }}>Owners</strong> can change everything, including the floor plan, booking times, terms, refunds and the team.{" "}
        <strong style={{ color: "#fff" }}>Staff</strong> can see, add, edit and cancel bookings and check guests in.
      </div>

      <div style={{ background: "#2C2C2E", border: "1px solid #38383A", borderRadius: 10, marginBottom: 18, overflow: "hidden" }}>
        {!team && !error && <div style={{ padding: 14, fontSize: 13, color: "#98989D" }}>Loading...</div>}
        {team &&
          team.map((p, i) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderTop: i ? "1px solid #38383A" : "none" }}>
              <div style={{ flex: 1, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis" }}>
                {p.email}
                {p.email === currentEmail && <span style={{ color: "#98989D" }}> (you)</span>}
              </div>
              <select value={p.role} onChange={(e) => changeRole(p, e.target.value)} style={selectStyle}>
                <option value="owner">Owner</option>
                <option value="staff">Staff</option>
              </select>
              {p.email !== currentEmail && (
                <button onClick={() => remove(p)} style={{ ...linkButton, color: "#FF453A" }}>
                  Remove
                </button>
              )}
            </div>
          ))}
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, color: "#98989D", marginBottom: 8 }}>ADD SOMEONE</div>
      <form onSubmit={add}>
        <input type="email" placeholder="Their email" value={email} onChange={(e) => setEmail(e.target.value)} style={darkInput} autoComplete="off" required />
        <input type="text" placeholder="Starting password (10+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} style={darkInput} autoComplete="off" required />
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: "#98989D" }}>Role:</span>
          <select value={role} onChange={(e) => setRole(e.target.value)} style={selectStyle}>
            <option value="staff">Staff</option>
            <option value="owner">Owner</option>
          </select>
        </div>
        {error && <div style={{ fontSize: 13, color: "#FF453A", marginBottom: 12 }}>{error}</div>}
        {added && <div style={{ fontSize: 13, color: "#34C759", marginBottom: 12 }}>{added}</div>}
        <button type="submit" disabled={busy} style={{ ...darkButton, opacity: busy ? 0.6 : 1 }}>
          {busy ? "Adding..." : "Add to team"}
        </button>
      </form>
    </Panel>
  );
}

/* ---------- Dorsia master page (/admin) ---------- */

export function PlatformApp() {
  const [token, setTokenState] = useState(() => loadToken(PLATFORM));
  const tokenRef = React.useRef(token);
  const setToken = (t) => {
    tokenRef.current = t;
    saveToken(PLATFORM, t);
    setTokenState(t);
  };
  const api = React.useRef(makeApiAt("/api/platform", () => tokenRef.current, () => setToken(null))).current;
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [pwOpen, setPwOpen] = useState(false);

  useEffect(() => {
    document.title = "Dorsia · Master";
    if (!token) return;
    api
      .get("/restaurants")
      .then(setData)
      .catch((e) => e.status !== 401 && setError(e.message));
  }, [token]);

  if (!token)
    return (
      <Login
        api={api}
        label="DORSIA · MASTER LOGIN"
        paths={{ status: "/status", login: "/login", setup: "/setup" }}
        setupHint="First-time setup of the Dorsia master login. Enter the setup key from Render's environment settings."
        onLoggedIn={setToken}
      />
    );

  return (
    <div style={{ minHeight: "100vh", background: "#000", color: "#fff", fontFamily: FONT, padding: 28 }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.2em", color: "#636366", marginBottom: 6 }}>DORSIA · MASTER</div>
            <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Restaurants</h1>
          </div>
          <div style={{ display: "flex", gap: 14, fontSize: 12, color: "#98989D", alignItems: "center" }}>
            {data && <span>{data.email}</span>}
            <button onClick={() => setPwOpen(true)} style={linkButton}>Change password</button>
            <button onClick={() => setToken(null)} style={linkButton}>Log out</button>
          </div>
        </div>
        {error && <div style={{ color: "#FF453A", marginBottom: 12 }}>{error}</div>}
        {!data && !error && <div style={{ color: "#98989D" }}>Loading...</div>}
        {data && (
          <div style={{ background: "#1C1C1E", border: "1px solid #38383A", borderRadius: 14, overflow: "hidden" }}>
            {data.restaurants.map((r, i) => (
              <div key={r.slug} style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 18px", borderTop: i ? "1px solid #38383A" : "none" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{r.name}</div>
                  <div style={{ fontSize: 12, color: "#98989D", marginTop: 2 }}>
                    /{r.slug} · {r.bookings} booking{r.bookings === 1 ? "" : "s"} · {r.logins} login{r.logins === 1 ? "" : "s"}
                  </div>
                </div>
                <a href={`/${r.slug}`} target="_blank" rel="noreferrer" style={{ color: "#0A84FF", fontSize: 13, textDecoration: "none" }}>
                  Booking page
                </a>
                <a href={`/${r.slug}/admin`} style={{ color: "#fff", background: "#0A84FF", borderRadius: 999, padding: "7px 14px", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
                  Open dashboard
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
      {pwOpen && <PasswordModal api={api} path="/password" onClose={() => setPwOpen(false)} />}
    </div>
  );
}
