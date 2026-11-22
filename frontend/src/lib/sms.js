// Sends text messages through Twilio. Until the Twilio settings are added on Render,
// messages are only saved and shown on the dashboard ("test mode"), never sent.
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM (a Twilio number, or a sender name like DonCamillo)
const pool = require("../db");

function smsLive() {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);
}

// Australian mobile numbers written locally (0412 345 678) become +61412345678.
function normalisePhone(raw) {
  const p = String(raw || "").replace(/[^\d+]/g, "");
  if (p.startsWith("+")) return p;
  if (p.startsWith("61")) return "+" + p;
  if (p.startsWith("0") && p.length === 10) return "+61" + p.slice(1);
  return p;
}

async function sendSms({ tenantId, entryId, to, body }) {
  const phone = normalisePhone(to);
  let status = "test";
  let error = null;
  if (!phone) {
    status = "failed";
    error = "No phone number";
  } else if (smsLive()) {
    try {
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
        method: "POST",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ To: phone, From: process.env.TWILIO_FROM, Body: body }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) status = "sent";
      else {
        status = "failed";
        error = data.message || `Twilio error ${res.status}`;
      }
    } catch (e) {
      status = "failed";
      error = e.message;
    }
  }
  await pool.query(
    "INSERT INTO sms_messages (tenant_id, entry_id, to_phone, body, status, error) VALUES ($1,$2,$3,$4,$5,$6)",
    [tenantId, entryId || null, phone || String(to || ""), body, status, error]
  );
  if (status === "failed") console.error("SMS failed:", error);
  return { status, error };
}

module.exports = { smsLive, sendSms, normalisePhone };
