require("dotenv").config({ quiet: true });
const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const { resolveTenant } = require("./middleware/tenant");
const { requireAuth, requireOwner } = require("./middleware/auth");
const { runMigrations } = require("./migrations");
const { runSeed } = require("./lib/seed");
const publicRouter = require("./routes/public");
const authRouter = require("./routes/auth");
const adminRouter = require("./routes/admin");
const bookingsRouter = require("./routes/bookings");
const customersRouter = require("./routes/customers");
const teamRouter = require("./routes/team");
const platformRouter = require("./routes/platform");
const waitlistRouter = require("./routes/waitlist");
const { rememberBase, startWaitlistTimer } = require("./lib/waitlist");

const app = express();
app.set("trust proxy", 1); // Render sits in front of the app; needed for correct visitor IPs
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  rememberBase(req);
  next();
});

// Every restaurant's routes hang off /api/:tenantSlug/...
// e.g. /api/don-camillo/public/config, /api/don-camillo/admin/state
app.use("/api/platform", platformRouter);
app.use("/api/:tenantSlug/public", resolveTenant, publicRouter);
app.use("/api/:tenantSlug/auth", resolveTenant, authRouter);
app.use("/api/:tenantSlug/admin/waitlist", resolveTenant, requireAuth, waitlistRouter);
app.use("/api/:tenantSlug/admin/bookings", resolveTenant, requireAuth, bookingsRouter);
app.use("/api/:tenantSlug/admin", resolveTenant, requireAuth, adminRouter);
app.use("/api/:tenantSlug/customers", resolveTenant, requireAuth, customersRouter);
app.use("/api/:tenantSlug/team", resolveTenant, requireAuth, requireOwner, teamRouter);
app.get("/health", (req, res) => res.json({ status: "ok" }));
app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

// The booking app itself (built from the frontend folder during deploy)
const appDir = path.join(__dirname, "frontend", "dist");
if (fs.existsSync(appDir)) {
  app.use(express.static(appDir, { index: false }));
  app.get("*", (req, res) => res.sendFile(path.join(appDir, "index.html")));
}

const PORT = process.env.PORT || 4000;

runMigrations()
  .then(runSeed)
  .then(() => {
    if (!process.env.JWT_SECRET) console.warn("WARNING: JWT_SECRET is not set, so nobody can log in.");
    startWaitlistTimer();
    app.listen(PORT, () => {
      console.log(`Booking API running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Startup failed:", err);
    process.exit(1);
  });
