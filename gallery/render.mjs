// HTML for the gallery. No dependencies. Markdown in is treated as text.

const CTA_COMMAND = "npx @chappibunny/repolens demo";

export const LINKS = {
  npm: "https://www.npmjs.com/package/@chappibunny/repolens",
  github: "https://github.com/CHAPIBUNNY/repolens",
  vscode: "https://marketplace.visualstudio.com/items?itemName=repolensdox.repolensdox",
};

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
    const rows = group.pages.map((page) => `<tr>
      <td data-label="Repository"><a class="repo-name" href="${escapeAttr(sitePath(basePath, `${page.slug}/`))}">${escapeHtml(page.name)}</a><span class="blurb">${escapeHtml(page.blurb)}</span></td>
      <td data-label="Language">${escapeHtml(page.language)}</td>
      <td class="num" data-label="Modules">${page.stats.modules}</td>
      <td class="num" data-label="Files">${page.stats.files}</td>
      <td data-label="License">${escapeHtml(page.license)}</td>
    </tr>`).join("");
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
    <nav class="lang-jump" aria-label="Languages">${jumps}</nav>
  </section>
  ${sections}
</main>
<footer class="footer">
  <p>Generated ${escapeHtml(generatedOn)} by RepoLens ${escapeHtml(version)}. Test suites, vendored code, and build output are not scanned. Subset notes are on each page. Code excerpts stay under the upstream license.</p>
  ${skippedHtml}
  <p><a href="${LINKS.github}">RepoLens on GitHub</a> · <a href="${LINKS.npm}">npm</a> · <a href="${LINKS.vscode}">VS Code extension</a></p>
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
    <p class="kicker"><a href="${escapeAttr(sitePath(basePath, ""))}">Gallery</a> · ${escapeHtml(page.language)}</p>
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
  <p><a href="${escapeAttr(sitePath(basePath, ""))}">All repositories</a> · <a href="${source}">Upstream source</a> · <a href="${LINKS.npm}">npm</a> · <a href="${LINKS.github}">RepoLens</a> · <a href="${LINKS.vscode}">VS Code extension</a></p>
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

export function renderSitemap(urls) {
  const body = urls.map((url) => `  <url><loc>${escapeHtml(url.loc)}</loc><lastmod>${escapeHtml(url.lastmod)}</lastmod></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export function renderRobots(sitemapUrl) {
  return `User-agent: *\nAllow: /\n\nSitemap: ${sitemapUrl}\n`;
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
    stats: { files: 7, modules: 7, api: 0, languages: ["JavaScript"], frameworks: ["Express"] },
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
  checks.push(
    ["app bar name", index.includes('class="appbar"') && index.includes(">RepoLens</span>") && repo.includes('class="appbar"')],
    ["dense repo table", index.includes('class="repo-list"') && index.includes(">Express</a>") && !index.includes('class="card"')],
    ["flat theme color", index.includes('content="#1565C0"') && repo.includes('content="#1565C0"')],
    ["repo stats row", repo.includes('class="stats"') && repo.includes("Generate this for your repo:")],
    ["no inline radius", !/border-radius\s*:/.test(index + repo) && !/box-shadow\s*:/.test(index + repo)],
  );
  const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
  if (failed.length) {
    throw new Error(`gallery renderer self-test failed: ${failed.join(", ")}\n${html}`);
  }
}
