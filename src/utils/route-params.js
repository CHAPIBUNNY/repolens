/**
 * Linear replacements for route and label text.
 *
 * A lazy `.*?` between two markers is polynomial: on a long string with no
 * closer, each start position scans to the end (CodeQL js/polynomial-redos).
 * These walks stop at the first closer and never re-scan, which matches the
 * old `String.prototype.replace` result.
 */

function replaceMarked(input, open, close, mapInner) {
  const value = String(input ?? "");
  let out = "";
  let cursor = 0;
  while (cursor < value.length) {
    const start = value.indexOf(open, cursor);
    if (start === -1) {
      out += value.slice(cursor);
      break;
    }
    const end = value.indexOf(close, start + open.length);
    if (end === -1) {
      out += value.slice(cursor);
      break;
    }
    out += value.slice(cursor, start);
    out += mapInner(value.slice(start + open.length, end));
    cursor = end + close.length;
  }
  return out;
}

/** `[param]` → `:param`, including the first `]` only. Global, non-overlapping. */
export function replaceBracketParams(value) {
  return replaceMarked(value, "[", "]", (inner) => `:${inner}`);
}

/** `/(group)` → `/group`. Used for Next.js route groups in diagram labels. */
export function replaceSlashGroups(value) {
  return replaceMarked(value, "/(", ")", (inner) => `/${inner}`);
}

/** A leading `app/(group)` → `app/group`. Later groups use {@link replaceSlashGroups}. */
export function replaceLeadingAppGroup(value) {
  const input = String(value ?? "");
  const prefix = "app/(";
  if (!input.startsWith(prefix)) return input;
  const end = input.indexOf(")", prefix.length);
  if (end === -1) return input;
  return `app/${input.slice(prefix.length, end)}${input.slice(end + 1)}`;
}
