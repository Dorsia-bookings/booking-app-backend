// Website editor for restaurant owners: change the website's look, header, hero and sections,
// with a live desktop and phone preview. Saves to /admin/site; files go to /admin/site/files.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useEscapeToClose } from "./App.jsx";
import { SitePage, SITE_FONTS, weightsFor } from "./site.jsx";

const SECTION_NAMES = {
  about: "About",
  photo: "Wide photo",
  gallery: "Gallery",
  menus: "Menus and links",
  booking: "Booking",
  visit: "Hours and contact",
  spacer: "Space",
};

const NEW_SECTION = {
  about: { eyebrow: "", heading: "", headingImage: "", text: "", image: "" },
  photo: { image: "", caption: "", focusY: 50, fade: true },
  gallery: { images: [] },
  menus: { intro: "", items: [] },
  booking: { heading: "Reserve a table", intro: "", image: "" },
  visit: { hours: "", address: "", phone: "", mapUrl: "" },
  spacer: { desktop: 80, phone: 40 },
};

/* ---------- small form pieces ---------- */

const S = {
  label: { display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-dim)", margin: "0 0 6px", letterSpacing: "0.02em" },
  input: {
    width: "100%", padding: "9px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)",
    color: "var(--text)", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box",
  },
  group: { marginBottom: 16 },
  btn: {
    padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--panel-raised)", color: "var(--text)",
    fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
  },
  primary: { padding: "9px 16px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  card: { background: "var(--panel-raised)", border: "1px solid var(--border)", borderRadius: 10, padding: 12, marginBottom: 10 },
  hint: { fontSize: 11, color: "var(--text-dim)", lineHeight: 1.5, margin: "6px 0 0" },
};

function Field({ label, children, hint }) {
  return (
    <div style={S.group}>
      {label && <label style={S.label}>{label}</label>}
      {children}
      {hint && <p style={S.hint}>{hint}</p>}
    </div>
  );
}
function Text({ value, onChange, placeholder, rows }) {
  return rows ? (
    <textarea value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows} style={{ ...S.input, resize: "vertical" }} />
  ) : (
    <input value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={S.input} />
  );
}
function Seg({ value, options, onChange }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {options.map(([v, label]) => (
        <button key={v} type="button" className={`lib-pill${value === v ? " is-active" : ""}`} onClick={() => onChange(v)} style={{ padding: "7px 12px", fontSize: 12 }}>
          {label}
        </button>
      ))}
    </div>
  );
}
function Slider({ value, min, max, step = 1, onChange, unit = "px" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ flex: 1 }} />
      <span style={{ fontSize: 12, width: 52, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        {value}
        {unit}
      </span>
    </div>
  );
}
function Toggle({ checked, onChange, label }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
function ColorField({ label, value, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} aria-label={label} style={{ width: 36, height: 30, padding: 0, border: "1px solid var(--border)", borderRadius: 6, background: "none" }} />
      <input value={value} onChange={(e) => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && onChange(e.target.value.toUpperCase())} style={{ ...S.input, width: 96, fontFamily: "var(--font-mono)" }} />
      <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{label}</span>
    </div>
  );
}

/* ---------- uploads ---------- */

