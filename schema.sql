-- Restaurant Booking Platform — Multi-tenant Postgres schema
-- Every restaurant is a row in `tenants`. Every other table is scoped
-- to a tenant_id, so one database + one app instance serves all customers.

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid()

-- ─────────────────────────────────────────────
-- TENANTS (one row per restaurant customer)
-- ─────────────────────────────────────────────
CREATE TABLE tenants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              TEXT UNIQUE NOT NULL,        -- e.g. 'wharf-and-vine', used in widget embed + URLs
  name              TEXT NOT NULL,               -- display name, e.g. "Wharf & Vine"
  timezone          TEXT NOT NULL DEFAULT 'Australia/Hobart',
  deposit_threshold INTEGER NOT NULL DEFAULT 6,  -- party size that triggers a deposit
  deposit_per_head  NUMERIC(10,2) NOT NULL DEFAULT 20.00,
  room_width_px     INTEGER NOT NULL DEFAULT 880,
  room_height_px    INTEGER NOT NULL DEFAULT 380,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- SITTINGS (each tenant defines their own service times)
-- ─────────────────────────────────────────────
CREATE TABLE sittings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,        -- "First sitting"
  time_of_day TIME NOT NULL,        -- 18:00
  sort_order  INTEGER NOT NULL DEFAULT 0
);

-- ─────────────────────────────────────────────
-- FLOOR ELEMENTS (tables + walls, built via the Floor Plan Builder)
-- ─────────────────────────────────────────────
CREATE TABLE floor_elements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('table', 'wall')),
  shape       TEXT CHECK (shape IN ('round', 'square', 'rect')), -- null for walls
  label       TEXT NOT NULL DEFAULT '',
  seats       INTEGER,              -- null for walls
  x_pct       NUMERIC(5,2) NOT NULL, -- center position, 0–100
  y_pct       NUMERIC(5,2) NOT NULL,
  width_px    INTEGER NOT NULL,
  height_px   INTEGER NOT NULL,
  rotation_deg INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_floor_elements_tenant ON floor_elements(tenant_id);

-- ─────────────────────────────────────────────
-- CUSTOMERS (one row per unique diner email, per tenant)
-- ─────────────────────────────────────────────
CREATE TABLE customers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  name        TEXT,
  phone       TEXT,
  notes       TEXT DEFAULT '',
  card_last4  TEXT,                 -- masked reference only — real card data lives in Stripe, never here
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);

-- ─────────────────────────────────────────────
-- BOOKINGS
-- ─────────────────────────────────────────────
CREATE TABLE bookings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id       UUID NOT NULL REFERENCES customers(id),
  table_id          UUID REFERENCES floor_elements(id),
  sitting_id        UUID REFERENCES sittings(id),
  booking_date      DATE NOT NULL,
  party_size        INTEGER NOT NULL,
  deposit_required  BOOLEAN NOT NULL DEFAULT false,
  deposit_amount    NUMERIC(10,2) NOT NULL DEFAULT 0,
  deposit_paid      BOOLEAN NOT NULL DEFAULT false,
  stripe_payment_id TEXT,           -- reference to the actual Stripe charge, once wired up
  status            TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'no_show')),
  arrived_guests    BOOLEAN[] NOT NULL DEFAULT '{}', -- per-guest check-in tally
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bookings_tenant_date ON bookings(tenant_id, booking_date);
CREATE INDEX idx_bookings_customer ON bookings(customer_id);

-- ─────────────────────────────────────────────
-- STAFF / OWNER LOGINS
-- ─────────────────────────────────────────────
CREATE TABLE staff_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'staff')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);
