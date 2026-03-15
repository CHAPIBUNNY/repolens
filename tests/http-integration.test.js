/**
 * Integration Tests — Mock HTTP Server
 * 
 * Tests Notion & Confluence publisher code paths against a real local HTTP server.
 * Covers: retry on 429/500, timeout handling, auth header validation, error messages.
 * Uses Node built-in http module — no external test dependencies.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import http from "node:http";

// ============================================================
// Shared test HTTP server
// ============================================================

let server;
let serverPort;
let requestLog = [];
let nextResponses = [];

function enqueue(statusCode, body, { delay = 0, headers = {} } = {}) {
  nextResponses.push({ statusCode, body, delay, headers });
}

function startServer() {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        requestLog.push({
          method: req.method,
          url: req.url,
          headers: req.headers,
          body,
        });

        const next = nextResponses.shift();
        if (!next) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "No response enqueued" }));
          return;
        }

        const respond = () => {
          res.writeHead(next.statusCode, {
            "Content-Type": "application/json",
            ...next.headers,
          });
          res.end(typeof next.body === "string" ? next.body : JSON.stringify(next.body));
        };

        if (next.delay > 0) {
          setTimeout(respond, next.delay);
        } else {
          respond();
        }
      });
    });
    server.listen(0, "127.0.0.1", () => {
      serverPort = server.address().port;
      resolve();
    });
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (server) server.close(resolve);
    else resolve();
  });
}

beforeAll(async () => {
  await startServer();
});

afterAll(async () => {
  await stopServer();
});

beforeEach(() => {
  requestLog = [];
  nextResponses = [];
});

// ============================================================
// fetchWithRetry integration tests
// ============================================================

describe("fetchWithRetry against real HTTP server", () => {
  it("returns successful response on 200", async () => {
    const { fetchWithRetry } = await import("../src/utils/retry.js");
    enqueue(200, { ok: true });

    const res = await fetchWithRetry(`http://127.0.0.1:${serverPort}/test`, {}, {
      retries: 0,
      label: "test-200",
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(requestLog.length).toBe(1);
  });

  it("retries on 429 and succeeds on second attempt", async () => {
    const { fetchWithRetry } = await import("../src/utils/retry.js");
    enqueue(429, { error: "rate limited" }, { headers: { "retry-after": "0" } });
    enqueue(200, { ok: true });

    const res = await fetchWithRetry(`http://127.0.0.1:${serverPort}/retry`, {}, {
      retries: 1,
      baseDelayMs: 50,
      maxDelayMs: 100,
      label: "test-429-retry",
    });
    expect(res.status).toBe(200);
    expect(requestLog.length).toBe(2);
  });

  it("retries on 500 server error", async () => {
    const { fetchWithRetry } = await import("../src/utils/retry.js");
    enqueue(500, { error: "internal" });
    enqueue(500, { error: "internal" });
    enqueue(200, { ok: true });

    const res = await fetchWithRetry(`http://127.0.0.1:${serverPort}/retry500`, {}, {
      retries: 2,
      baseDelayMs: 50,
      maxDelayMs: 100,
      label: "test-500-retry",
    });
    expect(res.status).toBe(200);
    expect(requestLog.length).toBe(3);
  });

  it("throws after exhausting retries", async () => {
    const { fetchWithRetry } = await import("../src/utils/retry.js");
    enqueue(502, { error: "bad gateway" });
    enqueue(502, { error: "bad gateway" });

    await expect(
      fetchWithRetry(`http://127.0.0.1:${serverPort}/fail`, {}, {
        retries: 1,
        baseDelayMs: 50,
        maxDelayMs: 100,
        label: "test-exhaust",
      })
    ).rejects.toThrow();
    expect(requestLog.length).toBe(2);
  });

  it("does not retry on 401 (non-retryable)", async () => {
    const { fetchWithRetry } = await import("../src/utils/retry.js");
    enqueue(401, { error: "unauthorized" });

    const res = await fetchWithRetry(`http://127.0.0.1:${serverPort}/auth`, {}, {
      retries: 2,
      baseDelayMs: 50,
      label: "test-401",
    });
    expect(res.status).toBe(401);
    expect(requestLog.length).toBe(1); // No retry
  });

  it("does not retry on 404 (non-retryable)", async () => {
    const { fetchWithRetry } = await import("../src/utils/retry.js");
    enqueue(404, { error: "not found" });

    const res = await fetchWithRetry(`http://127.0.0.1:${serverPort}/missing`, {}, {
      retries: 2,
      baseDelayMs: 50,
      label: "test-404",
    });
    expect(res.status).toBe(404);
    expect(requestLog.length).toBe(1);
  });

  it("times out on slow response", async () => {
    const { fetchWithRetry } = await import("../src/utils/retry.js");
    // Delay response by 2 seconds, but timeout after 200ms
    enqueue(200, { ok: true }, { delay: 2000 });

    await expect(
      fetchWithRetry(`http://127.0.0.1:${serverPort}/slow`, {}, {
        retries: 0,
        timeoutMs: 200,
        label: "slow-endpoint",
      })
    ).rejects.toThrow(/timed out/);
  });

  it("retries on timeout then succeeds", async () => {
    const { fetchWithRetry } = await import("../src/utils/retry.js");
    // First request times out, second succeeds fast
    enqueue(200, { ok: true }, { delay: 2000 });
    enqueue(200, { recovered: true });

    const res = await fetchWithRetry(`http://127.0.0.1:${serverPort}/timeout-retry`, {}, {
      retries: 1,
      timeoutMs: 200,
      baseDelayMs: 50,
      maxDelayMs: 100,
      label: "timeout-retry",
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.recovered).toBe(true);
    expect(requestLog.length).toBe(2);
  });

  it("sends correct headers for Notion-style requests", async () => {
    const { fetchWithRetry } = await import("../src/utils/retry.js");
    enqueue(200, { id: "page-123" });

    await fetchWithRetry(`http://127.0.0.1:${serverPort}/v1/pages`, {
      method: "POST",
      headers: {
        "Authorization": "Bearer ntn_test123",
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ parent: { page_id: "abc" } }),
    }, {
      retries: 0,
      label: "notion-create",
    });

    expect(requestLog.length).toBe(1);
    expect(requestLog[0].method).toBe("POST");
    expect(requestLog[0].headers.authorization).toBe("Bearer ntn_test123");
    expect(requestLog[0].headers["notion-version"]).toBe("2022-06-28");
  });

  it("sends correct Basic Auth for Confluence-style requests", async () => {
    const { fetchWithRetry } = await import("../src/utils/retry.js");
    const auth = Buffer.from("user@test.com:api-token-123").toString("base64");
    enqueue(200, { results: [] });

    await fetchWithRetry(`http://127.0.0.1:${serverPort}/rest/api/content`, {
      method: "GET",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json",
      },
    }, {
      retries: 0,
      label: "confluence-search",
    });

    expect(requestLog.length).toBe(1);
    expect(requestLog[0].headers.authorization).toBe(`Basic ${auth}`);
  });

  it("respects retry-after header from 429 response", async () => {
    const { fetchWithRetry } = await import("../src/utils/retry.js");
    // Server says "retry after 0 seconds" — should be near-instant, not baseDelay
    enqueue(429, { error: "rate limited" }, { headers: { "retry-after": "0" } });
    enqueue(200, { ok: true });

    const start = Date.now();
    const res = await fetchWithRetry(`http://127.0.0.1:${serverPort}/rate-limit`, {}, {
      retries: 1,
      baseDelayMs: 5000, // High base delay to prove retry-after=0 overrides it
      label: "retry-after-test",
    });
    const elapsed = Date.now() - start;

    expect(res.status).toBe(200);
    // retry-after: 0 means immediate — should complete well under 5000ms baseDelay
    expect(elapsed).toBeLessThan(2000);
  });
});

// ============================================================
// Confluence storage format + error messages
// ============================================================

describe("Confluence publisher error handling", () => {
  it("markdownToConfluenceStorage handles code blocks with CDATA injection", async () => {
    const { markdownToConfluenceStorage } = await import("../src/publishers/confluence.js");
    const md = "```javascript\nconsole.log(']]>');\n```";
    const html = markdownToConfluenceStorage(md);
    // The injected ]]> is escaped via CDATA splitting
    expect(html).toContain("]]]]><![CDATA[>");
    // Verify the code macro structure is intact
    expect(html).toContain('<ac:structured-macro ac:name="code">');
    expect(html).toContain('<ac:parameter ac:name="language">javascript</ac:parameter>');
  });

  it("markdownToConfluenceStorage converts headings, lists, tables", async () => {
    const { markdownToConfluenceStorage } = await import("../src/publishers/confluence.js");
    const md = [
      "# Title",
      "## Section",
      "- Item 1",
      "- Item 2",
      "",
      "| Name | Value |",
      "|------|-------|",
      "| foo  | bar   |",
    ].join("\n");
    const html = markdownToConfluenceStorage(md);
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<h2>Section</h2>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>Item 1</li>");
    expect(html).toContain("<table>");
    expect(html).toContain("<th>Name</th>");
  });

  it("markdownToConfluenceStorage handles empty and null content gracefully", async () => {
    const { markdownToConfluenceStorage } = await import("../src/publishers/confluence.js");
    
    // Null content should return a fallback message
    const nullResult = markdownToConfluenceStorage(null);
    expect(nullResult).toContain("No content available");
    
    // Empty string should return a fallback message
    const emptyResult = markdownToConfluenceStorage("");
    expect(emptyResult).toContain("No content available");
    
    // Whitespace-only content should return a fallback message
    const whitespaceResult = markdownToConfluenceStorage("   \n\n   ");
    expect(whitespaceResult).toContain("No content available");
  });
});

// ============================================================
// Notion markdown-to-blocks + error handling
// ============================================================

describe("Notion publisher block generation", () => {
  it("markdownToNotionBlocks produces correct block types", async () => {
    const { markdownToNotionBlocks } = await import("../src/publishers/notion.js");
    const md = [
      "# Heading 1",
      "## Heading 2",
      "### Heading 3",
      "- Bullet item",
      "1. Numbered item",
      "> Quote text",
      "Regular paragraph",
    ].join("\n");
    const blocks = markdownToNotionBlocks(md);
    const types = blocks.map(b => b.type);
    expect(types).toContain("heading_1");
    expect(types).toContain("heading_2");
    expect(types).toContain("heading_3");
    expect(types).toContain("bulleted_list_item");
    expect(types).toContain("numbered_list_item");
    expect(types).toContain("callout");
    expect(types).toContain("paragraph");
  });

  it("markdownToNotionBlocks handles null/undefined gracefully", async () => {
    const { markdownToNotionBlocks } = await import("../src/publishers/notion.js");
    expect(markdownToNotionBlocks(null)).toEqual([]);
    expect(markdownToNotionBlocks(undefined)).toEqual([]);
    expect(markdownToNotionBlocks("")).toEqual([]);
  });

  it("parseInlineRichText handles bold, italic, code", async () => {
    const { parseInlineRichText } = await import("../src/publishers/notion.js");
    const segments = parseInlineRichText("Hello **bold** and `code` and *italic* text");
    const boldSeg = segments.find(s => s.annotations?.bold);
    const codeSeg = segments.find(s => s.annotations?.code);
    const italicSeg = segments.find(s => s.annotations?.italic);
    expect(boldSeg?.text.content).toBe("bold");
    expect(codeSeg?.text.content).toBe("code");
    expect(italicSeg?.text.content).toBe("italic");
  });

  it("rewriteRelativeLinks strips relative paths", async () => {
    const { rewriteRelativeLinks } = await import("../src/publishers/notion.js");
    expect(rewriteRelativeLinks("[link](./file.md)")).toBe("link");
    expect(rewriteRelativeLinks("[docs](../README.md)")).toBe("docs");
    expect(rewriteRelativeLinks("[ext](https://example.com)")).toBe("[ext](https://example.com)");
  });
});
