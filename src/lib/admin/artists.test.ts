import { describe, expect, it } from "vitest";
import { creditMessage, userLabel } from "./artists-types";
import { filterLinkableUsers, type LinkTargets } from "./artists";

describe("creditMessage", () => {
  it("pluralizes tracks and albums", () => {
    expect(creditMessage(1, 0)).toBe("This artist is credited on 1 track / 0 albums. Remove those credits first.");
    expect(creditMessage(3, 1)).toBe("This artist is credited on 3 tracks / 1 album. Remove those credits first.");
  });
});

describe("userLabel", () => {
  it("shows name (email), or just the email", () => {
    expect(userLabel({ id: "u", name: "Ada", email: "a@x.co" })).toBe("Ada (a@x.co)");
    expect(userLabel({ id: "u", name: null, email: "a@x.co" })).toBe("a@x.co");
  });
});

describe("filterLinkableUsers", () => {
  const targets: LinkTargets = {
    users: [
      { id: "u1", name: "Ada Lovelace", email: "ada@x.co" },
      { id: "u2", name: null, email: "grace@x.co" },
      { id: "u3", name: "Adam", email: "adam@x.co" },
    ],
    links: [{ id: "art-1", name: "Halcyon", userId: "u1" }],
  };

  it("matches name or email case-insensitively", () => {
    expect(filterLinkableUsers(targets, "ADA", undefined).map((u) => u.id)).toEqual(["u1", "u3"]);
    expect(filterLinkableUsers(targets, "grace@", undefined).map((u) => u.id)).toEqual(["u2"]);
  });

  it("marks users linked to another artist", () => {
    const [ada] = filterLinkableUsers(targets, "ada lov", "art-2");
    expect(ada.linkedArtist).toEqual({ id: "art-1", name: "Halcyon" });
  });

  it("does not mark the user already linked to this artist", () => {
    const [ada] = filterLinkableUsers(targets, "ada lov", "art-1");
    expect(ada.linkedArtist).toBeNull();
  });

  it("returns nothing for a blank query and caps results at 8", () => {
    expect(filterLinkableUsers(targets, "   ", undefined)).toEqual([]);
    const many: LinkTargets = {
      users: Array.from({ length: 12 }, (_, i) => ({ id: `m${i}`, name: `Match ${i}`, email: `m${i}@x.co` })),
      links: [],
    };
    expect(filterLinkableUsers(many, "match", undefined)).toHaveLength(8);
  });
});
