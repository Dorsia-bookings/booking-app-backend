# Restaurant Booking Backend — starting scaffold

This is the real backend structure for the multi-tenant booking platform,
matching the prototype we've been building. Nothing here is fake — it's a
working starting point, not a mockup.

## What's here

- `schema.sql` — the full Postgres schema. One `tenants` row per restaurant;
  every other table (bookings, customers, floor_elements, staff_users) is
  scoped by `tenant_id`. This is what lets one deployment serve every
  restaurant customer instead of a separate copy per client.
- `server.js` — the Express entry point.
- `middleware/tenant.js` — resolves which restaurant a request belongs to,
  from the URL (`/api/:tenantSlug/...`). This is the core of the multi-tenant
  design — the widget embed code and dashboard both pass a tenant slug.
- `routes/bookings.js` — booking creation, listing, and check-in toggling,
  already wired to the schema (deposit logic included).
- `render.yaml` — a Render "blueprint": deploys the web service AND the
  Postgres database together in one click, instead of setting each up by hand.
- `.env.example` — copy to `.env` for local development. Never commit `.env`.

## Deploying on Render

**Easiest path — use the blueprint:**
1. Push this folder to a GitHub repo.
2. In the Render dashboard, click **New > Blueprint**, connect the repo.
   Render reads `render.yaml` and provisions both the web service and the
   Postgres database automatically, wired together.
3. Once it's live, run the schema against the new database:
   ```bash
   psql <External Database URL from Render> -f schema.sql
   ```
4. Your API is live at something like `restaurant-booking-api.onrender.com`.

**Manual path** (if you'd rather set each piece up yourself): see the
step-by-step walkthrough in our conversation — New PostgreSQL, then New Web
Service, connect GitHub, set `DATABASE_URL` and `JWT_SECRET` as environment
variables, deploy.

### Local development
```bash
cd booking-backend
npm install
cp .env.example .env      # fill in a local DATABASE_URL and JWT_SECRET
psql $DATABASE_URL -f schema.sql
npm run dev
```

## What's intentionally NOT built yet

- Stripe integration (deposit payments are calculated but not actually charged)
- SMS/email sending (Twilio/email provider)
- Owner login/auth routes (staff_users table exists, but no login endpoint yet)
- The floor plan / customer notes / room size API routes (bookings is the
  first slice — same pattern extends to the rest)

Each of these slots into the same tenant-scoped pattern already established
in `routes/bookings.js`.
