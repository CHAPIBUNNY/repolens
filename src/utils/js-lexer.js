// Remove JavaScript/TypeScript comments while keeping every string, template literal
// (including `${...}` expressions, which may hold their own comments and strings),
// and regular-expression literal intact. Comment text becomes spaces; newlines stay,
// so offsets and line numbers still match the source.

const REGEX_PREFIX_WORDS = new Set([
  "return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw",
  "case", "do", "else", "yield", "await",
]);

function blank(text) {
  return text.replace(/[^\n]/g, " ");
}

function isIdentPart(ch) {
  return /[A-Za-z0-9_$]/.test(ch || "");
}

export function stripJsComments(source) {
  const src = String(source ?? "");
  const n = src.length;
  let out = "";
  let i = 0;
  // Stack of contexts: { type: "code", depth, inTemplate } or { type: "template" }.
  const stack = [{ type: "code", depth: 0, inTemplate: false }];
  // Last significant code token, to tell a regex literal from division.
  let lastChar = "";
  let lastWord = "";

  while (i < n) {
    const ctx = stack[stack.length - 1];
    const ch = src[i];

    if (ctx.type === "template") {
      if (ch === "\\") {
        out += src.slice(i, i + 2);
        i += 2;
        continue;
      }
      if (ch === "`") {
        out += ch;
        i += 1;
        stack.pop();
        lastChar = "`";
        lastWord = "";
        continue;
      }
      if (ch === "$" && src[i + 1] === "{") {
        out += "${";
        i += 2;
        stack.push({ type: "code", depth: 0, inTemplate: true });
        lastChar = "{";
        lastWord = "";
        continue;
      }
      out += ch;
      i += 1;
      continue;
    }

    // code context
    const next = src[i + 1];
    if (ch === "/" && next === "/") {
      const nl = src.indexOf("\n", i);
      const end = nl === -1 ? n : nl;
      out += blank(src.slice(i, end));
      i = end;
      continue;
    }
    if (ch === "/" && next === "*") {
      const close = src.indexOf("*/", i + 2);
      const end = close === -1 ? n : close + 2;
      out += blank(src.slice(i, end));
      i = end;
      continue;
    }
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      while (j < n) {
        if (src[j] === "\\") { j += 2; continue; }
        if (src[j] === ch || src[j] === "\n") { j += 1; break; }
        j += 1;
      }
      out += src.slice(i, Math.min(j, n));
      i = Math.min(j, n);
      lastChar = ch;
      lastWord = "";
      continue;
    }
    if (ch === "`") {
      out += ch;
      i += 1;
      stack.push({ type: "template" });
      continue;
    }
    if (ch === "/") {
      const regexAllowed = lastChar === "" || "([{,;:!?&|~^=<>+-*%".includes(lastChar) || REGEX_PREFIX_WORDS.has(lastWord);
      if (regexAllowed) {
        let j = i + 1;
        let inClass = false;
        while (j < n) {
          const c = src[j];
          if (c === "\\") { j += 2; continue; }
          if (c === "\n") break;
          if (c === "[") inClass = true;
          else if (c === "]") inClass = false;
          else if (c === "/" && !inClass) { j += 1; break; }
          j += 1;
        }
        while (j < n && /[a-z]/i.test(src[j])) j += 1;
        out += src.slice(i, j);
        i = j;
        lastChar = ")";
        lastWord = "";
        continue;
      }
    }
    if (ch === "{") ctx.depth += 1;
    if (ch === "}") {
      if (ctx.inTemplate && ctx.depth === 0) {
        out += ch;
        i += 1;
        stack.pop();
        continue;
      }
      ctx.depth -= 1;
    }
    if (isIdentPart(ch)) {
      let j = i;
      while (j < n && isIdentPart(src[j])) j += 1;
      const word = src.slice(i, j);
      out += word;
      i = j;
      lastWord = word;
      lastChar = word[word.length - 1];
      continue;
    }
    out += ch;
    i += 1;
    if (!/\s/.test(ch)) {
      lastChar = ch;
      lastWord = "";
    }
  }
  return out;
}
