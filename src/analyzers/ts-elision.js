// TypeScript import elision.
//
// `tsc`, esbuild, Babel, swc, and ts-node drop an import from the compiled
// JavaScript when none of its bindings is used as a value. An interface
// imported without `import type`, or a class used only in annotations
// (`constructor(private gen: MetadataGenerator)`), produces no runtime
// `require`/`import`. Counting those imports as runtime edges reports cycles
// that do not exist when the program runs.
//
// This module answers two questions without a TypeScript dependency:
//   1. Where is each identifier used: as a value, or only in type positions?
//      (`usageByName`, a small tokenizer plus a type-position scanner)
//   2. Which names does a file declare only as types (interface / type alias)?
//      (`declaredKinds`)
// and reads the tsconfig options that turn elision off (`elisionSettings`).
//
// The scanner is conservative. When a position is not clearly a type position,
// the identifier counts as a value use and the import stays a runtime edge.

import fs from "node:fs/promises";
import path from "node:path";
import { stripJsComments } from "../utils/js-lexer.js";

const KEYWORDS = new Set([
  "abstract", "as", "async", "await", "break", "case", "catch", "class", "const",
  "continue", "debugger", "declare", "default", "delete", "do", "else", "enum",
  "export", "extends", "false", "finally", "for", "from", "function", "get", "if",
  "implements", "import", "in", "instanceof", "interface", "let", "new", "null",
  "of", "override", "private", "protected", "public", "readonly", "return",
  "satisfies", "set", "static", "super", "switch", "this", "throw", "true", "try",
  "type", "typeof", "var", "void", "while", "with", "yield", "keyof", "infer",
  "is", "asserts", "unique", "accessor", "namespace", "module", "global",
  "undefined",
]);

// Reserved words can never be a binding. Contextual words (`of`, `from`, `get`,
// `readonly`, `type`, ...) can be, so a use of an import named `readonly` counts.
const RESERVED = new Set([
  "break", "case", "catch", "class", "const", "continue", "debugger", "default",
  "delete", "do", "else", "enum", "export", "extends", "false", "finally", "for",
  "function", "if", "import", "in", "instanceof", "new", "null", "return", "super",
  "switch", "this", "throw", "true", "try", "typeof", "var", "void", "while", "with",
  "implements", "interface", "let", "package", "private", "protected", "public",
  "static", "yield", "await",
]);

const REGEX_PREFIX_WORDS = new Set([
  "return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw",
  "case", "do", "else", "yield", "await",
]);

// Words that may continue a type expression after a complete type.
const TYPE_CONTINUE_WORDS = new Set(["extends", "is", "keyof", "typeof", "infer", "readonly", "unique", "asserts"]);

const PUNCT = [
  "...", "===", "!==", "**=", "<<=", "??=", "&&=", "||=",
  "=>", "==", "!=", "&&", "||", "??", "?.", "++", "--", "+=", "-=", "*=", "/=", "%=",
  "&=", "|=", "^=", "**",
];

function isIdentStart(ch) {
  return /[A-Za-z_$\u00c0-\uffff]/.test(ch || "");
}

function isIdentPart(ch) {
  return /[A-Za-z0-9_$\u00c0-\uffff]/.test(ch || "");
}

function regexAllowed(prev) {
  if (!prev) return true;
  if (prev.t === "id") return REGEX_PREFIX_WORDS.has(prev.v);
  if (prev.t === "punc") return !(prev.v === "<" || prev.v === ")" || prev.v === "]" || prev.v === "}" || prev.v === "++" || prev.v === "--");
  return false;
}

/**
 * Tokens: { t: "id" | "str" | "num" | "punc" | "regex", v, nl, i }
 * `nl` is true when a line break precedes the token. Template literals become
 * a "str" token per text chunk, with `${` and `}` punctuation around each
 * expression, so identifiers inside `${...}` are tokens too.
 */
