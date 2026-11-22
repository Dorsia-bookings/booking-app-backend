// Simple guard against password guessing: 10 failed attempts per key per 15 minutes.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 10;
const attempts = new Map();

function tooManyAttempts(key) {
  const entry = attempts.get(key);
  if (!entry || Date.now() - entry.first > WINDOW_MS) return false;
  return entry.count >= MAX_FAILS;
}

function recordFailure(key) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.first > WINDOW_MS) attempts.set(key, { first: now, count: 1 });
  else entry.count += 1;
}

function clearFailures(key) {
  attempts.delete(key);
}

module.exports = { tooManyAttempts, recordFailure, clearFailures };
