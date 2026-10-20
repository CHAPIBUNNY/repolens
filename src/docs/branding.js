/**
 * Footer badge on generated Markdown.
 * On unless config sets `branding: false` or `branding.badge: false`.
 */

export const DOCS_BADGE_MARKER = "<!-- repolens:docs-badge -->";

export const DOCS_BADGE_MARKDOWN =
  "[![Docs by RepoLens](https://img.shields.io/badge/Docs%20by-RepoLens-0B5FFF)](https://github.com/CHAPIBUNNY/repolens) · [Examples](https://chapibunny.github.io/repolens/)";

export function brandingEnabled(config) {
  const branding = config?.branding;
  if (branding === false) return false;
  if (branding && typeof branding === "object" && !Array.isArray(branding) && branding.badge === false) {
    return false;
  }
  return true;
}

/**
 * Append the Docs by RepoLens line once. Non-strings are returned unchanged.
 */
export function applyBrandingFooter(content, config) {
  if (typeof content !== "string") return content;
  if (!brandingEnabled(config)) return content;
  if (content.includes(DOCS_BADGE_MARKER)) return content;
  const trimmed = content.trimEnd();
  return `${trimmed}\n\n${DOCS_BADGE_MARKER}\n${DOCS_BADGE_MARKDOWN}\n`;
}
