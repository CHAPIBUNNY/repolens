import { log, warn } from "./logger.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status) {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

const MAX_RETRY_AFTER_MS = 60_000;

/**
 * Honour Retry-After when it is delta-seconds or an HTTP date.
 * Unparseable values fall back to exponential backoff. Delays are capped
 * so a hostile header cannot stall the process.
 */
export function retryDelayMs(retryAfterHeader, attempt, baseDelayMs, maxDelayMs) {
  const fallback = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
  if (retryAfterHeader == null || retryAfterHeader === "") return fallback;

  const seconds = Number(retryAfterHeader);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  }

  const when = Date.parse(retryAfterHeader);
  if (Number.isFinite(when)) {
    return Math.min(Math.max(0, when - Date.now()), MAX_RETRY_AFTER_MS);
  }

  return fallback;
}

export async function fetchWithRetry(url, options = {}, config = {}) {
  const {
    retries = 3,
    baseDelayMs = 500,
    maxDelayMs = 4000,
    label = "request",
    timeoutMs = 30000
  } = config;

  let attempt = 0;
  let lastError = null;

  while (attempt <= retries) {
    try {
      // Apply timeout via AbortController
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const fetchOpts = { ...options, signal: controller.signal };
      let response;
      try {
        response = await fetch(url, fetchOpts);
      } finally {
        clearTimeout(timer);
      }

      if (!isRetryableStatus(response.status)) {
        return response;
      }

      const delay = retryDelayMs(
        response.headers.get("retry-after"),
        attempt,
        baseDelayMs,
        maxDelayMs
      );

      warn(`${label} failed with retryable status ${response.status}. Retrying in ${delay}ms (attempt ${attempt + 1}/${retries + 1})`);
      await sleep(delay);
    } catch (error) {
      lastError = error;

      // Convert AbortError to a friendlier timeout message
      if (error.name === "AbortError") {
        lastError = new Error(`${label} timed out after ${timeoutMs}ms`);
      }

      const delay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
      warn(`${label} threw error: ${lastError.message}. Retrying in ${delay}ms (attempt ${attempt + 1}/${retries + 1})`);
      await sleep(delay);
    }

    attempt += 1;
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error(`${label} failed after ${retries + 1} attempts`);
}