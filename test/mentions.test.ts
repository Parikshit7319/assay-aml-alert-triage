import { describe, expect, it } from "vitest";
import { mentionHandles, NOTE_MAX, parseMentions, preferredHandle, type MentionMember } from "@/lib/mentions";

const members: MentionMember[] = [
  { id: "u1", name: "Dana Kim", email: "dana.kim@bank.example" },
  { id: "u2", name: "Luis Ortega", email: "lortega@bank.example" },
  { id: "u3", name: "Dana Whitfield", email: "dwhitfield@bank.example" },
  { id: "u4", name: "Priya Raman", email: "priya@bank.example" },
];

describe("parseMentions", () => {
  it("matches the full name without spaces, case-insensitive", () => {
    expect(parseMentions("Can @DanaKim take this?", members)).toEqual(["u1"]);
  });

  it("matches the email local part, including dots", () => {
    expect(parseMentions("cc @dana.kim and @lortega", members)).toEqual(["u1", "u2"]);
  });

  it("ignores trailing punctuation", () => {
    expect(parseMentions("Handing to @lortega. Thanks @priyaraman!", members)).toEqual(["u2", "u4"]);
    expect(parseMentions("(@dana.kim)", members)).toEqual(["u1"]);
  });

  it("matches a unique first name but not an ambiguous one", () => {
    expect(parseMentions("@priya please look", members)).toEqual(["u4"]);
    expect(parseMentions("@dana please look", members)).toEqual([]);
  });

  it("does not treat email addresses in the text as mentions", () => {
    expect(parseMentions("Customer wrote to lortega@bank.example yesterday", members)).toEqual([]);
  });

  it("returns each member once, in order of first mention", () => {
    expect(parseMentions("@lortega @danakim @LORTEGA @dana.kim", members)).toEqual(["u2", "u1"]);
  });

  it("returns nothing for unknown handles, empty text or no members", () => {
    expect(parseMentions("@nobody here", members)).toEqual([]);
    expect(parseMentions("", members)).toEqual([]);
    expect(parseMentions("@danakim", [])).toEqual([]);
  });

  it("works at the start of a line and across lines", () => {
    expect(parseMentions("@lortega\n@priya", members)).toEqual(["u2", "u4"]);
  });
});

describe("handles", () => {
  it("lists the compact name first, then the email local part", () => {
    expect(mentionHandles(members[0])).toEqual(["danakim", "dana.kim"]);
    expect(preferredHandle(members[1])).toBe("luisortega");
  });

  it("caps notes at 4,000 characters", () => {
    expect(NOTE_MAX).toBe(4000);
  });
});