export function tokenize(source) {
  const src = String(source ?? "");
  const n = src.length;
  const tokens = [];
  // Set when a string, template, or regex literal does not close: valid source
  // never does that, so the tokenizer misread something (for example a regex
  // after `)` read as division) and some code may be hidden inside a literal.
  tokens.malformed = false;
  // Brace stack: "{" for code braces, "${" for template expressions.
  const braces = [];
  let i = 0;
  let nl = false;

  const push = (t, v, at) => {
    tokens.push({ t, v, nl, i: at });
    nl = false;
  };

  function readTemplate(at) {
    // `at` is just after a backtick or a closing `}` of `${`.
    let j = at;
    while (j < n) {
      const ch = src[j];
      if (ch === "\\") {
        j += 2;
        continue;
      }
      if (ch === "`") {
        push("str", "`", at);
        return j + 1;
      }
      if (ch === "$" && src[j + 1] === "{") {
        push("str", "`", at);
        push("punc", "${", j);
        braces.push("${");
        return j + 2;
      }
      j += 1;
    }
    push("str", "`", at);
    tokens.malformed = true;
    return n;
  }

  while (i < n) {
    const ch = src[i];
    if (ch === "\n" || ch === "\r" || ch === "\u2028" || ch === "\u2029") {
      nl = true;
      i += 1;
      continue;
    }
    if (ch === " " || ch === "\t" || ch === "\f" || ch === "\v" || ch === "\ufeff" || ch === "\u00a0") {
      i += 1;
      continue;
    }
    if (ch === "/" && src[i + 1] === "/") {
      const end = src.indexOf("\n", i);
      i = end === -1 ? n : end;
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end + 2;
      if (src.slice(i, stop).includes("\n")) nl = true;
      i = stop;
      continue;
    }
    if (ch === "#" && i === 0 && src[1] === "!") {
      const end = src.indexOf("\n", i);
      i = end === -1 ? n : end;
      continue;
    }
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      while (j < n && src[j] !== ch && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1;
      if (src[j] !== ch) tokens.malformed = true;
      push("str", src.slice(i, Math.min(j + 1, n)), i);
      i = Math.min(j + 1, n);
      continue;
    }
    if (ch === "`") {
      i = readTemplate(i + 1);
      continue;
    }
    if (ch === "}" && braces.length > 0 && braces[braces.length - 1] === "${") {
      braces.pop();
      push("punc", "}", i);
      i = readTemplate(i + 1);
      continue;
    }
    if (isIdentStart(ch) || (ch === "#" && isIdentStart(src[i + 1]))) {
      let j = i + 1;
      while (j < n && isIdentPart(src[j])) j += 1;
      push("id", src.slice(i, j), i);
      i = j;
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(src[i + 1] || ""))) {
      let j = i + 1;
      while (j < n && /[0-9A-Za-z_.]/.test(src[j])) j += 1;
      push("num", src.slice(i, j), i);
      i = j;
      continue;
    }
    if (ch === "/" && regexAllowed(tokens[tokens.length - 1])) {
      let j = i + 1;
      let inClass = false;
      while (j < n && src[j] !== "\n") {
        if (src[j] === "\\") {
          j += 2;
          continue;
        }
        if (src[j] === "[") inClass = true;
        else if (src[j] === "]") inClass = false;
        else if (src[j] === "/" && !inClass) break;
        j += 1;
      }
      if (src[j] !== "/") tokens.malformed = true;
      j += 1;
      while (j < n && isIdentPart(src[j])) j += 1;
      push("regex", src.slice(i, j), i);
      i = j;
      continue;
    }
    // `<` and `>` are always single tokens so generic brackets nest cleanly.
    if (ch === "<" || ch === ">") {
      push("punc", ch, i);
      i += 1;
      continue;
    }
    if (ch === "{") braces.push("{");
    else if (ch === "}") braces.pop();
    let matched = null;
    for (const p of PUNCT) {
      if (src.startsWith(p, i)) {
        matched = p;
        break;
      }
    }
    if (matched === "?." && /[0-9]/.test(src[i + 2] || "")) matched = null;
    const value = matched || ch;
    push("punc", value, i);
    i += value.length;
  }
  return tokens;
}

function isPunc(tok, value) {
  return Boolean(tok) && tok.t === "punc" && tok.v === value;
}

function isWord(tok, value) {
  return Boolean(tok) && tok.t === "id" && tok.v === value;
}

function isName(tok) {
  return Boolean(tok) && tok.t === "id" && !KEYWORDS.has(tok.v);
}

// A token that can end a complete type or a complete value expression.
function endsOperand(tok) {
  if (!tok) return false;
  if (tok.t === "str" || tok.t === "num" || tok.t === "regex") return true;
  if (tok.t === "id") return !KEYWORDS.has(tok.v) || VALUE_WORDS.has(tok.v);
  return tok.v === ")" || tok.v === "]" || tok.v === "}" || tok.v === ">";
}

const VALUE_WORDS = new Set(["this", "true", "false", "null", "undefined", "super", "void"]);

const OPENERS = { "(": ")", "[": "]", "{": "}", "${": "}", "<": ">" };

/**
 * Find the `>` that closes type arguments starting at tokens[start] === "<".
 * Returns its index, or -1 when the tokens cannot be a type argument list
 * (for example `a < b && c > d`).
 */
