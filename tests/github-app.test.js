import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadYaml } from "../src/utils/yaml.js";
import { GITHUB_APP_MANIFEST, manifestDocument } from "../src/github-app/manifest.js";
import { signHubBody, verifyHubSignature256 } from "../src/github-app/signature.js";
import { createAppJwt, readAppPrivateKey } from "../src/github-app/auth.js";
import { handleGitHubAppEvent } from "../src/github-app/handler.js";
import { createGitHubAppServer } from "../src/github-app/server.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bin = path.join(root, "bin/repolens.js");
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" });

function runBin(args, env = {}) {
  return spawnSync(process.execPath, [bin, ...args], {
    encoding: "utf8",
    cwd: root,
    env: { ...process.env, CI: "true", ...env },
  });
}

function pullPayload(action = "synchronize") {
  return {
    action,
    installation: { id: 42 },
    repository: { full_name: "octo/hello" },
    pull_request: {
      number: 7,
      base: { sha: "a".repeat(40) },
      head: { sha: "b".repeat(40) },
    },
  };
}

describe("GitHub App manifest", () => {
  it("keeps the permissions to checks, pull requests, contents, and metadata", () => {
    expect(GITHUB_APP_MANIFEST.default_permissions).toEqual({
      checks: "write",
      pull_requests: "write",
      contents: "read",
      metadata: "read",
    });
    expect(GITHUB_APP_MANIFEST.default_events).toEqual([
      "installation",
      "installation_repositories",
      "pull_request",
    ]);
    expect(Object.keys(GITHUB_APP_MANIFEST.default_permissions)).toHaveLength(4);
  });

  it("matches app.yml and github-app-manifest.json", () => {
    const json = JSON.parse(fs.readFileSync(path.join(root, "github-app-manifest.json"), "utf8"));
    const yaml = loadYaml(fs.readFileSync(path.join(root, "app.yml"), "utf8"));
    expect(json).toEqual(GITHUB_APP_MANIFEST);
    expect(yaml).toEqual(GITHUB_APP_MANIFEST);
    expect(JSON.parse(manifestDocument())).toEqual(GITHUB_APP_MANIFEST);
  });
});

describe("webhook signature", () => {
  const secret = "whsec_test";
  const body = Buffer.from('{"zen":"keep it secret"}');

  it("accepts a matching sha256 signature and rejects the rest", () => {
    const signature = signHubBody(body, secret);
    expect(verifyHubSignature256(body, signature, secret)).toBe(true);
    expect(verifyHubSignature256(body, signature, "other")).toBe(false);
    expect(verifyHubSignature256(body, "sha256=deadbeef", secret)).toBe(false);
    expect(verifyHubSignature256(body, "sha1=abc", secret)).toBe(false);
    expect(verifyHubSignature256(body, undefined, secret)).toBe(false);
    expect(verifyHubSignature256(`${body} `, signature, secret)).toBe(false);
  });
});

describe("GitHub App JWT", () => {
  it("signs an RS256 token whose payload carries the app id", () => {
    const now = Date.UTC(2026, 9, 26, 8, 0, 0);
    const token = createAppJwt({ appId: "12345", privateKey: pem, now });
    const [header, payload, signature] = token.split(".");
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    expect(claims.iss).toBe("12345");
    expect(claims.exp - claims.iat).toBe(10 * 60);
    expect(signature.length).toBeGreaterThan(20);
  });

  it("reads a PEM path and unescapes newlines in the env value", () => {
    const file = path.join(root, "tests", ".tmp-app-key.pem");
    fs.writeFileSync(file, pem);
    try {
      expect(readAppPrivateKey({ REPOLENS_APP_PRIVATE_KEY_PATH: file })).toBe(pem);
      expect(readAppPrivateKey({ REPOLENS_APP_PRIVATE_KEY: pem.replace(/\n/g, "\\n") })).toBe(pem);
    } finally {
      fs.rmSync(file, { force: true });
    }
  });
});

describe("webhook handler", () => {
  it("acknowledges installation events without analysis", async () => {
    let analyzed = false;
    const result = await handleGitHubAppEvent({
      eventName: "installation",
      payload: { action: "created", installation: { id: 9 } },
      analyze: async () => { analyzed = true; return { summary: "" }; },
    });
    expect(result.status).toBe(200);
    expect(result.body.handled).toBe("installation");
    expect(result.body.installationId).toBe("9");
    expect(analyzed).toBe(false);
  });

  it("posts a check run and the sticky comment for a pull request", async () => {
    const calls = [];
    const summary = "<!-- repolens:architecture-diff -->\n## RepoLens — Architecture diff\n\nAdded: 1\n";
    const result = await handleGitHubAppEvent({
      eventName: "pull_request",
      payload: pullPayload(),
      prepareRepo: async () => ({ dir: root, cleanup: async () => {} }),
      analyze: async (dir, base, head) => {
        expect(dir).toBe(root);
        expect(base).toBe("a".repeat(40));
        expect(head).toBe("b".repeat(40));
        return { summary };
      },
      request: async (method, urlPath, body) => {
        calls.push({ method, urlPath, body });
        if (method === "GET") return [];
        if (String(urlPath).includes("/check-runs")) return { id: 55 };
        return { id: 77 };
      },
    });
    expect(result.status).toBe(200);
    expect(result.body.checkRunId).toBe(55);
    expect(result.body.comment).toBe("created");
    const check = calls.find((call) => String(call.urlPath).includes("/check-runs"));
    expect(check.body.name).toBe("RepoLens");
    expect(check.body.conclusion).toBe("success");
    expect(check.body.head_sha).toBe("b".repeat(40));
    expect(check.body.output.summary).toContain("Architecture diff");
    const comment = calls.find((call) => call.method === "POST" && String(call.urlPath).includes("/issues/7/comments"));
    expect(comment.body.body).toContain("<!-- repolens:architecture-diff -->");
  });

  it("ignores pull_request actions that do not change code", async () => {
    let analyzed = false;
    const result = await handleGitHubAppEvent({
      eventName: "pull_request",
      payload: pullPayload("labeled"),
      analyze: async () => { analyzed = true; return { summary: "" }; },
    });
    expect(result.status).toBe(200);
    expect(result.body.ignored).toBe("pull_request");
    expect(analyzed).toBe(false);
  });

  it("posts a failed check when analysis throws", async () => {
    const calls = [];
    const result = await handleGitHubAppEvent({
      eventName: "pull_request",
      payload: pullPayload("opened"),
      prepareRepo: async () => ({ dir: root, cleanup: async () => {} }),
      analyze: async () => { throw new Error("scan exploded"); },
      request: async (method, urlPath, body) => {
        calls.push({ method, urlPath, body });
        return { id: 1 };
      },
    });
    expect(result.status).toBe(500);
    expect(result.body.error).toContain("scan exploded");
    expect(calls[0].body.conclusion).toBe("failure");
  });
});