function imageSize(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

// Picks a file from the library (or uploads a new one). kind: "image" | "pdf" | "font"
function FilePicker({ kind, value, onChange, lib, allowClear = true }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);
  const accept = kind === "image" ? ".jpg,.jpeg,.png,.webp,.gif" : kind === "pdf" ? ".pdf" : ".woff2,.woff,.ttf,.otf";
  const choices = lib.files.filter((f) => f.kind === kind);
  if (kind === "image") for (const u of lib.demoImages) if (!choices.some((c) => c.url === u)) choices.push({ id: u, url: u, name: u.split("/").pop(), kind: "image" });

  async function upload(file) {
    setError("");
    setBusy(true);
    try {
      const saved = await lib.upload(file);
      onChange(saved.url, saved);
      setOpen(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const current = kind === "image" && value ? (
    <div style={{ width: 64, height: 44, borderRadius: 6, backgroundImage: `url("${value}")`, backgroundSize: "cover", backgroundPosition: "center", border: "1px solid var(--border)", flexShrink: 0 }} />
  ) : (
    <span style={{ fontSize: 12, color: value ? "var(--text)" : "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
      {value ? (choices.find((c) => c.url === value)?.name || value) : "None"}
    </span>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {current}
        {kind === "image" && <span style={{ flex: 1 }} />}
        <button type="button" style={S.btn} onClick={() => setOpen((o) => !o)}>
          {value ? "Change" : "Choose"}
        </button>
        {allowClear && value && (
          <button type="button" style={S.btn} onClick={() => onChange("")}>
            Remove
          </button>
        )}
      </div>
      {open && (
        <div style={{ ...S.card, marginTop: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <button type="button" style={S.primary} disabled={busy} onClick={() => inputRef.current?.click()}>
              {busy ? "Uploading..." : "Upload new"}
            </button>
            <button type="button" style={S.btn} onClick={() => setOpen(false)}>
              Close
            </button>
            <input
              ref={inputRef}
              type="file"
              accept={accept}
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) upload(f);
              }}
            />
          </div>
          {error && <p style={{ ...S.hint, color: "var(--danger)" }}>{error}</p>}
          {kind === "font" && <p style={S.hint}>Only upload fonts you're licensed to use on a website. Most free fonts (like Google Fonts) are fine; paid fonts often need a web licence.</p>}
          {choices.length === 0 ? (
            <p style={S.hint}>Nothing uploaded yet.</p>
          ) : kind === "image" ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6, maxHeight: 220, overflowY: "auto" }}>
              {choices.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  title={c.name}
                  onClick={() => {
                    onChange(c.url, c);
                    setOpen(false);
                  }}
                  style={{ aspectRatio: "4 / 3", border: c.url === value ? "2px solid var(--accent)" : "1px solid var(--border)", borderRadius: 6, backgroundImage: `url("${c.url}")`, backgroundSize: "cover", backgroundPosition: "center", cursor: "pointer" }}
                />
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 200, overflowY: "auto" }}>
              {choices.map((c) => (
                <button key={c.id} type="button" onClick={() => { onChange(c.url, c); setOpen(false); }} style={{ ...S.btn, textAlign: "left", fontWeight: c.url === value ? 700 : 500 }}>
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- section editors ---------- */

function MoveButtons({ onUp, onDown, onRemove, removeLabel = "Remove" }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      <button type="button" style={S.btn} onClick={onUp} disabled={!onUp} aria-label="Move up">↑</button>
      <button type="button" style={S.btn} onClick={onDown} disabled={!onDown} aria-label="Move down">↓</button>
      {onRemove && (
        <button type="button" style={{ ...S.btn, color: "var(--danger)" }} onClick={onRemove}>
          {removeLabel}
        </button>
      )}
    </div>
  );
}

function move(list, i, d) {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const next = list.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

function SectionEditor({ s, set, lib }) {
  const f = (k) => (v) => set({ ...s, [k]: v });
  switch (s.type) {
    case "about":
      return (
        <>
          <Field label="Small line above"><Text value={s.eyebrow} onChange={f("eyebrow")} placeholder="e.g. Since 1965" /></Field>
          <Field label="Heading"><Text value={s.heading} onChange={f("heading")} /></Field>
          <Field label="Heading as an image (e.g. your logo)" hint="Shown in place of the heading text."><FilePicker kind="image" value={s.headingImage} onChange={f("headingImage")} lib={lib} /></Field>
          <Field label="Text" hint="Leave an empty line between paragraphs."><Text value={s.text} onChange={f("text")} rows={6} /></Field>
          <Field label="Photo beside the text" hint="Without a photo, the text is centred and larger."><FilePicker kind="image" value={s.image} onChange={f("image")} lib={lib} /></Field>
        </>
      );
    case "photo":
      return (
        <>
          <Field label="Photo"><FilePicker kind="image" value={s.image} onChange={f("image")} lib={lib} /></Field>
          <Field label="Caption"><Text value={s.caption} onChange={f("caption")} /></Field>
          <Field label="Which part of the photo to show"><Slider value={s.focusY} min={0} max={100} onChange={f("focusY")} unit="%" /></Field>
          <Toggle checked={s.fade} onChange={f("fade")} label="Dark corner behind the caption" />
        </>
      );
    case "gallery":
      return (
        <>
          {s.images.map((img, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ width: 56, height: 40, borderRadius: 6, backgroundImage: `url("${img}")`, backgroundSize: "cover", backgroundPosition: "center", border: "1px solid var(--border)" }} />
              <span style={{ flex: 1 }} />
              <MoveButtons
                onUp={i > 0 ? () => set({ ...s, images: move(s.images, i, -1) }) : null}
                onDown={i < s.images.length - 1 ? () => set({ ...s, images: move(s.images, i, 1) }) : null}
                onRemove={() => set({ ...s, images: s.images.filter((_, j) => j !== i) })}
              />
            </div>
          ))}
          {s.images.length < 12 && (
            <Field label="Add a photo">
              <FilePicker kind="image" value="" allowClear={false} onChange={(url) => url && set({ ...s, images: [...s.images, url] })} lib={lib} />
            </Field>
          )}
        </>
      );
    case "menus":
      return (
        <>
          <Field label="Line above the buttons"><Text value={s.intro} onChange={f("intro")} /></Field>
          <p style={{ ...S.hint, marginBottom: 10 }}>The first four also appear in the header menu and on the hero.</p>
          {s.items.map((it, i) => (
            <div key={i} style={S.card}>
              <Field label="Button label">
                <Text value={it.label} onChange={(v) => set({ ...s, items: s.items.map((x, j) => (j === i ? { ...x, label: v } : x)) })} placeholder="e.g. Dine-in menu" />
              </Field>
              <Field label="Opens" hint="Upload a PDF menu, or paste a link (takeaway ordering, gift cards).">
                <FilePicker kind="pdf" value={it.url.startsWith("/files/") ? it.url : ""} lib={lib} allowClear={false} onChange={(url) => url && set({ ...s, items: s.items.map((x, j) => (j === i ? { ...x, url } : x)) })} />
                <div style={{ marginTop: 6 }}>
                  <Text value={it.url.startsWith("/files/") ? "" : it.url} placeholder="https://..." onChange={(v) => set({ ...s, items: s.items.map((x, j) => (j === i ? { ...x, url: v } : x)) })} />
                </div>
              </Field>
              <MoveButtons
                onUp={i > 0 ? () => set({ ...s, items: move(s.items, i, -1) }) : null}
                onDown={i < s.items.length - 1 ? () => set({ ...s, items: move(s.items, i, 1) }) : null}
                onRemove={() => set({ ...s, items: s.items.filter((_, j) => j !== i) })}
              />
            </div>
          ))}
          {s.items.length < 8 && (
            <button type="button" style={S.btn} onClick={() => set({ ...s, items: [...s.items, { label: "", url: "" }] })}>
              Add a button
            </button>
          )}
        </>
      );
    case "booking":
      return (
        <>
          <Field label="Heading"><Text value={s.heading} onChange={f("heading")} /></Field>
          <Field label="Note under the heading"><Text value={s.intro} onChange={f("intro")} rows={2} /></Field>
          <Field label="Photo beside the form"><FilePicker kind="image" value={s.image} onChange={f("image")} lib={lib} /></Field>
        </>
      );
    case "visit":
      return (
        <>
          <Field label="Opening hours"><Text value={s.hours} onChange={f("hours")} rows={4} /></Field>
          <Field label="Address"><Text value={s.address} onChange={f("address")} rows={2} /></Field>
          <Field label="Phone"><Text value={s.phone} onChange={f("phone")} /></Field>
          <Field label="Map link (optional)" hint="Leave empty to search Google Maps for the address."><Text value={s.mapUrl} onChange={f("mapUrl")} placeholder="https://maps.google.com/..." /></Field>
        </>
      );
    case "spacer":
      return (
        <>
          <Field label="Height on computers"><Slider value={s.desktop} min={0} max={400} step={4} onChange={f("desktop")} /></Field>
          <Field label="Height on phones"><Slider value={s.phone} min={0} max={400} step={4} onChange={f("phone")} /></Field>
        </>
      );
    default:
      return null;
  }
}

/* ---------- preview ---------- */

function Preview({ width, name, site, booking, label }) {
  const boxRef = useRef(null);
  const [zoom, setZoom] = useState(0.5);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setZoom(Math.min(1, (el.clientWidth - 2) / width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  return (
    <div style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, flex: width < 600 ? "0 0 300px" : "1 1 0" }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)", marginBottom: 6 }}>{label}</div>
      <div ref={boxRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", border: "1px solid var(--border)", borderRadius: 10, background: "#000" }}>
        <div style={{ width, zoom }}>
          <SitePage name={name} site={site} booking={booking} preview />
        </div>
      </div>
    </div>
  );
}

/* ---------- the editor ---------- */

export function SiteEditor({ api, slug, name, previewBooking, onClose }) {
  const [data, setData] = useState(null);
  const [site, setSite] = useState(null);
  const [enabled, setEnabled] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState("look");
  const [openSection, setOpenSection] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [view, setView] = useState("both");
  const theme = (() => {
    try {
      return localStorage.getItem("dorsia-theme") === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  })();

  useEffect(() => {
    api
      .get("/admin/site")
      .then((d) => {
        setData(d);
        setSite(d.site);
        setEnabled(d.enabled);
      })
      .catch((e) => setError(e.message));
  }, [api]);

  function close() {
    if (dirty && !window.confirm("You have unsaved changes. Close without saving?")) return;
    onClose();
  }
  useEscapeToClose(close);

  const update = (fn) => {
    setSite((s) => fn(s));
    setDirty(true);
    setMessage("");
  };
  const setPart = (part) => (patch) => update((s) => ({ ...s, [part]: { ...s[part], ...patch } }));

  const lib = useMemo(
    () => ({
      files: data ? data.files : [],
      demoImages: site
        ? [site.hero.image, site.header.logo, ...site.sections.flatMap((x) => [x.image, x.headingImage, ...(x.images || [])])].filter((u) => u && u.startsWith("/demo/"))
        : [],
      upload: async (file) => {
        const extra = {};
        if (/^image\//.test(file.type)) {
          const dim = await imageSize(file);
          if (dim) {
            extra["X-Image-Width"] = String(dim.w);
            extra["X-Image-Height"] = String(dim.h);
          }
        }
        const saved = await api.upload("/admin/site/files", file, extra);
        setData((d) => ({ ...d, files: [saved, ...d.files] }));
        return saved;
      },
    }),
    [data, site, api]
  );

  async function save() {
    setSaving(true);
    setError("");
    try {
      const r = await api.put("/admin/site", { site, enabled });
      setSite(r.site);
      setEnabled(r.enabled);
      setDirty(false);
      setMessage(r.enabled ? "Saved. Your website is live." : "Saved. Your website is switched off, so guests see the plain booking page.");
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const shell = {
    position: "fixed", inset: 0, zIndex: 60, display: "flex", flexDirection: "column", background: "var(--bg)", color: "var(--text)",
  };

  if (!site) {
    return (
      <div className="lib-scope" data-theme={theme} style={shell}>
        <div style={{ margin: "auto", color: error ? "var(--danger)" : "var(--text-dim)" }}>{error || "Loading..."}</div>
      </div>
    );
  }

  const { colors, fonts, header, hero } = site;
  const sections = site.sections;
  const setSection = (i, next) => update((s) => ({ ...s, sections: s.sections.map((x, j) => (j === i ? next : x)) }));

  return (
    <div className="lib-scope" data-theme={theme} style={shell} role="dialog" aria-label="Website editor">
      {/* top bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
        <div style={{ marginRight: "auto" }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>Website</div>
          <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
            {enabled ? (
              <>
                Live at{" "}
                <a href={`/${slug}`} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                  /{slug}
                </a>
              </>
            ) : (
              "Switched off: guests see the plain booking page"
            )}
          </div>
        </div>
        <Toggle checked={enabled} onChange={(v) => { setEnabled(v); setDirty(true); }} label="Website on" />
        <Seg value={view} onChange={setView} options={[["both", "Both"], ["desktop", "Computer"], ["phone", "Phone"]]} />
        <button type="button" style={S.btn} onClick={close}>
          Close
        </button>
        <button type="button" style={{ ...S.primary, opacity: dirty ? 1 : 0.6 }} disabled={saving || !dirty} onClick={save}>
          {saving ? "Saving..." : dirty ? "Save" : "Saved"}
        </button>
      </div>
      {(message || error || data.storage === "local") && (
        <div style={{ padding: "8px 20px", fontSize: 12, borderBottom: "1px solid var(--border)", color: error ? "var(--danger)" : message ? "var(--success)" : "var(--warning)" }}>
          {error ||
            message ||
            "File storage isn't connected yet: photos, PDFs and fonts you upload are temporary and will disappear the next time Dorsia updates. Connect Amazon S3 to keep them."}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        {/* settings */}
        <div style={{ width: 360, flexShrink: 0, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ display: "flex", gap: 6, padding: "12px 16px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
            {[["look", "Look"], ["header", "Header"], ["hero", "Top photo"], ["sections", "Sections"]].map(([k, l]) => (
              <button key={k} type="button" className={`lib-pill${tab === k ? " is-active" : ""}`} onClick={() => setTab(k)} style={{ padding: "7px 12px", fontSize: 12 }}>
                {l}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
            {tab === "look" && (
              <>
                <Field label="Style" hint="Classic: thin lines and capitals. Modern: rounded buttons and a bolder accent.">
                  <Seg value={site.style} onChange={(v) => update((s) => ({ ...s, style: v }))} options={[["classic", "Classic"], ["modern", "Modern"]]} />
                </Field>
                <Field label="Colours">
                  <ColorField label="Background" value={colors.bg} onChange={(v) => setPart("colors")({ bg: v })} />
                  <ColorField label="Text" value={colors.text} onChange={(v) => setPart("colors")({ text: v })} />
                  <ColorField label="Softer text" value={colors.muted} onChange={(v) => setPart("colors")({ muted: v })} />
                  <ColorField label="Accent (main buttons)" value={colors.accent} onChange={(v) => setPart("colors")({ accent: v })} />
                  <ColorField label="Text on accent" value={colors.onAccent} onChange={(v) => setPart("colors")({ onAccent: v })} />
                  <ColorField label="Booking panel" value={colors.panel} onChange={(v) => setPart("colors")({ panel: v })} />
                </Field>
                <Field label="Heading font">
                  <select value={fonts.heading} onChange={(e) => setPart("fonts")({ heading: e.target.value })} style={S.input}>
                    {SITE_FONTS.map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                  <div style={{ marginTop: 6 }}>
                    <select value={fonts.headingWeight} onChange={(e) => setPart("fonts")({ headingWeight: Number(e.target.value) })} style={S.input} aria-label="Heading weight">
                      {(fonts.customHeading ? [100, 200, 300, 400, 500, 600, 700] : weightsFor(fonts.heading)).map((w) => (
                        <option key={w} value={w}>Weight {w}</option>
                      ))}
                    </select>
                  </div>
                </Field>
                <Field label="Or upload your own heading font">
                  <FilePicker kind="font" value={fonts.customHeading?.url || ""} lib={lib} onChange={(url, file) => setPart("fonts")({ customHeading: url ? { name: file?.name || "Custom", url } : null })} />
                </Field>
                <Field label="Text font">
                  <select value={fonts.body} onChange={(e) => setPart("fonts")({ body: e.target.value })} style={S.input}>
                    {SITE_FONTS.map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                  <div style={{ marginTop: 6 }}>
                    <select value={fonts.bodyWeight} onChange={(e) => setPart("fonts")({ bodyWeight: Number(e.target.value) })} style={S.input} aria-label="Text weight">
                      {(fonts.customBody ? [100, 200, 300, 400, 500, 600, 700] : weightsFor(fonts.body)).map((w) => (
                        <option key={w} value={w}>Weight {w}</option>
                      ))}
                    </select>
                  </div>
                </Field>
                <Field label="Or upload your own text font">
                  <FilePicker kind="font" value={fonts.customBody?.url || ""} lib={lib} onChange={(url, file) => setPart("fonts")({ customBody: url ? { name: file?.name || "Custom", url } : null })} />
                </Field>
                <Field label="Footer note"><Text value={site.footerNote} onChange={(v) => update((s) => ({ ...s, footerNote: v }))} placeholder="e.g. Est. 1965" /></Field>
              </>
            )}

            {tab === "header" && (
              <>
                <Field label="Logo" hint="A PNG with a see-through background works best.">
                  <FilePicker kind="image" value={header.logo} onChange={(v) => setPart("header")({ logo: v })} lib={lib} />
                </Field>
                <Field label="Logo size"><Slider value={header.logoHeight} min={24} max={240} onChange={(v) => setPart("header")({ logoHeight: v })} /></Field>
                <Toggle checked={header.showName} onChange={(v) => setPart("header")({ showName: v })} label="Show the restaurant name as text" />
                <div style={{ height: 16 }} />
                <Field label="Logo position">
                  <Seg value={header.logoPosition} onChange={(v) => setPart("header")({ logoPosition: v })} options={[["left", "Left"], ["centre", "Centre"], ["right", "Right"]]} />
                </Field>
                <Field label="Menu on computers">
                  <Seg value={header.menuDesktop} onChange={(v) => setPart("header")({ menuDesktop: v })} options={[["links", "Links"], ["menu", "☰ Menu"]]} />
                </Field>
                <Field label="Menu on phones">
                  <Seg value={header.menuPhone} onChange={(v) => setPart("header")({ menuPhone: v })} options={[["links", "Links"], ["menu", "☰ Menu"]]} />
                </Field>
                <Field label="Band between header and photo, computers" hint="Gives the logo and menu their own strip, so the photo starts below them.">
                  <Slider value={header.gapDesktop || 0} min={0} max={300} step={2} onChange={(v) => setPart("header")({ gapDesktop: v })} />
                </Field>
                <Field label="Band between header and photo, phones">
                  <Slider value={header.gapPhone || 0} min={0} max={300} step={2} onChange={(v) => setPart("header")({ gapPhone: v })} />
                </Field>
                <Field label="Instagram"><Text value={site.links.instagram} onChange={(v) => setPart("links")({ instagram: v })} placeholder="https://www.instagram.com/..." /></Field>
                <Field label="Facebook"><Text value={site.links.facebook} onChange={(v) => setPart("links")({ facebook: v })} placeholder="https://www.facebook.com/..." /></Field>
                <Field label="TikTok"><Text value={site.links.tiktok} onChange={(v) => setPart("links")({ tiktok: v })} placeholder="https://www.tiktok.com/@..." /></Field>
              </>
            )}

            {tab === "hero" && (
              <>
                <Field label="Photo"><FilePicker kind="image" value={hero.image} onChange={(v) => setPart("hero")({ image: v })} lib={lib} /></Field>
                <Field label="On computers" hint="Whole photo: shows all of it (use this if your name is part of the photo). Fill screen: crops to fill the screen.">
                  <Seg value={hero.fitDesktop} onChange={(v) => setPart("hero")({ fitDesktop: v })} options={[["whole", "Whole photo"], ["tall", "Fill screen"]]} />
                </Field>
                <Field label="On phones">
                  <Seg value={hero.fitPhone} onChange={(v) => setPart("hero")({ fitPhone: v })} options={[["whole", "Whole photo"], ["tall", "Fill screen"]]} />
                </Field>
                <Field label="Part of the photo to keep in view (left to right)"><Slider value={hero.focusX} min={0} max={100} unit="%" onChange={(v) => setPart("hero")({ focusX: v })} /></Field>
                <Field label="Part of the photo to keep in view (top to bottom)"><Slider value={hero.focusY} min={0} max={100} unit="%" onChange={(v) => setPart("hero")({ focusY: v })} /></Field>
                <Field label="Big title on the photo" hint="Leave empty if your photo or logo already shows your name."><Text value={hero.title} onChange={(v) => setPart("hero")({ title: v })} /></Field>
                <Field label="Tagline"><Text value={hero.tagline} onChange={(v) => setPart("hero")({ tagline: v })} /></Field>
                <Field label="Second line"><Text value={hero.subline} onChange={(v) => setPart("hero")({ subline: v })} /></Field>
                <Field label="Buttons on the photo">
                  <Seg value={hero.buttons} onChange={(v) => setPart("hero")({ buttons: v })} options={[["reserve", "Reserve only"], ["all", "Menus and reserve"], ["none", "None"]]} />
                </Field>
                <Field label="Buttons distance from the bottom, computers"><Slider value={hero.buttonsBottomDesktop} min={0} max={400} step={4} onChange={(v) => setPart("hero")({ buttonsBottomDesktop: v })} /></Field>
                <Field label="Buttons distance from the bottom, phones"><Slider value={hero.buttonsBottomPhone} min={0} max={400} step={4} onChange={(v) => setPart("hero")({ buttonsBottomPhone: v })} /></Field>
              </>
            )}

            {tab === "sections" && (
              <>
                <p style={{ ...S.hint, margin: "0 0 12px" }}>Sections appear in this order, below the top photo.</p>
                {sections.map((sec, i) => (
                  <div key={sec.id} style={S.card}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => setOpenSection(openSection === sec.id ? null : sec.id)}
                        style={{ flex: 1, textAlign: "left", background: "none", border: "none", color: "var(--text)", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: "6px 0", fontFamily: "inherit" }}
                      >
                        {openSection === sec.id ? "▾" : "▸"} {SECTION_NAMES[sec.type]}
                        {sec.type === "spacer" && <span style={{ color: "var(--text-dim)", fontWeight: 400 }}> · {sec.desktop}px / {sec.phone}px</span>}
                      </button>
                      <MoveButtons
                        onUp={i > 0 ? () => update((s) => ({ ...s, sections: move(s.sections, i, -1) })) : null}
                        onDown={i < sections.length - 1 ? () => update((s) => ({ ...s, sections: move(s.sections, i, 1) })) : null}
                        onRemove={() => {
                          if (window.confirm(`Remove the ${SECTION_NAMES[sec.type]} section?`)) update((s) => ({ ...s, sections: s.sections.filter((_, j) => j !== i) }));
                        }}
                        removeLabel="✕"
                      />
                    </div>
                    {openSection === sec.id && (
                      <div style={{ marginTop: 12 }}>
                        <SectionEditor s={sec} set={(next) => setSection(i, next)} lib={lib} />
                      </div>
                    )}
                  </div>
                ))}
                <Field label="Add a section">
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {Object.keys(NEW_SECTION).map((type) => (
                      <button
                        key={type}
                        type="button"
                        style={S.btn}
                        onClick={() => {
                          const id = `${type}-${Date.now().toString(36)}`;
                          update((s) => ({ ...s, sections: [...s.sections, { id, type, ...NEW_SECTION[type] }] }));
                          setOpenSection(id);
                        }}
                      >
                        + {SECTION_NAMES[type]}
                      </button>
                    ))}
                  </div>
                </Field>
              </>
            )}
          </div>
        </div>

        {/* previews */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", gap: 16, padding: 16, minHeight: 0 }}>
          {view !== "phone" && <Preview width={1280} name={name} site={site} booking={previewBooking} label="Computer" />}
          {view !== "desktop" && <Preview width={390} name={name} site={site} booking={previewBooking} label="Phone" />}
        </div>
      </div>
    </div>
  );
}