function matchTypeArguments(tokens, start) {
  const stack = [];
  for (let j = start; j < tokens.length && j < start + 400; j += 1) {
    const tok = tokens[j];
    if (tok.t === "punc") {
      if (tok.v === "<" || tok.v === "(" || tok.v === "[" || tok.v === "{" || tok.v === "${") {
        stack.push(tok.v);
        continue;
      }
      if (tok.v === ">" || tok.v === ")" || tok.v === "]" || tok.v === "}") {
        const open = stack.pop();
        if (!open || OPENERS[open] !== tok.v) return -1;
        if (stack.length === 0) return tok.v === ">" ? j : -1;
        continue;
      }
      const inAngleOnly = stack[stack.length - 1] === "<";
      if (inAngleOnly && ["&&", "||", "??", "==", "===", "!=", "!==", "+", "*", "/", "%", "!", ";", "++", "--", "+=", "-="].includes(tok.v)) return -1;
      continue;
    }
    if (tok.t === "regex") return -1;
    if (tok.t === "id" && stack[stack.length - 1] === "<" && ["return", "if", "for", "while", "const", "let", "var", "function", "class", "new", "await", "yield", "throw", "instanceof"].includes(tok.v)) return -1;
  }
  return -1;
}

/**
 * Scan one type expression starting at tokens[start]. Marks every identifier as
 * a type position and returns the index of the first token after the type.
 * `returnType`: a function return annotation, where `=>` or `{` ends the type.
 */
function scanType(tokens, start, marks, { returnType = false } = {}) {
  const stack = [];
  let prev = null;
  let started = false;
  let conditional = 0;
  let lastParenClose = -1;
  let lastParenOpen = -1;
  let parenOpenAt = -1;
  let j = start;
  for (; j < tokens.length; j += 1) {
    const tok = tokens[j];
    if (stack.length === 0) {
      if (tok.t === "punc") {
        const v = tok.v;
        if (v === "," || v === ")" || v === "]" || v === "}" || v === ";" || v === ">") break;
        if (v === "=" || v === "==" || v === "===" || v === "!=" || v === "!==" || v === "&&" || v === "||" || v === "??" || v === "+=" || v === "-=") break;
        if ((v === "+" || v === "*" || v === "/" || v === "%" || v === "-" || v === "!") && started && endsOperand(prev)) break;
        if (v === ":") {
          if (conditional > 0) {
            conditional -= 1;
            prev = tok;
            continue;
          }
          break;
        }
        if (v === "?") {
          if (!started) break;
          conditional += 1;
          prev = tok;
          continue;
        }
        if (v === "=>") {
          // `(a: T) => R` inside a type continues the type. A return type
          // annotation ends at the arrow of the function it annotates, unless
          // the return type is itself a function type (`(): (x: T) => R`).
          if (lastParenClose === j - 1 && (!returnType || (startedWithParen(tokens, start) && looksLikeParams(tokens, lastParenOpen, lastParenClose)))) {
            prev = tok;
            started = false;
            continue;
          }
          break;
        }
        if (v === "{") {
          const operandExpected = !started || (prev && prev.t === "punc" && ["|", "&", "=>", "?", ":", "<", ","].includes(prev.v)) || (prev && prev.t === "id" && TYPE_CONTINUE_WORDS.has(prev.v));
          if (!operandExpected) break;
        }
      }
      if (tok.nl && started && endsOperand(prev)) {
        if (tok.t === "id" && !TYPE_CONTINUE_WORDS.has(tok.v)) break;
        if (tok.t === "str" || tok.t === "num") break;
        if (isPunc(tok, "@") || isPunc(tok, "[") || isPunc(tok, "(") || isPunc(tok, "*")) break;
      }
      if (tok.t === "id" && started && endsOperand(prev) && !TYPE_CONTINUE_WORDS.has(tok.v) && !(prev.t === "id" && TYPE_CONTINUE_WORDS.has(prev.v))) {
        // Two operands in a row: the type ended (`x as Foo then` cannot happen;
        // this is `foo: Bar` followed by an unrelated statement).
        if (!(prev.t === "id" && (prev.v === "asserts" || prev.v === "unique"))) break;
      }
    }
    if (tok.t === "punc") {
      if (tok.v === "(" || tok.v === "[" || tok.v === "{" || tok.v === "${" || tok.v === "<") {
        if (tok.v === "(" && stack.length === 0) parenOpenAt = j;
        stack.push(tok.v);
      } else if (tok.v === ")" || tok.v === "]" || tok.v === "}" || tok.v === ">") {
        const open = stack.pop();
        if (open === "(" && stack.length === 0) {
          lastParenClose = j;
          lastParenOpen = parenOpenAt;
        }
      }
    }
    if (tok.t === "id") marks[j] = "type";
    started = true;
    prev = tok;
  }
  return j;
}

