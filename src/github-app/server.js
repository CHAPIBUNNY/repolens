import http from "node:http";
import { GITHUB_APP_WEBHOOK_PATH } from "./manifest.js";
import { verifyHubSignature256 } from "./signature.js";
import { handleGitHubAppEvent } from "./handler.js";

const MAX_BODY_BYTES = 2_000_000;

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("Payload too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/**
 * HTTP server for the GitHub App webhook.
 *
 * GitHub gives a webhook about 10 seconds. Analysis can take longer, so the
 * default response is 202 and the check run is posted afterwards. Tests pass
 * `inline: true` and wait for the handler before the response is sent.
 */
export function createGitHubAppServer(options) {
  const webhookPath = options.webhookPath || GITHUB_APP_WEBHOOK_PATH;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/")) {
      sendJson(res, 200, { ok: true, service: "repolens-github-app" });
      return;
    }
    if (req.method !== "POST" || url.pathname !== webhookPath) {
      sendJson(res, 404, { ok: false, error: "Not found" });
      return;
    }

    let raw;
    try {
      raw = await readBody(req);
    } catch (error) {
      sendJson(res, error.status || 400, { ok: false, error: error.message || "Could not read the body" });
      return;
    }

    if (!verifyHubSignature256(raw, req.headers["x-hub-signature-256"], options.webhookSecret)) {
      sendJson(res, 401, { ok: false, error: "Invalid signature" });
      return;
    }

    let payload;
    try {
      payload = JSON.parse(raw.toString("utf8") || "null");
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid JSON" });
      return;
    }

    const eventName = req.headers["x-github-event"];
    const run = () => handleGitHubAppEvent({
      eventName: typeof eventName === "string" ? eventName : "",
      payload,
      appId: options.appId,
      privateKey: options.privateKey,
      prepareRepo: options.prepareRepo,
      analyze: options.analyze,
      request: options.request,
      getInstallationToken: options.getInstallationToken,
      fetchImpl: options.fetchImpl,
    });

    if (options.inline) {
      try {
        const result = await run();
        sendJson(res, result.status, result.body);
      } catch (error) {
        sendJson(res, 500, { ok: false, error: error.message || "Webhook failed" });
      }
      return;
    }

    sendJson(res, 202, { ok: true, accepted: true });
    run().then((result) => {
      if (result?.body?.ok === false) {
        console.error(`RepoLens GitHub App: ${result.body.error || "event failed"}`);
      }
    }).catch((error) => {
      console.error(`RepoLens GitHub App: ${error.message || error}`);
    });
  });
  return server;
}

export function listenGitHubApp(server, { port, host }) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.removeListener("error", reject);
      const address = server.address();
      resolve(typeof address === "object" && address ? address.port : port);
    });
  });
}
