// Restaurant websites: the starting content, and checking what the editor saves.
// Words and settings are stored in tenants.site; files are referenced by their web address.

const SECTION_TYPES = ["about", "photo", "gallery", "menus", "booking", "visit", "spacer"];
const STYLES = ["classic", "modern"];
const POSITIONS = ["left", "centre", "right"];
const MENU_STYLES = ["links", "menu"];
const HERO_FITS = ["whole", "tall"];
const HERO_BUTTONS = ["reserve", "all", "none"];

// Fonts offered in the editor (all free Google Fonts that allow website use).
const GOOGLE_FONTS = [
  "Cormorant Garamond", "EB Garamond", "Playfair Display", "DM Serif Display", "Lora", "Libre Baskerville",
  "Josefin Sans", "Jost", "Inter", "Montserrat", "Poppins", "Space Grotesk", "Antonio", "Bebas Neue",
];

function defaultSite(name) {
  return {
    style: "classic",
    colors: { bg: "#0E0D0C", text: "#EDE8E0", muted: "#A39C92", accent: "#B8312F", onAccent: "#FFFFFF", panel: "#161412" },
    fonts: { heading: "Cormorant Garamond", body: "Josefin Sans", headingWeight: 400, bodyWeight: 300, customHeading: null, customBody: null },
    header: {
      logo: "", logoHeight: 44, showName: true, logoPosition: "left",
      menuDesktop: "links", menuPhone: "menu",
    },
    hero: {
      image: "", focusX: 50, focusY: 50, fitDesktop: "tall", fitPhone: "tall",
      title: name, tagline: "", subline: "", buttons: "reserve",
      buttonsBottomDesktop: 48, buttonsBottomPhone: 32,
    },
    sections: [
      { id: "about", type: "about", eyebrow: "", heading: "", text: "", image: "" },
      { id: "menus", type: "menus", intro: "", items: [] },
      { id: "book", type: "booking", heading: "Reserve a table", intro: "", image: "" },
      { id: "visit", type: "visit", hours: "", address: "", phone: "", mapUrl: "" },
    ],
    links: { instagram: "", facebook: "", tiktok: "" },
    footerNote: "",
  };
}

/* ---------- checking saved content ---------- */

