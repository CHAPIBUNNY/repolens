import { compareArchitecture, renderArchitectureComment, upsertArchitectureComment } from "../delivery/architecture-comment.js";
import { assertGitHubRepo } from "../utils/github-repo.js";
import { sanitizeSecrets } from "../utils/secrets.js";
import { createGitHubRequest, fetchInstallationToken } from "./auth.js";
import { checkoutPullRequest } from "./checkout.js";

const CHECK_NAME = "RepoLens";
const ANALYZE_ACTIONS = new Set(["opened", "synchronize", "reopened", "ready_for_review"]);
const SUMMARY_LIMIT = 65000;

export function checkRunBody(headSha, summary, conclusion = "success") {
  const text = String(summary || "RepoLens completed with no summary.").slice(0, SUMMARY_LIMIT);
  return {
    name: CHECK_NAME,
    head_sha: headSha,
    status: "completed",
    conclusion,
    output: {
      title: conclusion === "success" ? "Architecture diff" : "Architecture diff failed",
      summary: text,
    },
  };
}

async function defaultAnalyze(dir, base, head) {
  const report = await compareArchitecture(dir, base, head);
  return { summary: renderArchitectureComment(report), report };
}

function installationIdOf(payload) {
  const id = payload?.installation?.id;
  return id == null ? "" : String(id);
}

/**
 * Handle one verified GitHub App webhook.
 *
 * installation and installation_repositories are acknowledged.
 * pull_request opened / synchronize / reopened / ready_for_review runs the
 * existing architecture diff, then posts a Check Run and the sticky comment.
 *
 * Inject `prepareRepo`, `analyze`, `request`, or `getInstallationToken` in tests.
 * Returns `{ status, body }`.
 */
export async function handleGitHubAppEvent({
  eventName,
  payload,
  appId,
  privateKey,
  prepareRepo = checkoutPullRequest,
  analyze = defaultAnalyze,
  request,
  getInstallationToken = fetchInstallationToken,
  fetchImpl,
  now,
} = {}) {
  if (!eventName) {
    return { status: 400, body: { ok: false, error: "Missing X-GitHub-Event" } };
  }
  if (eventName === "ping") {
    return { status: 200, body: { ok: true, handled: "ping" } };
  }
  if (eventName === "installation" || eventName === "installation_repositories") {
    return {
      status: 200,
      body: {
        ok: true,
        handled: eventName,
        action: payload?.action || "",
        installationId: installationIdOf(payload),
      },
    };
  }
  if (eventName !== "pull_request") {
    return { status: 200, body: { ok: true, ignored: eventName } };
  }

  const action = payload?.action || "";
  if (!ANALYZE_ACTIONS.has(action)) {
    return { status: 200, body: { ok: true, ignored: "pull_request", action } };
  }

  const pull = payload?.pull_request;
  const repository = payload?.repository?.full_name;
  const installationId = installationIdOf(payload);
  const baseSha = pull?.base?.sha;
  const headSha = pull?.head?.sha;
  const pullNumber = pull?.number;
  if (!pull || !repository || !installationId || !baseSha || !headSha || pullNumber == null) {
    return { status: 422, body: { ok: false, error: "Pull request payload is missing repository, installation, or commits" } };
  }

  let owner;
  let repo;
  try {
    assertGitHubRepo(repository);
    [owner, repo] = repository.split("/");
  } catch (error) {
    return { status: 422, body: { ok: false, error: error.message } };
  }

  let call = request;
  let token = "";
  if (!call) {
    try {
      token = await getInstallationToken({
        appId,
        privateKey,
        installationId,
        fetchImpl,
        now,
      });
      call = createGitHubRequest(token, fetchImpl);
    } catch (error) {
      return { status: 502, body: { ok: false, error: sanitizeSecrets(error.message || String(error)) } };
    }
  }

  let workspace;
  try {
    workspace = await prepareRepo({
      token,
      owner,
      repo,
      pullNumber,
      baseSha,
      headSha,
    });
    const analyzed = await analyze(workspace.dir, baseSha, headSha);
    const summary = analyzed?.summary || "";
    const check = await call(
      "POST",
      `/repos/${owner}/${repo}/check-runs`,
      checkRunBody(headSha, summary, "success"),
    );
    const comment = await upsertArchitectureComment({
      owner,
      repo,
      issueNumber: pullNumber,
      body: summary,
      request: call,
    });
    return {
      status: 200,
      body: {
        ok: true,
        handled: "pull_request",
        action,
        checkRunId: check?.id ?? null,
        comment: comment?.action || null,
      },
    };
  } catch (error) {
    const message = sanitizeSecrets(error.message || String(error));
    try {
      await call(
        "POST",
        `/repos/${owner}/${repo}/check-runs`,
        checkRunBody(headSha, message, "failure"),
      );
    } catch {
      // The failed check is best-effort. The caller still sees the error.
    }
    return { status: 500, body: { ok: false, error: message } };
  } finally {
    if (workspace?.cleanup) {
      await workspace.cleanup();
    }
  }
}
