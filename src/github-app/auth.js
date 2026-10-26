import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { fetchWithRetry } from "../utils/retry.js";
import { sanitizeSecrets } from "../utils/secrets.js";

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

/**
 * GitHub App JWT (RS256). `iat` is 60s in the past so a skewed clock still works.
 * `exp` is 9 minutes ahead (GitHub rejects more than 10).
 */
export function createAppJwt({ appId, privateKey, now = Date.now() }) {
  if (!appId) throw new Error("Missing GitHub App id");
  if (!privateKey || !String(privateKey).includes("BEGIN")) {
    throw new Error("GitHub App private key must be a PEM body");
  }
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    iat: Math.floor(now / 1000) - 60,
    exp: Math.floor(now / 1000) + 9 * 60,
    iss: String(appId),
  }));
  const unsigned = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(privateKey).toString("base64url");
  return `${unsigned}.${signature}`;
}

export function readAppPrivateKey(env = process.env) {
  const file = env.REPOLENS_APP_PRIVATE_KEY_PATH;
  if (file) {
    return readFileSync(file, "utf8");
  }
  const raw = env.REPOLENS_APP_PRIVATE_KEY || "";
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

export function redactToken(text, token) {
  const value = String(text || "");
  if (!token) return value;
  return value.split(token).join("[redacted]");
}

/**
 * Exchange the app JWT for an installation access token.
 * `fetchImpl` is injectable in tests. It must return a Response.
 */
export async function fetchInstallationToken({
  appId,
  privateKey,
  installationId,
  fetchImpl,
  now,
}) {
  if (!/^[0-9]+$/.test(String(installationId))) {
    throw new Error("Invalid installation id");
  }
  const jwt = createAppJwt({ appId, privateKey, now });
  const url = `https://api.github.com/app/installations/${installationId}/access_tokens`;
  const send = fetchImpl || ((resource, options) => fetchWithRetry(resource, options, {
    retries: 2,
    baseDelayMs: 400,
    maxDelayMs: 2000,
    label: "GitHub App token",
  }));
  const response = await send(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "RepoLens",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  const text = await response.text();
  if (!response.ok) {
    const clipped = sanitizeSecrets(String(text || "").replace(/\s+/g, " ").slice(0, 300));
    throw Object.assign(new Error(`GitHub App token request failed (${response.status}): ${clipped}`), {
      status: response.status,
    });
  }
  const json = text ? JSON.parse(text) : {};
  if (!json.token) throw new Error("GitHub App token response had no token");
  return json.token;
}

export function createGitHubRequest(token, fetchImpl) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_]+$/.test(token)) {
    throw new Error("Installation token has an unexpected shape");
  }
  return async function githubRequest(method, urlPath, body) {
    const send = fetchImpl || ((resource, options) => fetchWithRetry(resource, options, {
      retries: 2,
      baseDelayMs: 400,
      maxDelayMs: 2000,
      label: `GitHub ${method}`,
    }));
    const response = await send(`https://api.github.com${urlPath}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "RepoLens",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let json = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    if (!response.ok) {
      const clipped = sanitizeSecrets(redactToken(text, token).replace(/\s+/g, " ").slice(0, 300));
      throw Object.assign(new Error(`GitHub API error ${response.status}: ${clipped}`), {
        status: response.status,
      });
    }
    return json;
  };
}
