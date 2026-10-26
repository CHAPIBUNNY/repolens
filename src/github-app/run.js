import { manifestDocument } from "./manifest.js";
import { readAppPrivateKey } from "./auth.js";
import { createGitHubAppServer, listenGitHubApp } from "./server.js";
import { GITHUB_APP_WEBHOOK_PATH } from "./manifest.js";

function positiveInteger(value, fallback) {
  if (value == null || value === "") return fallback;
  if (!/^[0-9]+$/.test(String(value))) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) return null;
  return parsed;
}

/**
 * `repolens app` self-hosts the webhook.
 * `--manifest` prints the manifest JSON and does not need credentials.
 * Returns a process exit code. The server process stays up on success.
 */
export async function runGitHubApp({
  manifest = false,
  port,
  host,
  webhookPath,
  env = process.env,
  stdout = console.log,
  stderr = console.error,
} = {}) {
  if (manifest) {
    stdout(`${manifestDocument()}\n`);
    return 0;
  }

  const appId = env.REPOLENS_APP_ID || "";
  const webhookSecret = env.REPOLENS_WEBHOOK_SECRET || "";
  let privateKey = "";
  try {
    privateKey = readAppPrivateKey(env);
  } catch (error) {
    stderr(`Could not read REPOLENS_APP_PRIVATE_KEY_PATH: ${error.message}`);
    return 2;
  }
  if (!appId || !webhookSecret || !privateKey) {
    stderr("repolens app needs REPOLENS_APP_ID, REPOLENS_WEBHOOK_SECRET, and REPOLENS_APP_PRIVATE_KEY or REPOLENS_APP_PRIVATE_KEY_PATH.");
    stderr("Print the manifest with: repolens app --manifest");
    return 2;
  }

  const chosenPort = positiveInteger(port ?? env.REPOLENS_APP_PORT, 8787);
  if (chosenPort == null) {
    stderr("--port must be an integer from 0 to 65535");
    return 2;
  }
  const chosenHost = host || env.REPOLENS_APP_HOST || "127.0.0.1";
  const chosenPath = webhookPath || env.REPOLENS_APP_WEBHOOK_PATH || GITHUB_APP_WEBHOOK_PATH;

  const server = createGitHubAppServer({
    webhookSecret,
    webhookPath: chosenPath,
    appId,
    privateKey,
  });
  const bound = await listenGitHubApp(server, { port: chosenPort, host: chosenHost });
  stderr(`RepoLens GitHub App listening on http://${chosenHost}:${bound}${chosenPath}`);
  stderr("GitHub must reach that URL over HTTPS. The process stays running until you stop it.");
  await new Promise(() => {});
  return 0;
}