// `(a: T, b) => R` has parameters; `(A | B)` is a parenthesized type.
function looksLikeParams(tokens, open, close) {
  if (open < 0 || close === open + 1) return true;
  let depth = 0;
  for (let k = open + 1; k < close; k += 1) {
    const tok = tokens[k];
    if (tok.t !== "punc") continue;
    if (OPENERS[tok.v]) depth += 1;
    else if (tok.v === ")" || tok.v === "]" || tok.v === "}" || tok.v === ">") depth -= 1;
    else if (depth === 0 && (tok.v === ":" || tok.v === "," || tok.v === "..." || tok.v === "?")) return true;
  }
  return false;
}

function startedWithParen(tokens, start) {
  return isPunc(tokens[start], "(") || isPunc(tokens[start], "<") || isWord(tokens[start], "new");
}

function matchingClose(tokens, openIndex) {
  const stack = [];
  for (let j = openIndex; j < tokens.length; j += 1) {
    const tok = tokens[j];
    if (tok.t !== "punc") continue;
    if (tok.v === "(" || tok.v === "[" || tok.v === "{" || tok.v === "${") stack.push(tok.v);
    else if (tok.v === ")" || tok.v === "]" || tok.v === "}") {
      stack.pop();
      if (stack.length === 0) return j;
    }
  }
  return tokens.length - 1;
}

function markRange(tokens, marks, from, to) {
  for (let j = from; j <= to && j < tokens.length; j += 1) {
    if (tokens[j].t === "id") marks[j] = "type";
  }
}

// End of an `import ...` / `export ... from` declaration (the module string), or -1.
function skipModuleDeclaration(tokens, i) {
  for (let j = i + 1; j < tokens.length && j < i + 2000; j += 1) {
    const tok = tokens[j];
    if (tok.t === "str") return j;
    if (isPunc(tok, ";")) return j;
    if (isPunc(tok, "=") ) return -1;
  }
  return -1;
}

/**
 * Classify identifier uses in TypeScript source.
 * Returns { uses: Map<name, { value, type }>, decorators: boolean, malformed: boolean }.
 * `malformed`: the tokenizer misread the file, so uses may be missing; callers
 * must not treat an unseen or type-only name as removable.
 * Import and re-export declarations are not uses. Property names after `.`
 * are not uses of a binding with that name.
 */
