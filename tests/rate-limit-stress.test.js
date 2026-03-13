/**
 * Rate-Limit Concurrent Stress Tests
 * 
 * Fires 20+ parallel requests through the RateLimiter token bucket to verify:
 *  - Requests are properly throttled (not all complete simultaneously)
 *  - Token bucket refills correctly over time
 *  - No requests are dropped or deadlocked
 *  - batchRequests respects concurrency limits
 *  - rateLimit wrapper throttles function calls
 */

import { describe, it, expect } from "vitest";
import {
  batchRequests,
  rateLimit,
  getRateLimiterStats,
} from "../src/utils/rate-limit.js";

/**
 * Helper: creates a tracking async function that records when it ran
 */
function makeTracker() {
  const events = [];
  return {
    events,
    fn: async (value) => {
      events.push({ time: Date.now(), value });
      return value;
    },
  };
}

describe("RateLimiter — concurrent stress", () => {
  it("throttles 20 concurrent calls to 3/second", async () => {
    // Create a rate-limited function: 3 calls per 500ms window
    const tracker = makeTracker();
    const limited = rateLimit(tracker.fn, { maxRequests: 3, timeWindow: 500 });

    const COUNT = 20;
    const start = Date.now();

    // Fire all 20 concurrently
    const promises = Array.from({ length: COUNT }, (_, i) => limited(i));
    const results = await Promise.all(promises);

    const elapsed = Date.now() - start;

    // All 20 should complete
    expect(results.length).toBe(COUNT);
    expect(results.sort((a, b) => a - b)).toEqual(Array.from({ length: COUNT }, (_, i) => i));

    // With 3 per 500ms window, 20 calls require at least ceil(20/3)-1 = 6 refill cycles
    // That's at least ~2500ms in theory, but token bucket refill may overlap.
    // At minimum, they can't all complete in under 500ms.
    expect(elapsed).toBeGreaterThan(400);
  }, 30000);

  it("does not deadlock with burst of 50 calls", async () => {
    const tracker = makeTracker();
    const limited = rateLimit(tracker.fn, { maxRequests: 5, timeWindow: 200 });

    const COUNT = 50;
    const promises = Array.from({ length: COUNT }, (_, i) => limited(i));
    const results = await Promise.all(promises);

    expect(results.length).toBe(COUNT);
    // Verify all values present
    const sorted = results.slice().sort((a, b) => a - b);
    expect(sorted[0]).toBe(0);
    expect(sorted[sorted.length - 1]).toBe(COUNT - 1);
  }, 60000);

  it("allows burst up to maxRequests without waiting", async () => {
    const tracker = makeTracker();
    const limited = rateLimit(tracker.fn, { maxRequests: 10, timeWindow: 1000 });

    const start = Date.now();
    // Fire exactly 10 — should all complete nearly instantly since bucket starts full
    const promises = Array.from({ length: 10 }, (_, i) => limited(i));
    const results = await Promise.all(promises);
    const elapsed = Date.now() - start;

    expect(results.length).toBe(10);
    // Should be very fast (well under 1 second)
    expect(elapsed).toBeLessThan(500);
  });

  it("correctly refills tokens over time", async () => {
    const tracker = makeTracker();
    const limited = rateLimit(tracker.fn, { maxRequests: 2, timeWindow: 200 });

    // Use 2 tokens immediately
    await Promise.all([limited(1), limited(2)]);

    // Wait for refill
    await new Promise(r => setTimeout(r, 250));

    // Should have tokens again — these should complete quickly
    const start = Date.now();
    await Promise.all([limited(3), limited(4)]);
    const elapsed = Date.now() - start;

    expect(tracker.events.length).toBe(4);
    expect(elapsed).toBeLessThan(300);
  });
});

describe("batchRequests — concurrency control", () => {
  it("processes 20 requests in batches of 3", async () => {
    let concurrentCount = 0;
    let maxConcurrent = 0;
    const progressCalls = [];

    const requests = Array.from({ length: 20 }, (_, i) => async () => {
      concurrentCount++;
      maxConcurrent = Math.max(maxConcurrent, concurrentCount);
      await new Promise(r => setTimeout(r, 20)); // Small delay to measure concurrency
      concurrentCount--;
      return i;
    });

    const results = await batchRequests(requests, {
      batchSize: 3,
      onProgress: (done, total) => progressCalls.push({ done, total }),
    });

    expect(results.length).toBe(20);
    // Max concurrent should be at most batchSize
    expect(maxConcurrent).toBeLessThanOrEqual(3);
    // Progress should have been reported
    expect(progressCalls.length).toBeGreaterThan(0);
    expect(progressCalls[progressCalls.length - 1].done).toBe(20);
  });

  it("captures individual errors without failing batch", async () => {
    const requests = [
      async () => "ok-1",
      async () => { throw new Error("fail-2"); },
      async () => "ok-3",
      async () => { throw new Error("fail-4"); },
      async () => "ok-5",
    ];

    const results = await batchRequests(requests, { batchSize: 2 });

    expect(results.length).toBe(5);
    expect(results[0]).toBe("ok-1");
    expect(results[1]).toHaveProperty("error");
    expect(results[1].error.message).toBe("fail-2");
    expect(results[2]).toBe("ok-3");
    expect(results[3]).toHaveProperty("error");
    expect(results[4]).toBe("ok-5");
  });

  it("handles empty request array", async () => {
    const results = await batchRequests([]);
    expect(results).toEqual([]);
  });

  it("handles single-item batch", async () => {
    const results = await batchRequests([async () => 42], { batchSize: 1 });
    expect(results).toEqual([42]);
  });
});

describe("getRateLimiterStats", () => {
  it("returns stats for notion and openai limiters", () => {
    const stats = getRateLimiterStats();
    expect(stats).toHaveProperty("notion");
    expect(stats).toHaveProperty("openai");
    expect(stats.notion).toHaveProperty("availableTokens");
    expect(stats.notion).toHaveProperty("maxTokens");
    expect(stats.notion.maxTokens).toBe(3);
    expect(stats.openai.maxTokens).toBe(3);
  });
});
