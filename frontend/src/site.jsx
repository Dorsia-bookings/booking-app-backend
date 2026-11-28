// The restaurant's public one-page website, built from the settings saved in the website editor.
// The same component draws the live site and the editor's desktop and phone previews; phone
// layout is chosen by the width of the page box (container queries), not the browser window.
import React, { useEffect, useState } from "react";
import { CustomerBooking } from "./App.jsx";

// Weights each Google font actually offers (asking Google for a missing weight breaks the font link).
const FONT_WEIGHTS = {
  "Cormorant Garamond": [300, 400, 500, 600, 700],
  "EB Garamond": [400, 500, 600, 700, 800],
  "Playfair Display": [400, 500, 600, 700, 800, 900],
  "DM Serif Display": [400],
  Lora: [400, 500, 600, 700],
  "Libre Baskerville": [400, 700],
  "Josefin Sans": [100, 200, 300, 400, 500, 600, 700],
  Jost: [100, 200, 300, 400, 500, 600, 700, 800, 900],
  Inter: [100, 200, 300, 400, 500, 600, 700, 800, 900],
  Montserrat: [100, 200, 300, 400, 500, 600, 700, 800, 900],
  Poppins: [100, 200, 300, 400, 500, 600, 700, 800, 900],
  "Space Grotesk": [300, 400, 500, 600, 700],
  Antonio: [100, 200, 300, 400, 500, 600, 700],
  "Bebas Neue": [400],
};
export const SITE_FONTS = Object.keys(FONT_WEIGHTS);
export function weightsFor(font) {
  return FONT_WEIGHTS[font] || [400];
}
function nearestWeight(font, w) {
  return weightsFor(font).reduce((best, x) => (Math.abs(x - w) < Math.abs(best - w) ? x : best), 400);
}

function googleFontsHref(families) {
  const q = families
    .filter((f) => FONT_WEIGHTS[f])
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@${FONT_WEIGHTS[f].join(";")}`)
    .join("&");
  return q ? `https://fonts.googleapis.com/css2?${q}&display=swap` : null;
}

// Loads the site's fonts once per page (Google Fonts link, plus any uploaded fonts).
function useSiteFonts(fonts) {
  const href = googleFontsHref([...new Set([fonts.heading, fonts.body])]);
  useEffect(() => {
    if (!href) return;
    let link = document.querySelector(`link[data-site-fonts="${href}"]`);
    if (!link) {
      link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.dataset.siteFonts = href;
      document.head.appendChild(link);
    }
  }, [href]);
}

function isDark(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
}

