// Website editor (owners only): load and save the restaurant's website, upload and delete files.
const express = require("express");
const crypto = require("crypto");
const router = express.Router({ mergeParams: true });
const pool = require("../db");
const { cleanSite, defaultSite, GOOGLE_FONTS } = require("../lib/site");
const { storageMode, saveFile, deleteFile } = require("../lib/storage");

// Accepted uploads, by file extension.
const TYPES = {
  ".jpg": { type: "image/jpeg", kind: "image", max: 12 },
  ".jpeg": { type: "image/jpeg", kind: "image", max: 12 },
  ".png": { type: "image/png", kind: "image", max: 12 },
  ".webp": { type: "image/webp", kind: "image", max: 12 },
  ".gif": { type: "image/gif", kind: "image", max: 8 },
  ".pdf": { type: "application/pdf", kind: "pdf", max: 20 },
  ".woff2": { type: "font/woff2", kind: "font", max: 3 },
  ".woff": { type: "font/woff", kind: "font", max: 3 },
  ".ttf": { type: "font/ttf", kind: "font", max: 3 },
  ".otf": { type: "font/otf", kind: "font", max: 3 },
};

// Checks the first bytes of the file really are what the extension says.
function looksLike(ext, buf) {
  const hex = buf.subarray(0, 12).toString("hex");
  const ascii = buf.subarray(0, 12).toString("latin1");
  switch (ext) {
    case ".jpg": case ".jpeg": return hex.startsWith("ffd8ff");
    case ".png": return hex.startsWith("89504e47");
    case ".gif": return ascii.startsWith("GIF8");
    case ".webp": return ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP";
    case ".pdf": return ascii.startsWith("%PDF");
    case ".woff2": return ascii.startsWith("wOF2");
    case ".woff": return ascii.startsWith("wOFF");
    case ".ttf": return hex.startsWith("00010000") || ascii.startsWith("true");
    case ".otf": return ascii.startsWith("OTTO");
    default: return false;
  }
}

function fileOut(r) {
  return { id: r.id, url: `/files/${r.id}`, kind: r.kind, name: r.name, size: r.size_bytes, width: r.width, height: r.height, createdAt: r.created_at };
}

// GET /api/:slug/admin/site
router.get("/", async (req, res) => {
  try {
    const files = await pool.query("SELECT * FROM site_files WHERE tenant_id = $1 ORDER BY created_at DESC", [req.tenant.id]);
    res.json({
      site: req.tenant.site ? cleanSite(req.tenant.site, req.tenant.name) : defaultSite(req.tenant.name),
      enabled: req.tenant.site_enabled,
      storage: storageMode(),
      fonts: GOOGLE_FONTS,
      files: files.rows.map(fileOut),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load the website" });
  }
});

// PUT /api/:slug/admin/site { site, enabled }
router.put("/", async (req, res) => {
  try {
    const site = cleanSite((req.body || {}).site, req.tenant.name);
    const enabled = Boolean((req.body || {}).enabled);
    await pool.query("UPDATE tenants SET site = $2, site_enabled = $3 WHERE id = $1", [req.tenant.id, JSON.stringify(site), enabled]);
    res.json({ site, enabled });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not save the website" });
  }
});

// POST /api/:slug/admin/site/files — the raw file is the request body.
// Headers: X-File-Name (original name), optional X-Image-Width / X-Image-Height.
router.post("/files", express.raw({ type: () => true, limit: "21mb" }), async (req, res) => {
  const name = decodeURIComponent(String(req.get("x-file-name") || "")).slice(0, 120);
  const ext = (name.match(/\.[A-Za-z0-9]+$/) || [""])[0].toLowerCase();
  const info = TYPES[ext];
  const buf = req.body;
  if (!info) return res.status(400).json({ error: "That file type isn't supported. Use JPG, PNG, WebP, PDF, or a WOFF2/WOFF/TTF/OTF font." });
  if (!Buffer.isBuffer(buf) || !buf.length) return res.status(400).json({ error: "The file is empty." });
  if (buf.length > info.max * 1024 * 1024) return res.status(400).json({ error: `That file is too big. The limit is ${info.max} MB.` });
  if (!looksLike(ext, buf)) return res.status(400).json({ error: "That file doesn't look like a real " + ext.slice(1).toUpperCase() + " file." });
  const width = info.kind === "image" ? parseInt(req.get("x-image-width"), 10) || null : null;
  const height = info.kind === "image" ? parseInt(req.get("x-image-height"), 10) || null : null;
  try {
    const id = crypto.randomUUID();
    const saved = await saveFile(req.tenant.id, id, ext === ".jpeg" ? ".jpg" : ext, buf, info.type);
    const r = await pool.query(
      `INSERT INTO site_files (id, tenant_id, kind, name, content_type, size_bytes, width, height, storage, storage_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [id, req.tenant.id, info.kind, name, info.type, buf.length, width, height, saved.storage, saved.key]
    );
    res.status(201).json(fileOut(r.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Upload failed. Please try again." });
  }
});

// DELETE /api/:slug/admin/site/files/:id
router.delete("/files/:id", async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(404).json({ error: "File not found" });
  try {
    const r = await pool.query("DELETE FROM site_files WHERE tenant_id = $1 AND id = $2 RETURNING *", [req.tenant.id, req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: "File not found" });
    await deleteFile(r.rows[0].storage, r.rows[0].storage_key);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete the file" });
  }
});

module.exports = router;