const str = (v, max = 500) => (typeof v === "string" ? v.slice(0, max) : "");
const pick = (v, list, dflt) => (list.includes(v) ? v : dflt);
const num = (v, min, max, dflt) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : dflt;
};
const color = (v, dflt) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : dflt);
// Only this server's own files, the bundled demo photos, or https links are allowed.
const url = (v) => {
  if (typeof v !== "string" || !v) return "";
  if (/^\/(files|demo)\/[A-Za-z0-9._\-/]+$/.test(v)) return v.slice(0, 300);
  if (/^https:\/\/[^\s"'<>]+$/.test(v)) return v.slice(0, 600);
  return "";
};
const fontName = (v, dflt) => (GOOGLE_FONTS.includes(v) ? v : dflt);
const customFont = (v) =>
  v && typeof v === "object" && url(v.url) ? { name: str(v.name, 60).replace(/[^\w .-]/g, ""), url: url(v.url) } : null;

function cleanSection(s, i) {
  if (!s || typeof s !== "object" || !SECTION_TYPES.includes(s.type)) return null;
  const id = /^[\w-]{1,40}$/.test(s.id || "") ? s.id : `s${i}`;
  switch (s.type) {
    case "about":
      return { id, type: "about", eyebrow: str(s.eyebrow, 80), heading: str(s.heading, 120), headingImage: url(s.headingImage), text: str(s.text, 3000), image: url(s.image) };
    case "photo":
      return { id, type: "photo", image: url(s.image), caption: str(s.caption, 120), focusY: num(s.focusY, 0, 100, 50), fade: Boolean(s.fade) };
    case "gallery":
      return { id, type: "gallery", images: (Array.isArray(s.images) ? s.images : []).map(url).filter(Boolean).slice(0, 12) };
    case "menus":
      return {
        id, type: "menus", intro: str(s.intro, 300),
        items: (Array.isArray(s.items) ? s.items : [])
          .map((m) => ({ label: str(m && m.label, 40), url: url(m && m.url) }))
          .filter((m) => m.label && m.url)
          .slice(0, 8),
      };
    case "booking":
      return { id, type: "booking", heading: str(s.heading, 80), intro: str(s.intro, 400), image: url(s.image) };
    case "visit":
      return { id, type: "visit", hours: str(s.hours, 600), address: str(s.address, 200), phone: str(s.phone, 40), mapUrl: url(s.mapUrl) };
    case "spacer":
      return { id, type: "spacer", desktop: num(s.desktop, 0, 400, 80), phone: num(s.phone, 0, 400, 40) };
    default:
      return null;
  }
}

function cleanSite(input, name) {
  const d = defaultSite(name);
  const s = input && typeof input === "object" ? input : {};
  const c = s.colors || {};
  const f = s.fonts || {};
  const h = s.header || {};
  const hero = s.hero || {};
  const l = s.links || {};
  return {
    style: pick(s.style, STYLES, d.style),
    colors: {
      bg: color(c.bg, d.colors.bg), text: color(c.text, d.colors.text), muted: color(c.muted, d.colors.muted),
      accent: color(c.accent, d.colors.accent), onAccent: color(c.onAccent, d.colors.onAccent), panel: color(c.panel, d.colors.panel),
    },
    fonts: {
      heading: fontName(f.heading, d.fonts.heading), body: fontName(f.body, d.fonts.body),
      headingWeight: num(f.headingWeight, 100, 900, 400), bodyWeight: num(f.bodyWeight, 100, 900, 300),
      customHeading: customFont(f.customHeading), customBody: customFont(f.customBody),
    },
    header: {
      logo: url(h.logo), logoHeight: num(h.logoHeight, 24, 240, 44), showName: h.showName !== false,
      logoPosition: pick(h.logoPosition, POSITIONS, "left"),
      menuDesktop: pick(h.menuDesktop, MENU_STYLES, "links"), menuPhone: pick(h.menuPhone, MENU_STYLES, "menu"),
      gapDesktop: num(h.gapDesktop, 0, 300, 0), gapPhone: num(h.gapPhone, 0, 300, 0),
    },
    hero: {
      image: url(hero.image), focusX: num(hero.focusX, 0, 100, 50), focusY: num(hero.focusY, 0, 100, 50),
      fitDesktop: pick(hero.fitDesktop, HERO_FITS, "tall"), fitPhone: pick(hero.fitPhone, HERO_FITS, "tall"),
      title: str(hero.title, 80), tagline: str(hero.tagline, 160), subline: str(hero.subline, 160),
      buttons: pick(hero.buttons, HERO_BUTTONS, "reserve"),
      buttonsBottomDesktop: num(hero.buttonsBottomDesktop, 0, 400, 48), buttonsBottomPhone: num(hero.buttonsBottomPhone, 0, 400, 32),
    },
    sections: (Array.isArray(s.sections) ? s.sections : d.sections).map(cleanSection).filter(Boolean).slice(0, 30),
    links: { instagram: url(l.instagram), facebook: url(l.facebook), tiktok: url(l.tiktok) },
    footerNote: str(s.footerNote, 160),
  };
}

// Don Camillo's starting website, matching the approved mockup. Photos are bundled with the app.
function donCamilloSite() {
  const p = (f) => `/demo/don-camillo/${f}`;
  return {
    style: "classic",
    colors: { bg: "#0E0D0C", text: "#EDE8E0", muted: "#A39C92", accent: "#B8312F", onAccent: "#FFFFFF", panel: "#161412" },
    fonts: { heading: "Cormorant Garamond", body: "Josefin Sans", headingWeight: 400, bodyWeight: 300, customHeading: null, customBody: null },
    header: { logo: p("logo-white.png"), logoHeight: 44, showName: false, logoPosition: "left", menuDesktop: "links", menuPhone: "menu" },
    hero: {
      image: p("hero.jpg"), focusX: 50, focusY: 50, fitDesktop: "whole", fitPhone: "whole",
      title: "", tagline: "Tasmania’s longest running restaurant.", subline: "Established 1965", buttons: "reserve",
      buttonsBottomDesktop: 48, buttonsBottomPhone: 32,
    },
    sections: [
      { id: "about", type: "about", eyebrow: "Since 1965", heading: "", headingImage: "", image: "",
        text: "Established in 1965, Don Camillo has its roots firmly planted in Hobart’s history. A warm, welcoming room where experience and professionalism meet genuine hospitality." },
      { id: "gallery", type: "gallery", images: [p("basil.jpg"), p("wine.jpg"), p("dough.jpg")] },
      { id: "menus", type: "menus", intro: "Fresh, local produce with traditional Italian flavours.",
        items: [
          { label: "Dine-in menu", url: "https://www.doncamillorestaurant.com/s/Don-Camillo-New-Menu-SEPT-2026.pdf" },
          { label: "Wine list", url: "https://www.doncamillorestaurant.com/s/2026-SEPT-CARTA-DEI-VINI-finale.pdf" },
          { label: "Takeaway", url: "https://online-orders-105066.square.site/" },
          { label: "Gift cards", url: "https://app.squareup.com/gift/MLWKSDJWJ4GPG/order" },
        ] },
      { id: "book", type: "booking", heading: "Reserve a table", image: p("napkins.jpg"),
        intro: "Sundays incur a 10% surcharge to cover penalty rates." },
      { id: "visit", type: "visit", hours: "Dinner, Tuesday to Sunday\nFrom 5:30pm\nClosed Mondays",
        address: "5 Magnet Court\nSandy Bay TAS 7005", phone: "03 6234 1006", mapUrl: "" },
    ],
    links: { instagram: "https://www.instagram.com/doncamillo_hobart/", facebook: "https://www.facebook.com/DonCamilloHobart/", tiktok: "" },
    footerNote: "Est. 1965",
  };
}

module.exports = { GOOGLE_FONTS, defaultSite, cleanSite, donCamilloSite };