const SITE_CSS = `
.dsite { container-type: inline-size; container-name: dsite; position: relative; background: var(--s-bg); color: var(--s-text);
  font-family: var(--s-body-font); font-weight: var(--s-body-weight); -webkit-font-smoothing: antialiased; }
.dsite *, .dsite *::before, .dsite *::after { box-sizing: border-box; }
.dsite a { color: inherit; text-decoration: none; }
.dsite a:hover { color: var(--s-hover); }
.dsite .s-head { font-family: var(--s-head-font); font-weight: var(--s-head-weight); line-height: 1.1; margin: 0; }
.dsite .s-label { font-size: 12px; letter-spacing: var(--s-label-track); text-transform: var(--s-label-case); color: var(--s-muted); margin: 0; }
.dsite .s-btn { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; padding: 14px 28px;
  border: 1px solid var(--s-text); border-radius: var(--s-radius); font-size: var(--s-btn-size); letter-spacing: var(--s-btn-track);
  text-transform: var(--s-btn-case); background: transparent; color: var(--s-text); transition: background .2s, color .2s, border-color .2s; cursor: pointer; }
.dsite .s-btn:hover { background: var(--s-text); color: var(--s-bg); }
.dsite .s-btn.fill { background: var(--s-accent); color: var(--s-on-accent); border-color: var(--s-accent); font-weight: 500; }
.dsite .s-btn.fill:hover { filter: brightness(1.08); }
.dsite .s-icon { width: 44px; height: 44px; display: inline-flex; align-items: center; justify-content: center; background: none; border: none; color: var(--s-text); cursor: pointer; padding: 0; }
.dsite .s-wrap { padding-left: clamp(20px, 4cqw, 64px); padding-right: clamp(20px, 4cqw, 64px); }

/* header */
.dsite .s-header { position: absolute; top: 0; left: 0; right: 0; z-index: 5; display: flex; gap: 16px; padding-top: clamp(20px, 2.4cqw, 36px);
  color: var(--hdr-d); --s-text: var(--hdr-d); --s-hover: var(--hdr-d); }
.dsite .s-slot { flex: 1 1 0; display: flex; align-items: center; gap: clamp(14px, 2cqw, 32px); }
.dsite .s-slot.right { justify-content: flex-end; }
.dsite .s-logo { flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; }
.dsite .s-links { display: flex; align-items: center; gap: clamp(16px, 2.2cqw, 36px); flex-wrap: wrap; font-size: var(--s-nav-size); letter-spacing: var(--s-btn-track); text-transform: var(--s-btn-case); }
.dsite .s-links a { padding: 10px 0; }
.dsite .s-book { white-space: nowrap; font-size: var(--s-nav-size); letter-spacing: var(--s-btn-track); text-transform: var(--s-btn-case); }
.dsite[data-style="classic"] .s-book { border-bottom: 1px solid var(--s-text); padding: 10px 0 4px; }
.dsite[data-style="modern"] .s-book { border: 1px solid var(--s-accent); color: var(--s-accent); border-radius: var(--s-radius); padding: 10px 18px; }
.dsite .only-phone { display: none !important; }

/* hero */
.dsite .s-hero { position: relative; overflow: hidden; background: var(--s-bg); padding-top: var(--hg-d); }
.dsite .s-hero-img { display: block; width: 100%; }
.dsite .s-hero.fd-whole .s-hero-img { height: auto; }
.dsite .s-hero.fd-tall { height: min(92vh, 62cqw); min-height: 520px; }
.dsite .s-hero.fd-tall .s-hero-img { position: absolute; left: 0; right: 0; top: var(--hg-d); height: calc(100% - var(--hg-d)); object-fit: cover; }
.dsite .s-hero-shade { position: absolute; left: 0; right: 0; bottom: 0; top: var(--hg-d); pointer-events: none;
  background: linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 24%, rgba(0,0,0,0) 62%, rgba(0,0,0,0.8) 100%); }
.dsite .s-hero-title { position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%); text-align: center; color: #fff; font-size: clamp(44px, 8cqw, 120px); }
.dsite .s-hero-foot { position: absolute; left: 0; right: 0; bottom: var(--hb-d); display: flex; gap: 24px; color: #fff; }
.dsite .s-hero-foot.row { justify-content: space-between; align-items: flex-end; flex-wrap: wrap; }
.dsite .s-hero-foot.col { flex-direction: column; align-items: center; text-align: center; }
.dsite .s-hero-foot .s-btn { color: #fff; border-color: rgba(255,255,255,0.85); min-width: 260px; }
.dsite .s-hero-foot .s-btn:hover { background: #fff; color: #000; }
.dsite .s-hero-foot .s-btn.fill { color: var(--s-on-accent); border-color: var(--s-accent); }
.dsite .s-stack { display: flex; flex-direction: column; align-items: center; gap: 14px; }

/* sections */
.dsite .s-about { display: flex; flex-wrap: wrap; gap: clamp(40px, 6cqw, 96px); align-items: center; max-width: 1240px; margin: 0 auto; padding-top: clamp(72px, 9cqw, 140px); padding-bottom: clamp(72px, 9cqw, 140px); }
.dsite .s-about.centred { max-width: 900px; text-align: center; justify-content: center; }
.dsite .s-photo { position: relative; aspect-ratio: 21 / 9; background-size: cover; }
.dsite .s-photo-fade { position: absolute; inset: 0; background: radial-gradient(ellipse 70% 90% at 0% 100%, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.45) 40%, rgba(0,0,0,0) 75%); }
.dsite .s-gallery { display: grid; gap: 6px; padding: 6px; }
.dsite .s-gallery > div { aspect-ratio: 4 / 5; background-size: cover; background-position: center; }
.dsite .s-menus { text-align: center; padding-top: clamp(72px, 9cqw, 130px); padding-bottom: clamp(72px, 9cqw, 130px); }
.dsite .s-booking { display: flex; flex-wrap: wrap; background: var(--s-panel); }
.dsite .s-booking-img { flex: 1 1 420px; min-height: 600px; background-size: cover; background-position: center; }
.dsite .s-booking-body { flex: 999 1 520px; min-width: 0; padding: clamp(48px, 6cqw, 96px) clamp(24px, 5cqw, 88px); }
.dsite .s-visit { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 48px; max-width: 1200px; margin: 0 auto; padding-top: clamp(72px, 9cqw, 130px); padding-bottom: clamp(72px, 9cqw, 130px); }
.dsite .s-visit p { margin: 0; font-size: 18px; line-height: 1.7; white-space: pre-line; }
.dsite .s-spacer { height: var(--sp-d); }
.dsite .s-footer { border-top: 1px solid var(--s-line); padding-top: 28px; padding-bottom: 28px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 12px;
  font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--s-muted); }

/* booking form inside the site */
.dsite .wv-display { font-family: var(--s-head-font) !important; font-weight: var(--s-head-weight) !important; }
.dsite .wv-mono { font-family: var(--s-body-font) !important; }
.dsite .s-booking-body input, .dsite .s-booking-body textarea { font-family: var(--s-body-font); }

/* mobile menu */
.dsite .s-overlay { position: fixed; inset: 0; z-index: 50; background: var(--s-bg); display: flex; flex-direction: column; padding: 24px; overflow-y: auto; }
.dsite.preview .s-overlay { position: absolute; bottom: auto; height: min(100%, 820px); }
.dsite .s-overlay-links { margin-top: 48px; display: flex; flex-direction: column; gap: 4px; font-family: var(--s-head-font); font-weight: var(--s-head-weight); font-size: 40px; line-height: 1.15; }

@container dsite (max-width: 760px) {
  .dsite .only-desk { display: none !important; }
  .dsite .only-phone { display: flex !important; }
  .dsite .s-hero { padding-top: var(--hg-p); }
  .dsite .s-hero-shade { top: var(--hg-p); }
  .dsite .s-header { color: var(--hdr-p); --s-text: var(--hdr-p); --s-hover: var(--hdr-p); }
  .dsite .s-hero.fp-whole { height: auto; min-height: 0; }
  .dsite .s-hero.fp-whole .s-hero-img { position: static; height: auto; }
  .dsite .s-hero.fp-whole .s-hero-foot { position: relative; bottom: auto; z-index: 2; background: var(--s-bg); color: var(--s-text); padding-top: 36px; padding-bottom: 8px; }
  .dsite .s-hero.fp-whole .s-hero-foot .s-btn { color: var(--s-text); border-color: var(--s-text); }
  .dsite .s-hero.fp-whole .s-hero-foot .s-btn.fill { color: var(--s-on-accent); border-color: var(--s-accent); }
  .dsite .s-hero.fp-tall { height: auto; aspect-ratio: 9 / 16; max-height: 100vh; min-height: 0; }
  .dsite .s-hero.fp-tall .s-hero-img { position: absolute; left: 0; right: 0; top: var(--hg-p); height: calc(100% - var(--hg-p)); object-fit: cover; }
  .dsite .s-hero.fp-whole .s-hero-img { top: auto; }
  .dsite .s-hero-foot { bottom: var(--hb-p); flex-direction: column !important; align-items: stretch !important; text-align: center; gap: 22px; }
  .dsite .s-hero-foot .s-btn { min-width: 0; width: 100%; }
  .dsite .s-photo { aspect-ratio: 4 / 3; }
  .dsite .s-gallery { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; }
  .dsite .s-gallery > div { flex: 0 0 80%; scroll-snap-align: center; }
  .dsite .s-booking-img { min-height: 240px; }
  .dsite .s-visit { grid-template-columns: minmax(0, 1fr); gap: 40px; }
  .dsite .s-spacer { height: var(--sp-p); }
}
`;

