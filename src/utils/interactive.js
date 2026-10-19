/**
 * Sessions where RepoLens must not wait on a prompt.
 * Covers CI providers, explicit opt-out, the test runner, and pipes.
 */
export function isNonInteractiveEnvironment() {
  if (
    process.env.CI ||
    process.env.GITHUB_ACTIONS ||
    process.env.GITLAB_CI ||
    process.env.CIRCLECI ||
    process.env.JENKINS_HOME ||
    process.env.CODEBUILD_BUILD_ID ||
    process.env.REPOLENS_NON_INTERACTIVE ||
    process.env.NODE_ENV === "test" ||
    process.env.VITEST
  ) {
    return true;
  }
  return !process.stdin.isTTY;
}
