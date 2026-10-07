/**
 * Pure helpers for @mentions in alert notes. A mention is written into the
 * note as "@" followed by the member's full name ("@Jordan Lee"), so names
 * with spaces work and the stored text reads naturally in the audit log.
 */

export interface MentionMember {
  id: string;
  name: string;
}

export interface MentionQuery {
  /** Index of the "@" in the text. */
  start: number;
  /** What the user typed after "@", up to the caret. May be empty. */
  query: string;
}

/** Characters allowed inside a mention query while typing. Whitespace ends the query. */
const QUERY_CHAR = /[\p{L}\p{N}._'-]/u;
/** A mention may start at the beginning of the text or after one of these. */
const BEFORE_AT = /[\s([{"'“‘,;]/u;
const MAX_QUERY = 40;

/**
 * Returns the mention being typed at `caret`, or null. "Ping @jor|" gives
 * { start: 5, query: "jor" }. An "@" inside a word (an email address) or a
 * query containing whitespace is not a mention.
 */
export function findMentionQuery(text: string, caret: number): MentionQuery | null {
  const end = Math.max(0, Math.min(caret, text.length));
  for (let i = end - 1; i >= 0 && end - i <= MAX_QUERY + 1; i--) {
    const ch = text[i];
    if (ch === "@") {
      if (i > 0 && !BEFORE_AT.test(text[i - 1])) return null;
      return { start: i, query: text.slice(i + 1, end) };
    }
    if (!QUERY_CHAR.test(ch)) return null;
  }
  return null;
}

/**
 * Replaces the mention query at `caret` with "@Full Name " and returns the
 * new text and caret. If no query is active, inserts the mention at the caret.
 */
export function insertMention(text: string, caret: number, member: MentionMember): { text: string; caret: number } {
  const at = Math.max(0, Math.min(caret, text.length));
  const q = findMentionQuery(text, at);
  const start = q ? q.start : at;
  const before = text.slice(0, start);
  let after = text.slice(at);
  // Swallow the rest of a partially typed word after the caret ("@jo|rdan").
  if (q) after = after.replace(/^[\p{L}\p{N}._'-]+/u, "");
  const needsSpaceBefore = !q && before.length > 0 && !/\s$/.test(before);
  const token = `${needsSpaceBefore ? " " : ""}@${member.name}`;
  const spacer = after.startsWith(" ") ? "" : " ";
  const next = before + token + spacer + after;
  return { text: next, caret: before.length + token.length + 1 };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Members sorted longest name first, so "@Jordan Lee" wins over "@Jordan". */
function byLongestName<T extends MentionMember>(members: readonly T[]): T[] {
  return [...members].filter((m) => m.name.trim()).sort((a, b) => b.name.length - a.name.length || a.id.localeCompare(b.id));
}

export type MentionPart = { type: "text"; value: string } | { type: "mention"; value: string; memberId: string };

/**
 * Splits note text into plain text and mention parts for rendering. A mention
 * must start at the beginning or after whitespace or punctuation, and end at
 * a word boundary. Matching is case-insensitive.
 */
export function splitMentions(text: string, members: readonly MentionMember[]): MentionPart[] {
  const sorted = byLongestName(members);
  if (!sorted.length || !text.includes("@")) return text ? [{ type: "text", value: text }] : [];
  const re = new RegExp(`(^|[^\\p{L}\\p{N}_@])@(${sorted.map((m) => escapeRe(m.name.trim())).join("|")})(?![\\p{L}\\p{N}_])`, "giu");
  const out: MentionPart[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const at = (m.index ?? 0) + m[1].length;
    const name = m[2];
    const member = sorted.find((x) => x.name.trim().toLowerCase() === name.toLowerCase());
    if (!member) continue;
    if (at > last) out.push({ type: "text", value: text.slice(last, at) });
    out.push({ type: "mention", value: `@${name}`, memberId: member.id });
    last = at + 1 + name.length;
  }
  if (last < text.length) out.push({ type: "text", value: text.slice(last) });
  return out;
}

/** Ids of members mentioned in `text`, in order of first mention, without duplicates. */
export function extractMentions(text: string, members: readonly MentionMember[]): string[] {
  const ids: string[] = [];
  for (const p of splitMentions(text, members)) if (p.type === "mention" && !ids.includes(p.memberId)) ids.push(p.memberId);
  return ids;
}

/**
 * Members matching a typed query, best first: full-name prefix, then a word
 * prefix (last name), then anywhere in the name. An empty query lists everyone.
 */
export function matchMembers<T extends MentionMember>(members: readonly T[], query: string, limit = 6): T[] {
  const q = query.trim().toLowerCase();
  const scored: { m: T; score: number }[] = [];
  for (const m of members) {
    const name = m.name.toLowerCase();
    let score: number;
    if (!q) score = 3;
    else if (name.startsWith(q)) score = 0;
    else if (name.split(/\s+/).some((w) => w.startsWith(q))) score = 1;
    else if (name.includes(q)) score = 2;
    else continue;
    scored.push({ m, score });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.m.name.localeCompare(b.m.name))
    .slice(0, limit)
    .map((s) => s.m);
}