function SocialIcon({ kind }) {
  const common = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.4, "aria-hidden": true };
  if (kind === "instagram")
    return (
      <svg {...common}>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" />
      </svg>
    );
  if (kind === "facebook")
    return (
      <svg {...common}>
        <path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8z" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5M14 3c.5 2.5 2.5 4.5 5 5" />
    </svg>
  );
}

function Socials({ links }) {
  const items = ["instagram", "facebook", "tiktok"].filter((k) => links[k]);
  if (!items.length) return null;
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {items.map((k) => (
        <a key={k} href={links[k]} target="_blank" rel="noreferrer" aria-label={k[0].toUpperCase() + k.slice(1)} className="s-icon">
          <SocialIcon kind={k} />
        </a>
      ))}
    </div>
  );
}

const Burger = ({ onClick }) => (
  <button type="button" className="s-icon" onClick={onClick} aria-label="Open menu">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M3 7h18M3 12h18M3 17h18" />
    </svg>
  </button>
);

function external(url) {
  return /^https?:\/\//.test(url) || url.startsWith("/files/") || url.endsWith(".pdf");
}
function LinkTo({ item, className, onClick }) {
  const ext = external(item.url);
  return (
    <a href={item.url} className={className} onClick={onClick} target={ext ? "_blank" : undefined} rel={ext ? "noreferrer" : undefined}>
      {item.label}
    </a>
  );
}

