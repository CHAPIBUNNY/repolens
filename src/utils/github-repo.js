export const GITHUB_REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export function assertGitHubRepo(repo) {
  if (typeof repo !== "string" || !GITHUB_REPO_PATTERN.test(repo)) {
    throw new Error(`Invalid GitHub repository "${repo}". Expected owner/name.`);
  }
  return repo;
}
