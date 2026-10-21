// HTML for the gallery. Markdown in is treated as text.
// Badge JSON and SVG come from the same helpers as `repolens badge`.

import { badgeMarkdown, badgeSvg, shieldsEndpoint } from "../src/badge.js";
import { GALLERY_URL, REPO_URL } from "../src/delivery/comment-constants.js";

const CTA_COMMAND = "npx @chappibunny/repolens demo";

export const LINKS = {
  npm: "https://www.npmjs.com/package/@chappibunny/repolens",
  github: REPO_URL,
  vscode: "https://marketplace.visualstudio.com/items?itemName=repolensdox.repolensdox",
  mcprush: "https://mcprush.com/to/chapibunny-repolens-mcp?ref=badge",
  gallery: GALLERY_URL,
};

const MCPRUSH_BADGE = "https://mcprush.com/badge/chapibunny-repolens-mcp/card.svg";

const AUDIENCE = {
  "non-technical": "Stakeholders",
  mixed: "Mixed audience",
  technical: "Engineers",
};

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

export function languageAnchor(language) {
  const special = { "C#": "csharp", "C++": "cpp", "C": "c" };
  const slug = special[language] || String(language).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `language-${slug || "other"}`;
}

function safeUrl(href, docs) {
  if (!href) return null;
  const trimmed = href.trim();
  const file = trimmed.replace(/^\.\//, "").split("#")[0];
  const known = docs?.find((doc) => doc.filename === file);
  if (known) return `#${known.anchor}`;
  if (trimmed.startsWith("#") && /^#[A-Za-z0-9_-]+$/.test(trimmed)) return trimmed;
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:") {
    return url.href;
  }
  return null;
}

function inline(raw, docs) {
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)\s]+\))|(\*[^*\n]+\*)/g;
  let html = "";
  let last = 0;
  for (const match of raw.matchAll(re)) {
    if (match.index > last) html += escapeHtml(raw.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("`")) {
      html += `<code>${escapeHtml(token.slice(1, -1))}</code>`;
    } else if (token.startsWith("**")) {
      html += `<strong>${escapeHtml(token.slice(2, -2))}</strong>`;
    } else if (token.startsWith("[")) {
      const parts = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
      const href = parts && safeUrl(parts[2], docs);
      html += href
        ? `<a href="${escapeAttr(href)}">${escapeHtml(parts[1])}</a>`
        : escapeHtml(parts ? parts[1] : token);
    } else if (token.startsWith("*")) {
      html += `<em>${escapeHtml(token.slice(1, -1))}</em>`;
    }
    last = match.index + token.length;
  }
  if (last < raw.length) html += escapeHtml(raw.slice(last));
  return html;
}

function isBlockStart(line) {
  const trimmed = line.trim();
  return (
    trimmed.startsWith("```") ||
    /^\s*\|/.test(line) ||
    /^\s*[-*]\s+/.test(line) ||
    /^\s*\d+\.\s+/.test(line) ||
    /^\s*>\s?/.test(line) ||
    /^#{1,6}\s+/.test(line) ||
    /^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)
  );
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function splitRow(line) {
  let row = line.trim();
  if (row.startsWith("|")) row = row.slice(1);
  if (row.endsWith("|")) row = row.slice(0, -1);
  return row.split("|").map((cell) => cell.trim());
}

