import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify a GitHub `X-Hub-Signature-256` header against the raw request body.
 * The comparison is constant-time when the header has the expected length.
 */
export function verifyHubSignature256(rawBody, signatureHeader, secret) {
  if (!secret || typeof secret !== "string") return false;
  if (typeof signatureHeader !== "string" || !signatureHeader.startsWith("sha256=")) return false;
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody));
  const digest = createHmac("sha256", secret).update(body).digest("hex");
  const expected = Buffer.from(`sha256=${digest}`, "utf8");
  const actual = Buffer.from(signatureHeader, "utf8");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function signHubBody(rawBody, secret) {
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody));
  const digest = createHmac("sha256", secret).update(body).digest("hex");
  return `sha256=${digest}`;
}