describe("webhook server", () => {
  function listen(server) {
    return new Promise((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve(server.address().port));
    });
  }

  function post(port, { path = "/api/github/webhooks", headers, body }) {
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: "127.0.0.1",
        port,
        path,
        method: "POST",
        headers,
      }, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString() || "null") });
        });
      });
      req.on("error", reject);
      req.end(body);
    });
  }

  it("rejects a bad signature and does not analyze", async () => {
    let analyzed = false;
    const server = createGitHubAppServer({
      webhookSecret: "topsecret",
      inline: true,
      analyze: async () => { analyzed = true; return { summary: "nope" }; },
    });
    const port = await listen(server);
    try {
      const response = await post(port, {
        headers: { "x-github-event": "pull_request", "x-hub-signature-256": "sha256=nope" },
        body: JSON.stringify(pullPayload()),
      });
      expect(response.status).toBe(401);
      expect(analyzed).toBe(false);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("answers 202 and still posts the check when the work is deferred", async () => {
    let posted = false;
    const secret = "topsecret";
    const payload = JSON.stringify({ action: "created", installation: { id: 1 } });
    const server = createGitHubAppServer({
      webhookSecret: secret,
      analyze: async () => { posted = true; return { summary: "" }; },
    });
    const port = await listen(server);
    try {
      const response = await post(port, {
        headers: {
          "x-github-event": "installation",
          "x-hub-signature-256": signHubBody(payload, secret),
          "content-type": "application/json",
        },
        body: payload,
      });
      expect(response.status).toBe(202);
      expect(response.body.accepted).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(posted).toBe(false);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("runs an inline pull_request delivery end to end", async () => {
    const secret = "topsecret";
    const payload = JSON.stringify(pullPayload("opened"));
    const calls = [];
    const server = createGitHubAppServer({
      webhookSecret: secret,
      inline: true,
      prepareRepo: async () => ({ dir: root, cleanup: async () => {} }),
      analyze: async () => ({ summary: "<!-- repolens:architecture-diff -->\n## RepoLens — Architecture diff\n" }),
      request: async (method, urlPath, body) => {
        calls.push({ method, urlPath, body });
        if (method === "GET") return [];
        return { id: 3 };
      },
    });
    const port = await listen(server);
    try {
      const health = await new Promise((resolve, reject) => {
        http.get({ hostname: "127.0.0.1", port, path: "/health" }, (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) }));
        }).on("error", reject);
      });
      expect(health.status).toBe(200);
      expect(health.body.service).toBe("repolens-github-app");

      const response = await post(port, {
        headers: {
          "x-github-event": "pull_request",
          "x-hub-signature-256": signHubBody(payload, secret),
        },
        body: payload,
      });
      expect(response.status).toBe(200);
      expect(response.body.handled).toBe("pull_request");
      expect(calls.some((call) => String(call.urlPath).endsWith("/check-runs"))).toBe(true);
      expect(calls.some((call) => String(call.urlPath).includes("/comments"))).toBe(true);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

describe("repolens app CLI", () => {
  it("prints the manifest without credentials", () => {
    const result = runBin(["app", "--manifest"], {
      REPOLENS_APP_ID: "",
      REPOLENS_WEBHOOK_SECRET: "",
      REPOLENS_APP_PRIVATE_KEY: "",
    });
    expect(result.status).toBe(0);
    const printed = JSON.parse(result.stdout);
    expect(printed.default_permissions.checks).toBe("write");
    expect(printed.hook_attributes.url).toContain("/api/github/webhooks");
  });

  it("exits 2 when the server is missing credentials", () => {
    const result = runBin(["app"], {
      REPOLENS_APP_ID: "",
      REPOLENS_WEBHOOK_SECRET: "",
      REPOLENS_APP_PRIVATE_KEY: "",
      REPOLENS_APP_PRIVATE_KEY_PATH: "",
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("REPOLENS_APP_ID");
  });

  it("prints command help", () => {
    const result = runBin(["app", "--help"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("X-Hub-Signature-256");
    expect(result.stdout).toContain("--manifest");
  });
});