function isSeparator(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function renderTable(rows, docs) {
  if (rows.length === 0) return "";
  let body = rows;
  let header = null;
  if (rows.length > 1 && isSeparator(rows[1])) {
    header = splitRow(rows[0]);
    body = rows.slice(2);
  }
  const head = header
    ? `<thead><tr>${header.map((cell) => `<th>${inline(cell, docs)}</th>`).join("")}</tr></thead>`
    : "";
  const bodyHtml = body
    .filter((line) => !isSeparator(line))
    .map((line) => `<tr>${splitRow(line).map((cell) => `<td>${inline(cell, docs)}</td>`).join("")}</tr>`)
    .join("");
  return `<div class="table-wrap"><table>${head}<tbody>${bodyHtml}</tbody></table></div>`;
}

export function renderMarkdown(markdown, { docs = [], idPrefix = "" } = {}) {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const out = [];
  const seen = new Map();
  let i = 0;

  function headingId(text) {
    const base = `${idPrefix}${slugify(text) || "section"}`;
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count + 1}`;
  }

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      const lang = trimmed.slice(3).trim();
      const safeLang = /^[A-Za-z0-9_+#.-]{1,24}$/.test(lang) ? lang : "";
      const buf = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        buf.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      const klass = safeLang ? ` class="language-${escapeAttr(safeLang)}"` : "";
      out.push(`<pre><code${klass}>${escapeHtml(buf.join("\n"))}</code></pre>`);
      continue;
    }

    if (/^\s*\|/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        rows.push(lines[i]);
        i += 1;
      }
      out.push(renderTable(rows, docs));
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i += 1;
      }
      out.push(`<ul>${items.map((item) => `<li>${inline(item, docs)}</li>`).join("")}</ul>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i += 1;
      }
      out.push(`<ol>${items.map((item) => `<li>${inline(item, docs)}</li>`).join("")}</ol>`);
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      out.push(`<blockquote>${renderMarkdown(buf.join("\n"), { docs, idPrefix })}</blockquote>`);
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      out.push("<hr>");
      i += 1;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      const level = Math.min(6, heading[1].length + 2);
      const text = heading[2].trim();
      out.push(`<h${level} id="${escapeAttr(headingId(text))}">${inline(text, docs)}</h${level}>`);
      i += 1;
      continue;
    }

    if (trimmed === "") {
      i += 1;
      continue;
    }

    const para = [];
    while (i < lines.length && lines[i].trim() !== "" && !isBlockStart(lines[i])) {
      para.push(lines[i].trim());
      i += 1;
    }
    out.push(`<p>${inline(para.join(" "), docs)}</p>`);
  }

  return out.join("\n");
}

