require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { resolveTenant } = require("./middleware/tenant");
const bookingsRouter = require("./routes/bookings");
const customersRouter = require("./routes/customers");
const app = express();
app.use(cors());
app.use(express.json());

// Every tenant-scoped route hangs off /api/:tenantSlug/...
// e.g. /api/wharf-and-vine/bookings, /api/wharf-and-vine/tables
app.use("/api/:tenantSlug/bookings", resolveTenant, bookingsRouter);
app.use("/api/:tenantSlug/customers", resolveTenant, customersRouter);
app.get("/health", (req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Booking API running on port ${PORT}`);
});
