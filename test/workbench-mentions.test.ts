import { describe, expect, it } from "vitest";
import { extractMentions, findMentionQuery, insertMention, matchMembers, splitMentions } from "@/components/workbench/mentions";

const members = [
  { id: "u1", name: "Jordan Lee" },
  { id: "u2", name: "Jordan" },
  { id: "u3", name: "Priya Ramirez" },
  { id: "u4", name: "Sam O'Neil" },
];

describe("findMentionQuery", () => {
  it("finds the query being typed at the caret", () => {
    expect(findMentionQuery("Ping @jor", 9)).toEqual({ start: 5, query: "jor" });
    expect(findMentionQuery("@", 1)).toEqual({ start: 0, query: "" });
    expect(findMentionQuery("(@pri", 5)).toEqual({ start: 1, query: "pri" });
  });

  it("uses the caret, not the end of the text", () => {
    expect(findMentionQuery("hi @jo and more", 6)).toEqual({ start: 3, query: "jo" });
  });

  it("ignores email addresses, finished mentions and whitespace", () => {
    expect(findMentionQuery("mail me at a@b.com", 18)).toBeNull();
    expect(findMentionQuery("@Jordan Lee ", 12)).toBeNull();
    expect(findMentionQuery("no mention here", 15)).toBeNull();
    expect(findMentionQuery("", 0)).toBeNull();
  });

  it("clamps an out-of-range caret", () => {
    expect(findMentionQuery("@pr", 99)).toEqual({ start: 0, query: "pr" });
  });
});

describe("insertMention", () => {
  it("replaces the typed query with the full name and a trailing space", () => {
    const r = insertMention("Ping @jor", 9, members[0]);
    expect(r.text).toBe("Ping @Jordan Lee ");
    expect(r.caret).toBe(r.text.length);
  });

  it("keeps the text after the caret and swallows the rest of a partial word", () => {
    const r = insertMention("cc @jo|rdan please".replace("|", ""), 6, members[0]);
    expect(r.text).toBe("cc @Jordan Lee please");
    expect(r.text.slice(0, r.caret)).toBe("cc @Jordan Lee ");
  });

  it("inserts at the caret when no query is active, adding a space before", () => {
    const r = insertMention("see", 3, members[2]);
    expect(r.text).toBe("see @Priya Ramirez ");
  });
});

describe("splitMentions and extractMentions", () => {
  it("prefers the longest matching name", () => {
    const parts = splitMentions("@Jordan Lee please check, then @Jordan.", members);
    const mentions = parts.filter((p) => p.type === "mention");
    expect(mentions).toEqual([
      { type: "mention", value: "@Jordan Lee", memberId: "u1" },
      { type: "mention", value: "@Jordan", memberId: "u2" },
    ]);
    expect(parts.map((p) => p.value).join("")).toBe("@Jordan Lee please check, then @Jordan.");
  });

  it("is case-insensitive and needs a word boundary", () => {
    expect(extractMentions("thanks @priya ramirez!", members)).toEqual(["u3"]);
    expect(extractMentions("@Jordanx is not anyone", members)).toEqual([]);
    expect(extractMentions("email jordan@Jordan Lee", members)).toEqual([]);
  });

  it("handles names with apostrophes and dedupes", () => {
    expect(extractMentions("@Sam O'Neil and @Sam O'Neil again, @Priya Ramirez", members)).toEqual(["u4", "u3"]);
  });

  it("returns plain text when there are no members or no @", () => {
    expect(splitMentions("hello", [])).toEqual([{ type: "text", value: "hello" }]);
    expect(splitMentions("", members)).toEqual([]);
  });
});

describe("matchMembers", () => {
  it("ranks full-name prefix, then word prefix, then substring", () => {
    expect(matchMembers(members, "jo").map((m) => m.id)).toEqual(["u2", "u1"]);
    expect(matchMembers(members, "ram").map((m) => m.id)).toEqual(["u3"]);
    expect(matchMembers(members, "ee").map((m) => m.id)).toEqual(["u1"]);
  });

  it("lists everyone for an empty query, up to the limit", () => {
    expect(matchMembers(members, "", 2)).toHaveLength(2);
    expect(matchMembers(members, "zzz")).toEqual([]);
  });
});
