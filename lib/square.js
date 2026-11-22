// Square card payments for booking deposits.
// Set these in Render → booking-app-backend → Environment:
//   SQUARE_ENVIRONMENT    "sandbox" for testing, "production" for real money
//   SQUARE_APPLICATION_ID from Square Developer → your app → Credentials
//   SQUARE_ACCESS_TOKEN   from the same page (keep this secret)
//   SQUARE_LOCATION_ID    from Square Developer → your app → Locations
// If any are missing, deposits are recorded as "pending" and no card is taken.
const crypto = require("crypto");

function squareConfig() {
  const env = process.env.SQUARE_ENVIRONMENT === "production" ? "production" : "sandbox";
  const cfg = {
    environment: env,
    applicationId: process.env.SQUARE_APPLICATION_ID || "",
    accessToken: process.env.SQUARE_ACCESS_TOKEN || "",
    locationId: process.env.SQUARE_LOCATION_ID || "",
    apiBase: env === "production" ? "https://connect.squareup.com" : "https://connect.squareupsandbox.com",
  };
  cfg.enabled = Boolean(cfg.applicationId && cfg.accessToken && cfg.locationId);
  return cfg;
}

// What the browser needs to show the card form. Never includes the access token.
function publicSquareConfig() {
  const cfg = squareConfig();
  if (!cfg.enabled) return { enabled: false };
  return {
    enabled: true,
    environment: cfg.environment,
    applicationId: cfg.applicationId,
    locationId: cfg.locationId,
  };
}

async function squareRequest(path, body) {
  const cfg = squareConfig();
  const res = await fetch(cfg.apiBase + path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.errors) {
    const detail = data.errors?.[0]?.detail || data.errors?.[0]?.code || `Square error ${res.status}`;
    const err = new Error(detail);
    err.square = data.errors;
    throw err;
  }
  return data;
}

// amount in dollars, e.g. 120
async function chargeDeposit({ sourceId, amount, email, reference, note }) {
  const cfg = squareConfig();
  const data = await squareRequest("/v2/payments", {
    source_id: sourceId,
    idempotency_key: crypto.randomUUID(),
    amount_money: { amount: Math.round(amount * 100), currency: "AUD" },
    location_id: cfg.locationId,
    autocomplete: true,
    reference_id: reference,
    note: note ? note.slice(0, 500) : undefined,
    buyer_email_address: email || undefined,
  });
  return data.payment;
}

async function refundPayment({ paymentId, amount, reason }) {
  const data = await squareRequest("/v2/refunds", {
    idempotency_key: crypto.randomUUID(),
    payment_id: paymentId,
    amount_money: { amount: Math.round(amount * 100), currency: "AUD" },
    reason: reason || undefined,
  });
  return data.refund;
}

module.exports = { squareConfig, publicSquareConfig, chargeDeposit, refundPayment };