export function usageByName(source, { jsx = false, jsxFactories = ["React"] } = {}) {
  const tokens = tokenize(source);
  const marks = new Array(tokens.length).fill(null);
  const frames = [{ kind: "block", ternary: 0, decl: false, inCase: false }];
  let pendingClass = null; // { depth, implementsDone }
  let decorators = false;

  const frame = () => frames[frames.length - 1];

  for (let i = 0; i < tokens.length; i += 1) {
    const tok = tokens[i];
    const prev = tokens[i - 1];
    const next = tokens[i + 1];
    if (marks[i]) continue;

    if (tok.t === "id") {
      const afterDot = isPunc(prev, ".") || isPunc(prev, "?.");
      if (afterDot) {
        marks[i] = "prop";
        continue;
      }
      const v = tok.v;
      if (v === "import" && !isPunc(next, "(") && !isPunc(next, ".")) {
        // `import x = require("y")` and `import x = A.B` are value uses of the RHS.
        const end = skipModuleDeclaration(tokens, i);
        if (end !== -1) {
          markRange(tokens, marks, i, end);
          for (let j = i; j <= end; j += 1) if (tokens[j].t === "id") marks[j] = "decl";
          i = end;
          continue;
        }
        continue;
      }
      if (v === "export") {
        // `export { a } from "x"`, `export * from "x"`: not local uses.
        // `export type { A }`: type uses. `export { a }`: value uses (kept).
        let j = i + 1;
        if (isWord(tokens[j], "type") && isPunc(tokens[j + 1], "{")) {
          const close = matchingClose(tokens, j + 1);
          markRange(tokens, marks, j, close);
          i = close;
          continue;
        }
        if (isPunc(tokens[j], "*") || isPunc(tokens[j], "{")) {
          const close = isPunc(tokens[j], "{") ? matchingClose(tokens, j) : j;
          let k = close + 1;
          if (isWord(tokens[k], "as")) k += 2;
          if (isWord(tokens[k], "from")) {
            for (let m = i; m <= k + 1; m += 1) if (tokens[m]?.t === "id") marks[m] = "decl";
            i = k + 1;
            continue;
          }
        }
        continue;
      }
      if (v === "interface" && isName(next) && !afterDot) {
        let j = i + 1;
        while (j < tokens.length && !isPunc(tokens[j], "{")) j += 1;
        const close = matchingClose(tokens, j);
        markRange(tokens, marks, i, close);
        i = close;
        continue;
      }
      if (v === "type" && isName(next) && (isPunc(tokens[i + 2], "=") || isPunc(tokens[i + 2], "<"))) {
        let j = i + 2;
        if (isPunc(tokens[j], "<")) {
          const close = matchTypeArguments(tokens, j);
          if (close === -1) continue;
          markRange(tokens, marks, j, close);
          j = close + 1;
        }
        if (!isPunc(tokens[j], "=")) continue;
        marks[i + 1] = "type";
        const end = scanType(tokens, j + 1, marks);
        i = end - 1;
        if (isPunc(tokens[end], ";")) i = end;
        continue;
      }
      if (v === "declare" && next && next.t === "id" && !isPunc(tokens[i + 2], "=") && !isPunc(tokens[i + 2], "(") && !isPunc(next, ".")) {
        // Ambient declarations emit nothing.
        const blockForm = ["module", "namespace", "global", "class", "enum", "interface", "abstract"].includes(next.v);
        let j = i + 1;
        if (blockForm) {
          while (j < tokens.length && !isPunc(tokens[j], "{") && !isPunc(tokens[j], ";")) j += 1;
          const close = isPunc(tokens[j], "{") ? matchingClose(tokens, j) : j;
          markRange(tokens, marks, i, close);
          i = close;
          continue;
        }
        const stack = [];
        for (; j < tokens.length; j += 1) {
          const t = tokens[j];
          if (stack.length === 0 && (isPunc(t, ";") || isPunc(t, "}") || (t.nl && j > i + 2 && endsOperand(tokens[j - 1]) && t.t === "id"))) break;
          if (t.t === "punc" && OPENERS[t.v] && t.v !== "<") stack.push(t.v);
          else if (t.t === "punc" && (t.v === ")" || t.v === "]" || t.v === "}")) stack.pop();
        }
        markRange(tokens, marks, i, j - 1);
        i = isPunc(tokens[j], ";") ? j : j - 1;
        continue;
      }
      if (v === "class" && !afterDot) {
        pendingClass = { depth: frames.length };
        continue;
      }
      if (v === "implements" && pendingClass) {
        let j = i + 1;
        for (;;) {
          j = scanType(tokens, j, marks);
          if (isPunc(tokens[j], ",")) {
            j += 1;
            continue;
          }
          break;
        }
        i = j - 1;
        continue;
      }
      if ((v === "const" || v === "let" || v === "var") && !afterDot) {
        frame().decl = true;
        continue;
      }
      if (v === "case" && !afterDot) {
        frame().inCase = true;
        continue;
      }
      if ((v === "as" || v === "satisfies") && endsOperand(prev) && !(prev.t === "id" && prev.v === "void")) {
        const end = scanType(tokens, i + 1, marks);
        i = end - 1;
        continue;
      }
      if (v === "of" || v === "in") frame().decl = false;
      if (RESERVED.has(v)) continue;
      marks[i] = "value";
      continue;
    }

    if (tok.t !== "punc") continue;
    const v = tok.v;

    if (v === "@" && next && next.t === "id") decorators = true;

    if (v === "<") {
      // `foo<T>(`, `new Map<K, V>()`, `extends Base<T>`. In .tsx a `>` before `<`
      // is the end of a JSX tag, and a name can be JSX text, so only a call,
      // tagged template, `new`, or class heritage counts there.
      const typeArgsByPosition = prev && (isName(prev) || (!jsx && isPunc(prev, ">")) || isWord(prev, "this") || isWord(prev, "super"));
      if (typeArgsByPosition) {
        const close = matchTypeArguments(tokens, i);
        if (close !== -1) {
          const after = tokens[close + 1];
          const prevPrev = tokens[i - 2];
          const inHeritage = pendingClass && frames.length === pendingClass.depth;
          const strong = isPunc(after, "(") || (after && after.t === "str" && after.v.startsWith("`")) || inHeritage || isWord(prevPrev, "new") || isWord(prevPrev, "function") || isWord(tokens[i - 3], "function");
          const weak = (after && after.t === "punc" && [")", ",", ";", "]", "}", "."].includes(after.v)) || !after;
          if (strong || (!jsx && weak)) {
            markRange(tokens, marks, i, close);
            i = close;
            continue;
          }
        }
        continue;
      }
      // `<T>(x: T) => x` and `<Foo>bar` (old-style assertion) in .ts.
      // In .tsx a `<` here opens a JSX element, except `<T,>(` / `<T extends X>(`.
      const close = matchTypeArguments(tokens, i);
      if (close !== -1) {
        if (!jsx) {
          markRange(tokens, marks, i, close);
          i = close;
          continue;
        }
        const inner = tokens.slice(i + 1, close);
        const generic = isPunc(tokens[close + 1], "(") && (inner.some((t) => isPunc(t, ",")) || inner.some((t) => isWord(t, "extends")));
        if (generic) {
          markRange(tokens, marks, i, close);
          i = close;
          continue;
        }
      }
      continue;
    }

    if (v === "?") {
      if (isPunc(next, ":") || isPunc(next, ")") || isPunc(next, ",") || (isPunc(next, "=") && !isPunc(tokens[i + 2], "="))) continue;
      frame().ternary += 1;
      continue;
    }

    if (v === ":") {
      const f = frame();
      if (f.ternary > 0) {
        f.ternary -= 1;
        continue;
      }
      if (f.inCase) {
        f.inCase = false;
        continue;
      }
      if (isPunc(prev, ")")) {
        const end = scanType(tokens, i + 1, marks, { returnType: true });
        i = end - 1;
        continue;
      }
      const annotatable = isName(prev) || isPunc(prev, "?") || isPunc(prev, "!") || isPunc(prev, "]") || isPunc(prev, "}") || (prev && prev.t === "id");
      if (annotatable && (f.kind === "paren" || f.kind === "bracket" || f.kind === "class" || f.decl)) {
        const end = scanType(tokens, i + 1, marks);
        i = end - 1;
        continue;
      }
      // Object literal key: `{ Foo: 1 }` names a property, not the binding.
      if (prev && prev.t === "id" && marks[i - 1] === "value" && (isPunc(tokens[i - 2], "{") || isPunc(tokens[i - 2], ","))) marks[i - 1] = "prop";
      continue;
    }

    if (v === "=") {
      frame().decl = false;
      continue;
    }
    if (v === ";") {
      frame().decl = false;
      frame().inCase = false;
      continue;
    }

    if (v === "(" || v === "[" || v === "{" || v === "${") {
      let kind = v === "(" ? "paren" : v === "[" ? "bracket" : "brace";
      if (v === "{" && pendingClass && frames.length === pendingClass.depth) {
        kind = "class";
        pendingClass = null;
      }
      frames.push({ kind, ternary: 0, decl: false, inCase: false });
      continue;
    }
    if (v === ")" || v === "]" || v === "}") {
      if (frames.length > 1) frames.pop();
      continue;
    }
  }

  const uses = new Map();
  for (let i = 0; i < tokens.length; i += 1) {
    const tok = tokens[i];
    if (tok.t !== "id") continue;
    const mark = marks[i];
    if (mark !== "value" && mark !== "type") continue;
    let entry = uses.get(tok.v);
    if (!entry) {
      entry = { value: 0, type: 0 };
      uses.set(tok.v, entry);
    }
    entry[mark] += 1;
  }

  // JSX text can hide code from the tokenizer (an apostrophe in text reads as
  // a quote). In .tsx/.jsx, any whole-word occurrence the tokenizer did not see
  // counts as a value use.
  if (jsx) {
    const seen = new Map();
    for (const tok of tokens) if (tok.t === "id") seen.set(tok.v, (seen.get(tok.v) || 0) + 1);
    const text = stripJsComments(source);
    const counts = new Map();
    const re = /[A-Za-z_$][\w$]*/g;
    let match;
    while ((match = re.exec(text)) !== null) counts.set(match[0], (counts.get(match[0]) || 0) + 1);
    for (const [name, count] of counts) {
      const hidden = count - (seen.get(name) || 0);
      if (hidden <= 0 || RESERVED.has(name)) continue;
      const entry = uses.get(name) || { value: 0, type: 0 };
      entry.value += hidden;
      uses.set(name, entry);
    }
  }

  // Classic JSX compiles `<div />` to `React.createElement(...)` (or the
  // configured factory), so the factory import is a value use.
  if (jsx && tokens.some((tok, k) => isPunc(tok, "<") && (tokens[k + 1]?.t === "id" || isPunc(tokens[k + 1], ">")))) {
    for (const name of jsxFactories) {
      const entry = uses.get(name) || { value: 0, type: 0 };
      entry.value += 1;
      uses.set(name, entry);
    }
  }

  return { uses, decorators, malformed: Boolean(tokens.malformed) };
}