function paragraphs(text) {
  return String(text || "").split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean);
}

export function SitePage({ name, site, booking, preview = false }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { colors, fonts, header, hero } = site;
  useSiteFonts(fonts);

  const classic = site.style === "classic";
  const dark = isDark(colors.bg);
  const headFont = fonts.customHeading ? `"SiteHeading", serif` : `"${fonts.heading}", serif`;
  const bodyFont = fonts.customBody ? `"SiteBody", sans-serif` : `"${fonts.body}", sans-serif`;
  const headWeight = fonts.customHeading ? fonts.headingWeight : nearestWeight(fonts.heading, fonts.headingWeight);
  const bodyWeight = fonts.customBody ? fonts.bodyWeight : nearestWeight(fonts.body, fonts.bodyWeight);
  const vars = {
    "--s-bg": colors.bg, "--s-text": colors.text, "--s-muted": colors.muted, "--s-accent": colors.accent,
    "--s-on-accent": colors.onAccent, "--s-panel": colors.panel, "--s-hover": classic ? colors.text : colors.accent,
    "--s-line": `color-mix(in srgb, ${colors.text} 18%, transparent)`,
    "--s-head-font": headFont, "--s-body-font": bodyFont, "--s-head-weight": headWeight, "--s-body-weight": bodyWeight,
    "--s-radius": classic ? "0px" : "6px", "--s-btn-case": classic ? "uppercase" : "none",
    "--s-btn-track": classic ? "0.22em" : "0.02em", "--s-btn-size": classic ? "13px" : "16px", "--s-nav-size": classic ? "13px" : "15px",
    "--s-label-case": "uppercase", "--s-label-track": classic ? "0.3em" : "0.18em",
    "--hb-d": `${hero.buttonsBottomDesktop}px`, "--hb-p": `${hero.buttonsBottomPhone}px`,
    "--hg-d": `${header.gapDesktop || 0}px`, "--hg-p": `${header.gapPhone || 0}px`,
    "--hdr-d": header.gapDesktop ? colors.text : "#fff", "--hdr-p": header.gapPhone ? colors.text : "#fff",
    // booking form colours
    "--bk-page": "transparent", "--bk-text": colors.text, "--bk-text2": colors.muted, "--bk-muted": colors.muted,
    "--bk-heading": colors.text, "--bk-accent": colors.accent, "--bk-on-accent": colors.onAccent,
    "--bk-field": colors.bg, "--bk-card": "transparent", "--bk-card-border": "none", "--bk-line": `color-mix(in srgb, ${colors.text} 26%, transparent)`,
    "--bk-r": classic ? "0px" : "6px", "--bk-r-pill": classic ? "0px" : "6px", "--bk-r-card": "0px", "--bk-card-pad": "0px", "--bk-shadow": "none",
    "--bk-btn-case": classic ? "uppercase" : "none", "--bk-btn-track": classic ? "0.2em" : "normal",
    colorScheme: dark ? "dark" : "light",
  };

  const menusSection = site.sections.find((s) => s.type === "menus");
  const menuItems = menusSection ? menusSection.items : [];
  const hasBooking = site.sections.some((s) => s.type === "booking");
  const hasVisit = site.sections.some((s) => s.type === "visit");
  const navItems = [...menuItems.slice(0, 4), ...(hasVisit ? [{ label: "Visit", url: "#visit" }] : [])];
  const book = hasBooking ? (
    <a href="#book" className="s-book">
      Book
    </a>
  ) : null;

  const close = () => setMenuOpen(false);
  const menuFor = (style) =>
    style === "links" ? (
      <nav className="s-links" aria-label="Main">
        {navItems.map((it, i) => (
          <LinkTo key={i} item={it} />
        ))}
      </nav>
    ) : (
      <Burger onClick={() => setMenuOpen(true)} />
    );
  const menu = (
    <>
      <span className="only-desk" style={{ display: "flex" }}>{menuFor(header.menuDesktop)}</span>
      <span className="only-phone">{menuFor(header.menuPhone)}</span>
    </>
  );
  const pos = header.logoPosition;
  const logo = (
    <a href="#top" className="s-logo" aria-label={`${name}, home`}>
      {header.logo && <img src={header.logo} alt="" style={{ height: header.logoHeight, width: "auto", display: "block", maxWidth: "55cqw", objectFit: "contain", objectPosition: pos === "right" ? "right" : pos === "centre" ? "center" : "left" }} />}
      {header.showName && (
        <span className="s-head" style={{ fontSize: header.logo ? 18 : 28, marginTop: header.logo ? 8 : 0, color: "currentColor" }}>
          {name}
        </span>
      )}
    </a>
  );

  const heroFootAll = hero.buttons === "all";
  const heroButtons =
    hero.buttons === "none" ? null : heroFootAll ? (
      <div className="s-stack">
        {menuItems.slice(0, 2).map((it, i) => (
          <LinkTo key={i} item={it} className="s-btn" />
        ))}
        {hasBooking && <a href="#book" className="s-btn fill">{classic ? "Reserve a table" : "make a reservation"}</a>}
        {menuItems.slice(2, 4).map((it, i) => (
          <LinkTo key={`b${i}`} item={it} className="s-btn" />
        ))}
      </div>
    ) : hasBooking ? (
      <a href="#book" className="s-btn">Reserve a table</a>
    ) : null;
  const tagline = (hero.tagline || hero.subline) && (
    <p className="s-head" style={{ fontSize: "clamp(20px, 2.2cqw, 28px)", lineHeight: 1.3, maxWidth: 560 }}>
      {hero.tagline}
      {hero.subline && (
        <>
          <br />
          <span style={{ fontStyle: classic ? "italic" : "normal", opacity: 0.8 }}>{hero.subline}</span>
        </>
      )}
    </p>
  );

  return (
    <div className={`dsite${preview ? " preview" : ""}`} data-style={site.style} style={vars} id="top">
      <style>{SITE_CSS}</style>
      {fonts.customHeading && <style>{`@font-face{font-family:"SiteHeading";src:url("${fonts.customHeading.url}");font-display:swap}`}</style>}
      {fonts.customBody && <style>{`@font-face{font-family:"SiteBody";src:url("${fonts.customBody.url}");font-display:swap}`}</style>}

      <header className={`s-hero fd-${hero.fitDesktop} fp-${hero.fitPhone}`}>
        {hero.image ? (
          <img className="s-hero-img" src={hero.image} alt="" style={{ objectPosition: `${hero.focusX}% ${hero.focusY}%` }} />
        ) : (
          <div className="s-hero-img" style={{ aspectRatio: "16 / 9", background: colors.panel }} />
        )}
        <div className="s-hero-shade" />
        <div className="s-header s-wrap" style={{ alignItems: header.logoHeight > 80 ? "flex-start" : "center" }}>
          {pos !== "left" && (
            <div className="s-slot">
              {pos === "right" ? (
                <>
                  {menu}
                  {book}
                </>
              ) : (
                book
              )}
            </div>
          )}
          {logo}
          {pos !== "right" && (
            <div className="s-slot right">
              {pos === "left" ? (
                <>
                  {menu}
                  {book}
                </>
              ) : (
                menu
              )}
            </div>
          )}
        </div>
        {hero.title && <h1 className="s-head s-hero-title">{hero.title}</h1>}
        {(tagline || heroButtons) && (
          <div className={`s-hero-foot s-wrap ${heroFootAll ? "col" : "row"}`}>
            {tagline}
            {heroButtons}
          </div>
        )}
      </header>

      {menuOpen && (
        <div className="s-overlay" role="dialog" aria-label="Menu">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            {header.logo ? <img src={header.logo} alt="" style={{ height: Math.min(header.logoHeight, 90), width: "auto" }} /> : <span className="s-head" style={{ fontSize: 24 }}>{name}</span>}
            <button type="button" className="s-icon" onClick={close} aria-label="Close menu">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
                <path d="M5 5l14 14M19 5L5 19" />
              </svg>
            </button>
          </div>
          <nav className="s-overlay-links" aria-label="Main">
            {menuItems.map((it, i) => (
              <LinkTo key={i} item={it} onClick={close} />
            ))}
            {hasVisit && <a href="#visit" onClick={close}>Visit</a>}
          </nav>
          <div style={{ marginTop: "auto", paddingTop: 32, display: "flex", flexDirection: "column", gap: 16 }}>
            <Socials links={site.links} />
            {hasBooking && (
              <a href="#book" onClick={close} className="s-btn fill" style={{ width: "100%" }}>
                Book a table
              </a>
            )}
          </div>
        </div>
      )}

      {site.sections.map((s) => (
        <Section key={s.id} s={s} site={site} name={name} booking={booking} preview={preview} />
      ))}

      <footer className="s-footer s-wrap">
        <span>
          {name}
          {site.footerNote ? ` · ${site.footerNote}` : ""}
        </span>
        <span>Bookings by Dorsia</span>
      </footer>
    </div>
  );
}