function stripLeadingTitle(markdown) {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i += 1;
  if (/^#\s+/.test(lines[i] || "")) lines.splice(i, 1);
  return lines.join("\n");
}

function ctaBlock() {
  return `<aside class="cta">
  <p class="cta-line">Generate this for your repo: <code>${escapeHtml(CTA_COMMAND)}</code></p>
  <p class="cta-links">
    <a href="${LINKS.npm}">npm</a>
    <a href="${LINKS.github}">GitHub</a>
    <a href="${LINKS.vscode}">VS Code extension</a>
    <a href="${LINKS.mcprush}">MCP Rush</a>
  </p>
</aside>`;
}

function layout({ title, description, canonical, image, home, logo, css, depth, jsonLd, body }) {
  const ld = JSON.stringify(jsonLd).replace(/</g, "\\u003c");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeAttr(description)}">
  <link rel="canonical" href="${escapeAttr(canonical)}">
  <meta name="robots" content="index,follow">
  <meta name="theme-color" content="#1565C0">
  <meta property="og:site_name" content="RepoLens">
  <meta property="og:title" content="${escapeAttr(title)}">
  <meta property="og:description" content="${escapeAttr(description)}">
  <meta property="og:url" content="${escapeAttr(canonical)}">
  <meta property="og:image" content="${escapeAttr(image)}">
  <meta property="og:image:alt" content="RepoLens robot logo">
  <meta property="og:type" content="${depth === 0 ? "website" : "article"}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escapeAttr(title)}">
  <meta name="twitter:description" content="${escapeAttr(description)}">
  <meta name="twitter:image" content="${escapeAttr(image)}">
  <link rel="icon" href="${escapeAttr(logo)}" type="image/png">
  <link rel="apple-touch-icon" href="${escapeAttr(logo)}">
  <link rel="stylesheet" href="${escapeAttr(css)}">
  <script type="application/ld+json">${ld}</script>
</head>
<body>
  <a class="skip" href="#content">Skip to content</a>
  <header class="appbar">
    <a class="brand" href="${escapeAttr(home)}">
      <img src="${escapeAttr(logo)}" width="40" height="40" alt="">
      <span>RepoLens</span>
    </a>
    <nav aria-label="RepoLens">
      <a href="${LINKS.npm}">npm</a>
      <a href="${LINKS.github}">GitHub</a>
      <a href="${LINKS.vscode}">VS Code</a>
      <a href="${LINKS.mcprush}">MCP Rush</a>
    </nav>
  </header>
  ${body}
</body>
</html>
`;
}

export function sitePath(basePath, rel) {
  const base = String(basePath || "").replace(/\/$/, "");
  if (!rel) return `${base}/` || "/";
  const joined = `${base}/${String(rel).replace(/^\//, "")}`.replace(/\/{2,}/g, "/");
  return joined.startsWith("/") ? joined : `/${joined}`;
}

function chrome(origin, basePath) {
  return {
    home: sitePath(basePath, ""),
    logo: sitePath(basePath, "assets/logo.png"),
    css: sitePath(basePath, "assets/site.css"),
    image: pageUrl(origin, basePath, "assets/logo.png"),
  };
}

function mcpListing() {
  return `<aside class="mcp-listing">
  <h2>MCP server</h2>
  <p>Coding agents start it with <code>npx -y @chappibunny/repolens mcp</code>. The listing is on MCP Rush.</p>
  <p><a href="${LINKS.mcprush}"><img src="${MCPRUSH_BADGE}" alt="RepoLens MCP server" width="360"></a></p>
</aside>`;
}

function descriptionOf(text, fallback) {
  const flat = String(text || fallback || "")
    .replace(/\s+/g, " ")
    .trim();
  if (flat.length <= 180) return flat;
  return `${flat.slice(0, 177).trim()}...`;
}

export function renderIndex({ origin, basePath, generatedOn, version, pages, skipped, curatedCount }) {
  const canonical = pageUrl(origin, basePath, "");
  const groups = [];
  for (const page of pages) {
    let group = groups.find((item) => item.language === page.language);
    if (!group) {
      group = { language: page.language, pages: [] };
      groups.push(group);
    }
    group.pages.push(page);
  }

  const jumps = groups
    .map((group) => `<a href="#${languageAnchor(group.language)}">${escapeHtml(group.language)}</a>`)
    .join("");

  const sections = groups.map((group) => {
    const rows = group.pages.map((page) => {
      const score = page.stats?.health?.score;
      const scoreCell = score == null
        ? "—"
        : `<a href="${escapeAttr(sitePath(basePath, `${page.slug}/score/`))}">${escapeHtml(score)}</a>`;
      return `<tr>
      <td data-label="Repository"><a class="repo-name" href="${escapeAttr(sitePath(basePath, `${page.slug}/`))}">${escapeHtml(page.name)}</a><span class="blurb">${escapeHtml(page.blurb)}</span><span class="row-links"><a href="${escapeAttr(sitePath(basePath, `${page.slug}/explained/`))}">Architecture explained</a></span></td>
      <td data-label="Language">${escapeHtml(page.language)}</td>
      <td class="num" data-label="Modules">${page.stats.modules}</td>
      <td class="num" data-label="Files">${page.stats.files}</td>
      <td class="num" data-label="Score">${scoreCell}</td>
      <td data-label="License">${escapeHtml(page.license)}</td>
    </tr>`;
    }).join("");
    return `<section class="lang-block" id="${languageAnchor(group.language)}">
      <h2>${escapeHtml(group.language)}</h2>
      <div class="table-wrap">
        <table class="repo-list">
          <caption>${escapeHtml(group.language)} repositories</caption>
          <thead>
            <tr>
              <th scope="col">Repository</th>
              <th scope="col">Language</th>
              <th scope="col">Modules</th>
              <th scope="col">Files</th>
              <th scope="col">Score</th>
              <th scope="col">License</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
  }).join("\n");

  const skippedHtml = skipped.length
    ? `<details><summary>Skipped this run (${skipped.length})</summary><ul>${skipped.map((item) => `<li><code>${escapeHtml(item.slug)}</code> — ${escapeHtml(item.reason)}</li>`).join("")}</ul></details>`
    : "";

  const title = "RepoLens gallery: architecture docs from real repositories";
  const description = "Deterministic RepoLens output for Express, FastAPI, Django, Gin, mdBook, and other public repositories. No API keys.";
  const body = `<main id="content" class="wrap">
  <section class="hero">
    <p class="kicker">See it on real repos</p>
    <h1>Architecture docs, already written.</h1>
    <p class="lede">RepoLens scanned ${pages.length} of ${curatedCount} public repositories and wrote the same document set it writes for your code: modules, API surface, dependency graph, and the rest. Deterministic mode. No API keys.</p>
    ${ctaBlock()}
    ${mcpListing()}
    <nav class="lang-jump" aria-label="Languages">${jumps}</nav>
  </section>
  ${sections}
</main>
<footer class="footer">
  <p>Generated ${escapeHtml(generatedOn)} by RepoLens ${escapeHtml(version)}. Test suites, vendored code, and build output are not scanned. Subset notes are on each page. Code excerpts stay under the upstream license.</p>
  ${skippedHtml}
  <p><a href="${LINKS.github}">RepoLens on GitHub</a> · <a href="${LINKS.npm}">npm</a> · <a href="${LINKS.mcprush}">MCP Rush</a> · <a href="${LINKS.vscode}">VS Code extension</a> · <a href="${escapeAttr(sitePath(basePath, "llms.txt"))}">llms.txt</a></p>
</footer>`;

  return layout({
    title,
    description,
    canonical,
    depth: 0,
    ...chrome(origin, basePath),
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "RepoLens gallery",
      url: canonical,
      description,
      publisher: {
        "@type": "SoftwareApplication",
        name: "RepoLens",
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Cross-platform",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        installUrl: LINKS.npm,
        codeRepository: LINKS.github,
      },
    },
    body,
  });
}

export function renderRepo(page, { origin, basePath, generatedOn, version }) {
  const canonical = pageUrl(origin, basePath, `${page.slug}/`);
  const title = `${page.name} architecture: modules, API surface, dependency graph`;
  const description = descriptionOf(
    page.blurb,
    `Deterministic RepoLens scan of ${page.owner}/${page.repo}.`
  );
  const source = `https://github.com/${page.owner}/${page.repo}`;
  const tree = `${source}/tree/${page.commit}`;
  const licenseHref = `${source}/blob/${page.commit}/${page.licenseFiles[0]}`;

  const docs = page.documents.map((doc) => ({
    ...doc,
    anchor: doc.key.replace(/_/g, "-"),
  }));

  const toc = docs.map((doc) => `<li><a href="#${doc.anchor}">${escapeHtml(doc.title)}</a></li>`).join("");
  const sections = docs.map((doc) => {
    const audience = AUDIENCE[doc.audience] || doc.audience || "";
    const body = renderMarkdown(stripLeadingTitle(doc.content), {
      docs,
      idPrefix: `${doc.anchor}-`,
    });
    const clipped = doc.truncated
      ? `<p class="note">This document was shortened for the gallery. <code>${escapeHtml(CTA_COMMAND)}</code> writes the full file.</p>`
      : "";
    return `<section class="doc" id="${doc.anchor}">
      <h2>${escapeHtml(doc.title)}</h2>
      <p class="doc-meta">${escapeHtml(audience)}${doc.description ? ` · ${escapeHtml(doc.description)}` : ""}</p>
      ${clipped}
      <div class="doc-body">${body}</div>
    </section>`;
  }).join("\n");

  const languages = (page.stats.languages || []).filter(Boolean);
  const frameworks = (page.stats.frameworks || []).filter(Boolean).slice(0, 8);
  const tags = [...languages, ...frameworks];
  const tagsHtml = tags.length
    ? `<p class="chips">${tags.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</p>`
    : "";
  const note = page.note ? `<p class="note">${escapeHtml(page.note)}</p>` : "";
  const capped = page.stats.capped
    ? `<p class="note">Scanned ${page.stats.files} of ${page.stats.matched} matching files, a deterministic sample, so the job stays inside CI limits.</p>`
    : "";

  const body = `<main id="content" class="wrap">
  <article>
    <p class="kicker"><a href="${escapeAttr(sitePath(basePath, ""))}">Gallery</a> · <a href="${escapeAttr(sitePath(basePath, `${page.slug}/explained/`))}">Architecture explained</a> · <a href="${escapeAttr(sitePath(basePath, `${page.slug}/score/`))}">Score</a> · ${escapeHtml(page.language)}</p>
    <h1>${escapeHtml(title)}</h1>
    <p class="lede">${escapeHtml(page.blurb)} Generated from <a href="${source}">${escapeHtml(page.owner + "/" + page.repo)}</a> at <a href="${tree}"><code>${escapeHtml(page.shortSha)}</code></a>, <a href="${escapeAttr(licenseHref)}">${escapeHtml(page.license)}</a>.</p>
    ${note}
    ${capped}
    <dl class="stats">
      <div><dt>Files</dt><dd>${page.stats.files}</dd></div>
      <div><dt>Modules</dt><dd>${page.stats.modules}</dd></div>
      <div><dt>API routes</dt><dd>${page.stats.api}</dd></div>
      <div><dt>Documents</dt><dd>${docs.length}</dd></div>
    </dl>
    ${tagsHtml}
    ${ctaBlock()}
    <div class="layout">
      <nav class="toc" aria-label="Documents">
        <h2>Documents</h2>
        <ol>${toc}</ol>
      </nav>
      <div>${sections}</div>
    </div>
  </article>
</main>
<footer class="footer">
  <p>Generated ${escapeHtml(generatedOn)} by RepoLens ${escapeHtml(version)} in deterministic mode. No API keys. Architecture notes on this page were produced from the public source of ${escapeHtml(page.owner + "/" + page.repo)} (${escapeHtml(page.license)}). Code excerpts remain under that project's license. RepoLens does not claim copyright over the upstream project.</p>
  <p><a href="${escapeAttr(sitePath(basePath, ""))}">All repositories</a> · <a href="${source}">Upstream source</a> · <a href="${LINKS.npm}">npm</a> · <a href="${LINKS.mcprush}">MCP Rush</a> · <a href="${LINKS.github}">RepoLens</a> · <a href="${LINKS.vscode}">VS Code extension</a></p>
</footer>`;

  return layout({
    title,
    description,
    canonical,
    depth: 1,
    ...chrome(origin, basePath),
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      headline: title,
      description,
      url: canonical,
      dateModified: generatedOn,
      isBasedOn: source,
      creator: { "@type": "SoftwareApplication", name: "RepoLens", url: LINKS.github },
    },
    body,
  });
}

export function renderNotFound({ origin, basePath }) {
  const canonical = pageUrl(origin, basePath, "404.html");
  const title = "Page not found · RepoLens gallery";
  const description = "That gallery page is not on this site.";
  const body = `<main id="content" class="wrap miss">
  <h1>That page is not in the gallery.</h1>
  <p class="lede">The repository list is curated. Head back to the index, or generate docs for a repository of your own.</p>
  ${ctaBlock()}
  <p><a href="${escapeAttr(sitePath(basePath, ""))}">Back to the gallery</a></p>
</main>`;
  return layout({
    title,
    description,
    canonical,
    depth: 0,
    ...chrome(origin, basePath),
    jsonLd: { "@context": "https://schema.org", "@type": "WebPage", name: title, url: canonical },
    body,
  });
}

export function pageUrl(origin, basePath, rel) {
  const base = String(basePath || "").replace(/\/$/, "");
  const suffix = rel ? `/${String(rel).replace(/^\//, "")}` : "/";
  const path = `${base}${suffix}`.replace(/\/{2,}/g, "/");
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

export function gallerySitemapEntries({ origin, basePath, pages, lastmod }) {
  const urls = [{ loc: pageUrl(origin, basePath, ""), lastmod }];
  for (const page of pages) {
    urls.push({ loc: pageUrl(origin, basePath, `${page.slug}/`), lastmod });
    urls.push({ loc: pageUrl(origin, basePath, `${page.slug}/explained/`), lastmod });
    urls.push({ loc: pageUrl(origin, basePath, `${page.slug}/score/`), lastmod });
  }
  return urls;
}

export function pageLinks(origin, basePath, slug) {
  return {
    docs: pageUrl(origin, basePath, `${slug}/`),
    explained: pageUrl(origin, basePath, `${slug}/explained/`),
    score: pageUrl(origin, basePath, `${slug}/score/`),
    badgeJson: pageUrl(origin, basePath, `${slug}/badge.json`),
    badgeSvg: pageUrl(origin, basePath, `${slug}/badge.svg`),
  };
}

function licenseUrl(license) {
  if (/^[A-Za-z0-9.+-]+$/.test(license || "")) {
    return `https://spdx.org/licenses/${license}.html`;
  }
  return undefined;
}

export function renderExplained(page, { origin, basePath, generatedOn, version }) {
  const links = pageLinks(origin, basePath, page.slug);
  const title = `${page.name} architecture explained`;
  const description = descriptionOf(
    `${page.name} architecture explained. ${page.blurb} RepoLens found ${page.stats.modules} modules across ${page.stats.files} ${page.language} files.`,
    `${page.name} architecture explained by RepoLens.`,
  );
  const source = `https://github.com/${page.owner}/${page.repo}`;
  const modules = Array.isArray(page.stats.moduleList) ? page.stats.moduleList : [];
  const moduleRows = modules.slice(0, 24).map((item) => `<tr>
      <td><code>${escapeHtml(item.key)}</code></td>
      <td class="num">${escapeHtml(item.fileCount)}</td>
    </tr>`).join("");
  const moduleTable = moduleRows
    ? `<div class="table-wrap"><table>
        <caption>Modules RepoLens grouped under the configured roots</caption>
        <thead><tr><th scope="col">Module</th><th scope="col">Files</th></tr></thead>
        <tbody>${moduleRows}</tbody>
      </table></div>`
    : `<p>This scan did not name individual modules. The full document set still lists the structure RepoLens inferred.</p>`;
  const docs = (page.documents || []).slice(0, 20);
  const docList = docs.length
    ? `<ul>${docs.map((doc) => `<li><a href="${escapeAttr(sitePath(basePath, `${page.slug}/`))}#${escapeAttr(String(doc.key || "").replace(/_/g, "-"))}">${escapeHtml(doc.title || doc.key)}</a>${doc.description ? ` — ${escapeHtml(doc.description)}` : ""}</li>`).join("")}</ul>`
    : "";
  const score = page.stats?.health?.score;
  const scoreLine = score == null
    ? `<p>Code health was not scored for this snapshot.</p>`
    : `<p>Code health for this snapshot is <a href="${escapeAttr(sitePath(basePath, `${page.slug}/score/`))}">${escapeHtml(score)} / 100</a>.</p>`;
  const note = page.note ? `<p class="note">${escapeHtml(page.note)}</p>` : "";

  const body = `<main id="content" class="wrap">
  <article>
    <p class="kicker"><a href="${escapeAttr(sitePath(basePath, ""))}">Gallery</a> · <a href="${escapeAttr(sitePath(basePath, `${page.slug}/`))}">Documents</a> · <a href="${escapeAttr(sitePath(basePath, `${page.slug}/score/`))}">Score</a> · ${escapeHtml(page.language)}</p>
    <h1>${escapeHtml(title)}</h1>
    <p class="lede">${escapeHtml(page.blurb)} This page explains the architecture RepoLens read from <a href="${source}">${escapeHtml(page.owner + "/" + page.repo)}</a> at <code>${escapeHtml(page.shortSha || "")}</code>. It is a static, deterministic scan: modules, files, and the document set. No API key is used.</p>
    ${note}
    ${scoreLine}
    <dl class="stats">
      <div><dt>Files</dt><dd>${page.stats.files}</dd></div>
      <div><dt>Modules</dt><dd>${page.stats.modules}</dd></div>
      <div><dt>API routes</dt><dd>${page.stats.api}</dd></div>
      <div><dt>Language</dt><dd>${escapeHtml(page.language)}</dd></div>
    </dl>
    <h2>How the code is grouped</h2>
    <p>${escapeHtml(page.name)} is scanned as ${escapeHtml(page.language)} under its public license (${escapeHtml(page.license)}). RepoLens groups files into modules from the repository layout, then writes the same document set it writes for a local project.</p>
    ${moduleTable}
    <h2>Documents</h2>
    <p>The full generated pages live on the <a href="${escapeAttr(sitePath(basePath, `${page.slug}/`))}">${escapeHtml(page.name)} document page</a>. Each section below is one of those documents.</p>
    ${docList}
    ${ctaBlock()}
  </article>
</main>
<footer class="footer">
  <p>Generated ${escapeHtml(generatedOn)} by RepoLens ${escapeHtml(version)}. ${escapeHtml(page.name)} architecture explained from the public source of ${escapeHtml(page.owner + "/" + page.repo)} (${escapeHtml(page.license)}). RepoLens does not claim copyright over the upstream project.</p>
  <p><a href="${escapeAttr(sitePath(basePath, ""))}">All repositories</a> · <a href="${source}">Upstream source</a> · <a href="${LINKS.github}">RepoLens</a></p>
</footer>`;

  return layout({
    title,
    description,
    canonical: links.explained,
    depth: 1,
    ...chrome(origin, basePath),
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "SoftwareSourceCode",
      name: page.name,
      description,
      url: links.explained,
      codeRepository: source,
      programmingLanguage: page.language,
      license: licenseUrl(page.license),
      dateModified: generatedOn,
      version: page.shortSha || undefined,
      author: { "@type": "Organization", name: page.owner },
      provider: {
        "@type": "SoftwareApplication",
        name: "RepoLens",
        url: REPO_URL,
        applicationCategory: "DeveloperApplication",
      },
    },
    body,
  });
}

export function renderScore(page, { origin, basePath, generatedOn, version }) {
  const links = pageLinks(origin, basePath, page.slug);
  const health = page.stats?.health || { score: null, files: 0, hotspots: [], grades: null, summary: "" };
  const title = `${page.name} code health score`;
  const scoreText = health.score == null ? "n/a" : String(health.score);
  const description = descriptionOf(
    `${page.name} code health is ${scoreText} out of 100. Embed the RepoLens shields.io badge in a README. The badge links back to this page.`,
    `${page.name} code health score from RepoLens.`,
  );
  const snippet = badgeMarkdown({
    endpointUrl: links.badgeJson,
    linkUrl: links.score,
    label: "code health",
    name: page.name,
  });
  const direct = `[![${page.name} code health](${links.badgeSvg})](${links.score})`;
  const grades = health.grades;
  const gradeTable = grades
    ? `<div class="table-wrap"><table>
        <caption>Grade distribution</caption>
        <thead><tr><th scope="col">Grade</th><th scope="col">Files</th></tr></thead>
        <tbody>${["A", "B", "C", "D", "F"].map((grade) => `<tr><td>${grade}</td><td class="num">${escapeHtml(grades[grade] || 0)}</td></tr>`).join("")}</tbody>
      </table></div>`
    : "";
  const hotspots = Array.isArray(health.hotspots) ? health.hotspots : [];
  const hotspotTable = hotspots.length
    ? `<div class="table-wrap"><table>
        <caption>Hotspots (score under 60)</caption>
        <thead><tr><th scope="col">File</th><th scope="col">Score</th><th scope="col">Grade</th></tr></thead>
        <tbody>${hotspots.map((item) => `<tr><td><code>${escapeHtml(item.file)}</code></td><td class="num">${escapeHtml(item.score)}</td><td>${escapeHtml(item.grade)}</td></tr>`).join("")}</tbody>
      </table></div>`
    : `<p>No hotspots under 60 in this snapshot.</p>`;

  const body = `<main id="content" class="wrap">
  <article>
    <p class="kicker"><a href="${escapeAttr(sitePath(basePath, ""))}">Gallery</a> · <a href="${escapeAttr(sitePath(basePath, `${page.slug}/explained/`))}">Architecture explained</a> · <a href="${escapeAttr(sitePath(basePath, `${page.slug}/`))}">Documents</a></p>
    <h1>${escapeHtml(title)}</h1>
    <p class="lede">The score is the average RepoLens code-health number for the files in this gallery scan. Higher is healthier. The badge below links back to this page.</p>
    <p class="score-value">${escapeHtml(scoreText)}<span class="score-denom">/100</span></p>
    <p>${escapeHtml(health.summary || "")}</p>
    <h2>README badge</h2>
    <p>shields.io fetches the <a href="${escapeAttr(links.badgeJson)}">endpoint JSON</a>. The image uses <code>style=flat-square</code>.</p>
    <pre class="snippet"><code>${escapeHtml(snippet)}</code></pre>
    <p>The same score is also a square SVG at <a href="${escapeAttr(links.badgeSvg)}">badge.svg</a>:</p>
    <pre class="snippet"><code>${escapeHtml(direct)}</code></pre>
    <p><img src="${escapeAttr(sitePath(basePath, `${page.slug}/badge.svg`))}" alt="${escapeAttr(page.name)} code health"></p>
    ${gradeTable}
    <h2>Hotspots</h2>
    ${hotspotTable}
    ${ctaBlock()}
    <h2>Badge for any repository</h2>
    <p>Run <code>repolens badge --format all --out repolens-badge.json</code> and publish the JSON where shields.io can fetch it (GitHub Pages or a workflow artifact you host). The GitHub Action <code>command: badge</code> writes those files without publishing npm. Point <code>badge-url</code> at the public JSON URL.</p>
  </article>
</main>
<footer class="footer">
  <p>Generated ${escapeHtml(generatedOn)} by RepoLens ${escapeHtml(version)}. Score for ${escapeHtml(page.owner + "/" + page.repo)}.</p>
  <p><a href="${escapeAttr(sitePath(basePath, ""))}">All repositories</a> · <a href="${LINKS.github}">RepoLens</a></p>
</footer>`;

  return layout({
    title,
    description,
    canonical: links.score,
    depth: 1,
    ...chrome(origin, basePath),
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: title,
      description,
      url: links.score,
      dateModified: generatedOn,
      isPartOf: links.explained,
      about: {
        "@type": "SoftwareSourceCode",
        name: page.name,
        codeRepository: `https://github.com/${page.owner}/${page.repo}`,
      },
    },
    body,
  });
}

export function badgeFilesForPage(page) {
  const endpoint = shieldsEndpoint({
    score: page.stats?.health?.score,
    label: "code health",
  });
  return {
    json: `${JSON.stringify(endpoint, null, 2)}\n`,
    svg: badgeSvg(endpoint),
  };
}

export function renderSitemap(urls) {
  const body = urls.map((url) => `  <url><loc>${escapeHtml(url.loc)}</loc><lastmod>${escapeHtml(url.lastmod)}</lastmod></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export function renderRobots(sitemapUrl, llmsUrl) {
  const llms = llmsUrl ? `\n# ${llmsUrl}\n` : "";
  return `User-agent: *\nAllow: /\n\nSitemap: ${sitemapUrl}\n${llms}`;
}

export function selfTest() {
  const docs = [{ filename: "04-module-catalog.md", anchor: "module-catalog" }];
  const html = renderMarkdown([
    "# Title",
    "",
    "Use **bold** and `a < b` here.",
    "",
    "```",
    "<script>alert(1)</script>",
    "└── core",
    "```",
    "",
    "| A | B |",
    "| --- | --- |",
    "| `x` | [mod](04-module-catalog.md) |",
    "",
    "- one",
    "- two",
    "",
    "[bad](javascript:alert(1))",
    "",
    "[ok](https://example.com/docs)",
  ].join("\n"), { docs, idPrefix: "t-" });

  const checks = [
    ["escapes fence html", html.includes("&lt;script&gt;") && !html.includes("<script>alert")],
    ["keeps unicode", html.includes("└── core")],
    ["bold", html.includes("<strong>bold</strong>")],
    ["inline code escapes", html.includes("<code>a &lt; b</code>")],
    ["table header", html.includes("<th>A</th>")],
    ["rewrites doc link", html.includes('href="#module-catalog"')],
    ["drops javascript url", !html.includes("javascript:")],
    ["keeps https link", html.includes('href="https://example.com/docs"')],
    ["list", html.includes("<li>one</li>")],
  ];

  const sample = {
    slug: "express",
    name: "Express",
    owner: "expressjs",
    repo: "express",
    language: "JavaScript",
    license: "MIT",
    licenseFiles: ["LICENSE"],
    commit: "abc123",
    shortSha: "abc123",
    blurb: "Web framework.",
    stats: {
      files: 7,
      modules: 7,
      api: 0,
      languages: ["JavaScript"],
      frameworks: ["Express"],
      moduleList: [{ key: "lib", fileCount: 7 }],
      health: {
        score: 88,
        files: 7,
        summary: "7 files analyzed",
        grades: { A: 7, B: 0, C: 0, D: 0, F: 0 },
        hotspots: [],
      },
    },
    documents: [{
      key: "system_map",
      title: "System map",
      audience: "technical",
      description: "Map",
      filename: "01-system-map.md",
      content: "# System map\n\nHello",
    }],
  };
  const opts = { origin: "https://example.com", basePath: "/repolens", generatedOn: "2026-01-01", version: "1.14.1" };
  const index = renderIndex({ ...opts, pages: [sample], skipped: [], curatedCount: 1 });
  const repo = renderRepo(sample, opts);
  const explained = renderExplained(sample, opts);
  const score = renderScore(sample, opts);
  const pagesHtml = index + repo + explained + score;
  checks.push(
    ["app bar name", index.includes('class="appbar"') && index.includes(">RepoLens</span>") && repo.includes('class="appbar"')],
    ["dense repo table", index.includes('class="repo-list"') && index.includes(">Express</a>") && !index.includes('class="card"')],
    ["flat theme color", index.includes('content="#1565C0"') && repo.includes('content="#1565C0"')],
    ["repo stats row", repo.includes('class="stats"') && repo.includes("Generate this for your repo:")],
    ["no inline radius", !/border-radius\s*:/.test(pagesHtml) && !/box-shadow\s*:/.test(pagesHtml)],
    ["explained title", explained.includes("<title>Express architecture explained</title>") && explained.includes("<h1>Express architecture explained</h1>")],
    ["explained software source", explained.includes('"@type":"SoftwareSourceCode"') || explained.includes('"@type": "SoftwareSourceCode"')],
    ["explained canonical", explained.includes('href="https://example.com/repolens/express/explained/"')],
    ["score badge snippet", score.includes("flat-square") && score.includes("express/badge.json") && score.includes(">88<") && score.includes('class="score-value"')],
    ["no card containers", !pagesHtml.includes('class="card"')],
    ["mcprush badge on the index", index.includes(MCPRUSH_BADGE) && index.includes('alt="RepoLens MCP server"') && index.includes(LINKS.mcprush) && index.includes('class="mcp-listing"') && !index.includes('class="card"')],
    ["repo page links mcprush without the card", repo.includes(LINKS.mcprush) && !repo.includes(MCPRUSH_BADGE)],
    ["index score link", index.includes(`${sample.slug}/score/`) && index.includes(">88</a>")],
  );
  const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
  if (failed.length) {
    throw new Error(`gallery renderer self-test failed: ${failed.join(", ")}\n${html}`);
  }
}
