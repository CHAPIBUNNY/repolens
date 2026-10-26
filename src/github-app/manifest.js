/**
 * GitHub App manifest. Minimal permissions for architecture check runs
 * and the existing pull request comment. `metadata: read` is required by
 * GitHub on every app.
 *
 * `hook_attributes.url` is a placeholder. Replace it with the public URL of
 * `repolens app` before registering. This repository does not register the app.
 */
export const GITHUB_APP_WEBHOOK_PATH = "/api/github/webhooks";

export const GITHUB_APP_MANIFEST = {
  name: "RepoLens",
  description: "Posts an architecture diff as a check run and one sticky pull request comment.",
  url: "https://github.com/CHAPIBUNNY/repolens",
  hook_attributes: {
    url: `https://example.com${GITHUB_APP_WEBHOOK_PATH}`,
    active: true,
  },
  redirect_url: "https://github.com/CHAPIBUNNY/repolens",
  public: false,
  default_permissions: {
    checks: "write",
    pull_requests: "write",
    contents: "read",
    metadata: "read",
  },
  default_events: [
    "installation",
    "installation_repositories",
    "pull_request",
  ],
};

export function manifestDocument() {
  return JSON.stringify(GITHUB_APP_MANIFEST, null, 2);
}