function Section({ s, site, name, booking, preview }) {
  switch (s.type) {
    case "about": {
      const paras = paragraphs(s.text);
      return (
        <section className={`s-about s-wrap${s.image ? "" : " centred"}`}>
          <div style={{ flex: "1 1 380px", minWidth: 0 }}>
            {s.eyebrow && <p className="s-label" style={{ marginBottom: 18 }}>{s.eyebrow}</p>}
            {s.headingImage ? (
              <h2 style={{ margin: "0 0 22px" }}>
                <img src={s.headingImage} alt={name} style={{ display: s.image ? "block" : "inline-block", width: "clamp(160px, 18cqw, 260px)", height: "auto" }} />
              </h2>
            ) : (
              s.heading && <h2 className="s-head" style={{ fontSize: "clamp(40px, 5cqw, 72px)", marginBottom: 22 }}>{s.heading}</h2>
            )}
            {paras.map((p, i) => (
              <p
                key={i}
                className={s.image ? undefined : "s-head"}
                style={
                  s.image
                    ? { margin: "0 0 18px", fontSize: 19, lineHeight: 1.7, opacity: i ? 0.85 : 1 }
                    : { margin: "0 0 18px", fontSize: "clamp(26px, 3.2cqw, 42px)", lineHeight: 1.28 }
                }
              >
                {p}
              </p>
            ))}
          </div>
          {s.image && <div role="img" aria-label="" style={{ flex: "1 1 420px", aspectRatio: "3 / 2", backgroundImage: `url("${s.image}")`, backgroundSize: "cover", backgroundPosition: "center" }} />}
        </section>
      );
    }
    case "photo":
      return (
        <section className="s-photo" style={{ backgroundImage: s.image ? `url("${s.image}")` : "none", backgroundColor: site.colors.panel, backgroundPosition: `center ${s.focusY}%` }}>
          {s.fade && <div className="s-photo-fade" />}
          {s.caption && (
            <p className="s-head" style={{ position: "absolute", left: "clamp(20px, 5cqw, 80px)", bottom: "clamp(20px, 4cqw, 48px)", fontSize: "clamp(26px, 3cqw, 44px)", color: "#fff" }}>
              {s.caption}
            </p>
          )}
        </section>
      );
    case "gallery":
      if (!s.images.length) return null;
      return (
        <section className="s-gallery" aria-label="Gallery" style={{ gridTemplateColumns: `repeat(${Math.min(4, s.images.length)}, minmax(0, 1fr))` }}>
          {s.images.map((src, i) => (
            <div key={i} style={{ backgroundImage: `url("${src}")` }} />
          ))}
        </section>
      );
    case "menus":
      return (
        <section id="menus" className="s-menus s-wrap">
          {s.intro && (
            <p className="s-head" style={{ margin: "0 auto 40px", maxWidth: 640, fontSize: "clamp(24px, 2.6cqw, 34px)", lineHeight: 1.3 }}>
              {s.intro}
            </p>
          )}
          <div style={{ display: "flex", justifyContent: "center", gap: 14, flexWrap: "wrap" }}>
            {s.items.map((it, i) => (
              <LinkTo key={i} item={it} className="s-btn" />
            ))}
          </div>
        </section>
      );
    case "booking":
      return (
        <section id="book" className="s-booking">
          {s.image && <div className="s-booking-img" role="img" aria-label="" style={{ backgroundImage: `url("${s.image}")` }} />}
          <div className="s-booking-body" style={s.image ? undefined : { maxWidth: 760, margin: "0 auto" }}>
            <h2 className="s-head" style={{ fontSize: "clamp(36px, 4.5cqw, 64px)", marginBottom: s.intro ? 12 : 36 }}>{s.heading || "Reserve a table"}</h2>
            {s.intro && <p style={{ margin: "0 0 36px", color: "var(--s-muted)", fontSize: 15, lineHeight: 1.6 }}>{s.intro}</p>}
            {booking ? (
              <CustomerBooking {...booking} embedded />
            ) : (
              <p style={{ color: "var(--s-muted)" }}>Booking form</p>
            )}
            {preview && <p style={{ marginTop: 14, fontSize: 12, color: "var(--s-muted)" }}>Preview: bookings made here are not saved.</p>}
          </div>
        </section>
      );
    case "visit":
      return (
        <section id="visit" className="s-visit s-wrap">
          {s.hours && (
            <div>
              <h3 className="s-label" style={{ marginBottom: 16, fontWeight: 400 }}>Opening hours</h3>
              <p>{s.hours}</p>
            </div>
          )}
          {s.address && (
            <div>
              <h3 className="s-label" style={{ marginBottom: 16, fontWeight: 400 }}>Find us</h3>
              <p>{s.address}</p>
              <a
                href={s.mapUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${s.address.replace(/\n/g, " ")}`)}`}
                target="_blank"
                rel="noreferrer"
                className="s-label"
                style={{ display: "inline-block", marginTop: 12, color: "var(--s-text)", borderBottom: "1px solid var(--s-line)", paddingBottom: 5 }}
              >
                Directions
              </a>
            </div>
          )}
          <div>
            <h3 className="s-label" style={{ marginBottom: 16, fontWeight: 400 }}>Contact</h3>
            {s.phone && (
              <p>
                <a href={`tel:${s.phone.replace(/[^\d+]/g, "")}`}>{s.phone}</a>
              </p>
            )}
            <div style={{ marginTop: 8, marginLeft: -12 }}>
              <Socials links={site.links} />
            </div>
          </div>
        </section>
      );
    case "spacer":
      return <div className="s-spacer" aria-hidden="true" style={{ "--sp-d": `${s.desktop}px`, "--sp-p": `${s.phone}px` }} />;
    default:
      return null;
  }
}