/**
 * Names a TypeScript file declares only as types (interface or type alias),
 * and names it declares as values. A name in both (declaration merging) is a value.
 * Only top-level interface / type alias declarations count as types: a nested
 * one (`namespace N { interface Foo }`, inside a function or `declare module`)
 * is not what an importer of `Foo` gets. Names re-exported from another module
 * (`export { Foo } from "./impl"`, `export * as Foo from`) and import-equals
 * aliases (`import Foo = require()`) are values: their kind is unknown here.
 */
export function declaredKinds(source) {
  const tokens = tokenize(source);
  const types = new Set();
  const values = new Set();
  let depth = 0;
  for (let i = 0; i < tokens.length; i += 1) {
    const tok = tokens[i];
    if (tok.t === "punc") {
      if (tok.v === "{" || tok.v === "${") depth += 1;
      else if (tok.v === "}") depth = Math.max(0, depth - 1);
      continue;
    }
    if (tok.t !== "id") continue;
    const prev = tokens[i - 1];
    if (isPunc(prev, ".") || isPunc(prev, "?.")) continue;
    const next = tokens[i + 1];
    if (tok.v === "interface" && isName(next)) {
      if (depth === 0) types.add(next.v);
    } else if (tok.v === "type" && isName(next) && (isPunc(tokens[i + 2], "=") || isPunc(tokens[i + 2], "<"))) {
      if (depth === 0) types.add(next.v);
    } else if (["const", "let", "var", "class", "enum", "namespace", "module"].includes(tok.v) && isName(next)) values.add(next.v);
    else if (tok.v === "function" && (isName(next) || (isPunc(next, "*") && isName(tokens[i + 2])))) values.add(isName(next) ? next.v : tokens[i + 2].v);
    else if (tok.v === "as" && isName(next) && (isPunc(tokens[i + 2], ",") || isPunc(tokens[i + 2], "}") || isWord(tokens[i + 2], "from"))) values.add(next.v);
    else if ((tok.v === "const" || tok.v === "let" || tok.v === "var") && (isPunc(next, "{") || isPunc(next, "["))) {
      const close = matchingClose(tokens, i + 1);
      for (let j = i + 2; j < close; j += 1) if (isName(tokens[j])) values.add(tokens[j].v);
    } else if (tok.v === "export" && isPunc(next, "{")) {
      // `export { a, b as c } from "x"`: re-exported names, kind unknown.
      const close = matchingClose(tokens, i + 1);
      if (isWord(tokens[close + 1], "from")) {
        for (let j = i + 2; j < close; j += 1) {
          if (isName(tokens[j]) && !isWord(tokens[j + 1], "as")) values.add(tokens[j].v);
        }
      }
    } else if (tok.v === "import" && isName(next) && isPunc(tokens[i + 2], "=")) {
      values.add(next.v);
    } else if (tok.v === "import" && isWord(next, "type") && isName(tokens[i + 2]) && isPunc(tokens[i + 3], "=")) {
      values.add(tokens[i + 2].v);
    } else if (tok.v === "import") {
      // Imported names re-exported from here: kind unknown, treat as value.
      const end = skipModuleDeclaration(tokens, i);
      if (end !== -1) {
        for (let j = i + 1; j < end; j += 1) {
          if (isName(tokens[j])) values.add(tokens[j].v);
          else if (isPunc(tokens[j], "{")) depth += 1;
          else if (isPunc(tokens[j], "}")) depth = Math.max(0, depth - 1);
        }
        i = end;
      }
    }
  }
  for (const name of values) types.delete(name);
  return { types, values };
}

