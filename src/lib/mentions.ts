/**
 * @mentions in alert notes. Pure, so the browser can preview mentions while
 * typing and the server can parse them on save with the same rules.
 */

/** Longest note body, in characters. Enforced on the server; use it as maxLength on the textarea. */
export const NOTE_MAX = 4000;

export interface MentionMember {
  id: string;
  name: string;
  email: string;
}

/** Lower-cased handles that mention this member: full name without spaces, then email local part. */
export function mentionHandles(m: MentionMember): string[] {
  const out: string[] = [];
  const compact = m.name.replace(/\s+/g, "").toLowerCase();
  if (compact) out.push(compact);
  const local = m.email.split("@")[0]?.toLowerCase();
  if (local && !out.includes(local)) out.push(local);
  return out;
}

/** The handle to suggest when inserting a mention, for example "danakim" for Dana Kim. */
export function preferredHandle(m: MentionMember): string {
  return mentionHandles(m)[0] ?? m.id;
}

const TOKEN = /(^|[^A-Za-z0-9._%+-])@([A-Za-z0-9][A-Za-z0-9._+-]*)/g;

/**
 * Member ids mentioned in a note, in order of first mention, without duplicates.
 *
 * A mention is "@" followed by a member's name with spaces removed
 * (@danakim) or their email local part (@dana.kim), case-insensitive. A
 * first name alone (@dana) also works when exactly one member has it.
 * Trailing punctuation is ignored, and email addresses in the text
 * (dana@bank.com) are not mentions.
 */
export function parseMentions(body: string, members: readonly MentionMember[]): string[] {
  if (!body || !members.length) return [];
  const byHandle = new Map<string, string>();
  for (const m of members) for (const h of mentionHandles(m)) if (!byHandle.has(h)) byHandle.set(h, m.id);
  const firstNames = new Map<string, string[]>();
  for (const m of members) {
    const first = m.name.trim().split(/\s+/)[0]?.toLowerCase();
    if (first) firstNames.set(first, [...(firstNames.get(first) ?? []), m.id]);
  }

  const found: string[] = [];
  for (const match of body.matchAll(TOKEN)) {
    let token = match[2].toLowerCase();
    let id: string | undefined;
    // Try the token as written, then with trailing punctuation trimmed one character at a time.
    while (token && !id) {
      id = byHandle.get(token);
      if (!id) {
        const ids = firstNames.get(token);
        if (ids?.length === 1) id = ids[0];
      }
      if (!id) {
        const trimmed = token.replace(/[._+-]$/, "");
        if (trimmed === token) break;
        token = trimmed;
      }
    }
    if (id && !found.includes(id)) found.push(id);
  }
  return found;
}
