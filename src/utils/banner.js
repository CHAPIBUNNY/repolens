/**
 * The ASCII banner is for an interactive terminal.
 * CI logs and pipes get the normal command output only.
 */
export function shouldPrintBanner({ isTTY = Boolean(process.stdout.isTTY), env = process.env } = {}) {
  if (env && env.CI) return false;
  if (!isTTY) return false;
  return true;
}