// ---- tsconfig -----------------------------------------------------------

function parseJsonc(text) {
  let out = "";
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (ch === '"') {
      let j = i + 1;
      while (j < n && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === "/" && text[i + 1] === "/") {
      while (i < n && text[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  out = out.replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(out);
}

async function readJsonc(repoRoot, rel) {
  try {
    return parseJsonc(await fs.readFile(path.join(repoRoot, rel), "utf8"));
  } catch {
    return undefined;
  }
}

// Candidate repo-relative paths for a package `extends` ("@tsconfig/node18",
// "@tsconfig/node18/tsconfig.json", "pkg/base"), looked up in every
// node_modules from the config's folder up to the repository root.
async function resolvePackageExtends(repoRoot, configRel, parent) {
  const dirs = [];
  let dir = path.posix.dirname(configRel);
  for (;;) {
    dirs.push(dir === "." ? "node_modules" : `${dir}/node_modules`);
    if (dir === "." || dir === "" || dir === "/") break;
    dir = path.posix.dirname(dir);
  }
  for (const modules of dirs) {
    const base = path.posix.join(modules, parent);
    const candidates = [base, `${base}.json`, `${base}/tsconfig.json`];
    const pkg = await readJsonc(repoRoot, `${base}/package.json`);
    if (pkg && typeof pkg.tsconfig === "string") candidates.unshift(path.posix.join(base, pkg.tsconfig));
    for (const candidate of candidates) {
      if (!candidate.endsWith(".json")) continue;
      if ((await readJsonc(repoRoot, candidate)) !== undefined) return candidate;
    }
  }
  return null;
}

/**
 * Compiler options of a tsconfig with its `extends` chain. `unresolved` is true
 * when a parent config is not in the checkout (a package that is not installed,
 * or a generated file such as `.nuxt/tsconfig.json`): its options are unknown
 * and may keep imports (`verbatimModuleSyntax`).
 */
async function readCompilerOptions(repoRoot, configRel, depth = 0, seen = new Set()) {
  if (depth > 6 || seen.has(configRel)) return { options: {}, unresolved: false };
  seen.add(configRel);
  const parsed = await readJsonc(repoRoot, configRel);
  if (parsed === undefined) return { options: {}, unresolved: true };
  let options = {};
  let unresolved = false;
  const parents = Array.isArray(parsed?.extends) ? parsed.extends : parsed?.extends ? [parsed.extends] : [];
  for (const parent of parents) {
    if (typeof parent !== "string") continue;
    let rel = null;
    if (parent.startsWith(".") || parent.startsWith("/")) {
      rel = path.posix.normalize(path.posix.join(path.posix.dirname(configRel), parent));
      if (!rel.endsWith(".json")) rel += ".json";
      if (rel.startsWith("..") || path.posix.isAbsolute(rel)) rel = null;
    } else {
      rel = await resolvePackageExtends(repoRoot, configRel, parent);
    }
    if (!rel) {
      unresolved = true;
      continue;
    }
    const inherited = await readCompilerOptions(repoRoot, rel, depth + 1, seen);
    if (inherited.unresolved) unresolved = true;
    options = { ...options, ...inherited.options };
  }
  return { options: { ...options, ...(parsed?.compilerOptions || {}) }, unresolved };
}

/**
 * Per-file elision settings from the nearest tsconfig.json (with its `extends`
 * chain). `elide: false` when the compiler keeps import statements
 * (`verbatimModuleSyntax`, `preserveValueImports`, `importsNotUsedAsValues`
 * set to "preserve"/"error", or `erasableSyntaxOnly`, the setting for Node's
 * type stripping, which removes only `import type`). `inferUsage: false` when
 * part of the `extends` chain is not in the checkout: then only names declared
 * as interface / type alias are treated as type-only (code that compiles under
 * `verbatimModuleSyntax` cannot import those without `type`), and a class used
 * only as a type stays a runtime edge. `decoratorMetadata` when
 * `emitDecoratorMetadata` is on: annotations on decorated members are then
 * runtime references.
 */
export function createElisionSettings(repoRoot) {
  const byDir = new Map();
  async function forDir(dir) {
    if (byDir.has(dir)) return byDir.get(dir);
    const promise = (async () => {
      const configRel = dir === "." || dir === "" ? "tsconfig.json" : `${dir}/tsconfig.json`;
      let exists = false;
      try {
        await fs.access(path.join(repoRoot, configRel));
        exists = true;
      } catch {
        exists = false;
      }
      if (exists) {
        const { options, unresolved } = await readCompilerOptions(repoRoot, configRel);
        const preserve = options.verbatimModuleSyntax === true
          || options.preserveValueImports === true
          || options.erasableSyntaxOnly === true
          || ["preserve", "error"].includes(String(options.importsNotUsedAsValues || "").toLowerCase());
        return {
          elide: !preserve,
          inferUsage: !preserve && !unresolved,
          decoratorMetadata: options.emitDecoratorMetadata === true,
          config: configRel,
          unresolved,
        };
      }
      if (dir === "." || dir === "") return { elide: true, inferUsage: true, decoratorMetadata: false, config: null, unresolved: false };
      return forDir(path.posix.dirname(dir));
    })();
    byDir.set(dir, promise);
    return promise;
  }
  return (file) => forDir(path.posix.dirname(String(file).replace(/\\/g, "/")));
}

export function isTypeScriptFile(file) {
  return /\.(ts|tsx|mts|cts)$/.test(String(file)) && !/\.d\.[cm]?ts$/.test(String(file));
}
