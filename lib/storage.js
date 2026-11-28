// Where uploaded website files (photos, menu PDFs, logos, fonts) are kept.
//
// With these Render settings, files go to Amazon S3 and are kept permanently:
//   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION (e.g. ap-southeast-2), AWS_S3_BUCKET
// Without them, files are kept on the server's own disk, which Render wipes on every deploy.
// That is only good enough for trying things out, and the website editor says so.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const LOCAL_DIR = path.join(__dirname, "..", "uploads");

function s3Settings() {
  const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, AWS_S3_BUCKET } = process.env;
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_REGION || !AWS_S3_BUCKET) return null;
  return { keyId: AWS_ACCESS_KEY_ID, secret: AWS_SECRET_ACCESS_KEY, region: AWS_REGION, bucket: AWS_S3_BUCKET };
}

function storageMode() {
  return s3Settings() ? "s3" : "local";
}

/* ---------- Amazon S3, signed with AWS Signature Version 4 (no extra packages needed) ---------- */

function hmac(key, data) {
  return crypto.createHmac("sha256", key).update(data).digest();
}
function sha256Hex(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}
function encodeKey(key) {
  return key.split("/").map((p) => encodeURIComponent(p)).join("/");
}

async function s3Request(method, key, body, contentType) {
  const cfg = s3Settings();
  const host = `${cfg.bucket}.s3.${cfg.region}.amazonaws.com`;
  const pathPart = "/" + encodeKey(key);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body || "");
  const headers = { host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate };
  if (contentType) headers["content-type"] = contentType;
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers).sort().map((h) => `${h}:${headers[h]}\n`).join("");
  const canonicalRequest = [method, pathPart, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${dateStamp}/${cfg.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signingKey = hmac(hmac(hmac(hmac("AWS4" + cfg.secret, dateStamp), cfg.region), "s3"), "aws4_request");
  const signature = crypto.createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${cfg.keyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const res = await fetch(`https://${host}${pathPart}`, {
    method,
    headers: { ...headers, Authorization: authorization },
    body: method === "PUT" ? body : undefined,
  });
  if (!res.ok && !(method === "DELETE" && res.status === 404)) {
    const text = await res.text().catch(() => "");
    throw new Error(`S3 ${method} failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return res;
}

/* ---------- Public functions ---------- */

// Saves a file and returns where it went: { storage, key }
async function saveFile(tenantId, fileId, ext, buffer, contentType) {
  const key = `sites/${tenantId}/${fileId}${ext}`;
  if (storageMode() === "s3") {
    await s3Request("PUT", key, buffer, contentType);
    return { storage: "s3", key };
  }
  const full = path.join(LOCAL_DIR, key);
  await fs.promises.mkdir(path.dirname(full), { recursive: true });
  await fs.promises.writeFile(full, buffer);
  return { storage: "local", key };
}

// Returns the file's bytes, or null if it's gone.
async function readFile(storage, key) {
  if (storage === "s3") {
    if (!s3Settings()) return null;
    try {
      const res = await s3Request("GET", key);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      console.error(e.message);
      return null;
    }
  }
  try {
    return await fs.promises.readFile(path.join(LOCAL_DIR, key));
  } catch {
    return null;
  }
}

async function deleteFile(storage, key) {
  try {
    if (storage === "s3") {
      if (s3Settings()) await s3Request("DELETE", key);
    } else {
      await fs.promises.unlink(path.join(LOCAL_DIR, key));
    }
  } catch (e) {
    console.error("Could not delete file:", e.message);
  }
}

module.exports = { storageMode, saveFile, readFile, deleteFile };
