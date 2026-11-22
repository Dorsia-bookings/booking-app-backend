// Shared helpers for logins: password rules, hashing, tokens.
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const MIN_PASSWORD = 10;

function cleanEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function validEmail(email) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

function passwordProblem(password) {
  if (typeof password !== "string" || password.length < MIN_PASSWORD) {
    return `Use a password of at least ${MIN_PASSWORD} characters.`;
  }
  if (password.length > 200) return "That password is too long.";
  return null;
}

function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

function checkPassword(password, hash) {
  return bcrypt.compare(String(password || ""), hash);
}

// Restaurant login (owner or staff)
function issueTenantToken(tenantId, user) {
  return jwt.sign({ kind: "tenant", tenantId, userId: user.id }, process.env.JWT_SECRET, { expiresIn: "30d" });
}

// Dorsia master login (all restaurants)
function issuePlatformToken(admin) {
  return jwt.sign({ kind: "platform", userId: admin.id }, process.env.JWT_SECRET, { expiresIn: "30d" });
}

function readToken(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

module.exports = {
  cleanEmail,
  validEmail,
  passwordProblem,
  hashPassword,
  checkPassword,
  issueTenantToken,
  issuePlatformToken,
  readToken,
  safeEqual,
};
