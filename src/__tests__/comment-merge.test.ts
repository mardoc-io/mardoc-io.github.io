import { describe, it, expect } from "vitest";
import { mergeFreshComments } from "@/lib/comment-merge";
import { PRComment } from "@/types";

function comment(partial: Partial<PRComment>): PRComment {
  return {
    id: "default",
    author: "u",
    avatarColor: "#000",
    body: "",
    createdAt: "2026-04-10T00:00:00Z",
    resolved: false,
    replies: [],
    ...partial,
  };
}

describe("mergeFreshComments", () => {
  it("returns just the fresh list when prev has no pending", () => {
    const prev = [comment({ id: "rc-1", body: "old" })];
    const fresh = [comment({ id: "rc-1", body: "refreshed" }), comment({ id: "rc-2", body: "new" })];
    const merged = mergeFreshComments(prev, fresh);
    expect(merged).toHaveLength(2);
    expect(merged.find((c) => c.id === "rc-1")?.body).toBe("refreshed");
    expect(merged.find((c) => c.id === "rc-2")?.body).toBe("new");
  });

  it("preserves pending comments not yet in fresh", () => {
    const prev = [
      comment({ id: "rc-1" }),
      comment({ id: "c-local-1", pending: true, body: "in-flight" }),
      comment({ id: "c-local-2", pending: true, body: "also in-flight" }),
    ];
    const fresh = [comment({ id: "rc-1" })];
    const merged = mergeFreshComments(prev, fresh);

    expect(merged).toHaveLength(3);
    expect(merged.find((c) => c.id === "c-local-1")?.body).toBe("in-flight");
    expect(merged.find((c) => c.id === "c-local-2")?.body).toBe("also in-flight");
  });

  it("drops non-pending stale comments that are not in fresh", () => {
    // Simulates someone else deleting a comment on GitHub: the next fetch
    // won't include it, and the sidebar should reflect that.
    const prev = [comment({ id: "rc-1" }), comment({ id: "rc-2" })];
    const fresh = [comment({ id: "rc-1" })];
    const merged = mergeFreshComments(prev, fresh);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("rc-1");
  });

  it("fresh wins when the same id exists in both prev and fresh", () => {
    // Ensures that an optimistic local copy and its posted GitHub counterpart
    // never produce duplicate cards — even if they somehow end up with the
    // same id.
    const prev = [comment({ id: "rc-1", body: "optimistic", resolved: false })];
    const fresh = [comment({ id: "rc-1", body: "canonical", resolved: true })];
    const merged = mergeFreshComments(prev, fresh);
    expect(merged).toHaveLength(1);
    expect(merged[0].body).toBe("canonical");
    expect(merged[0].resolved).toBe(true);
  });

  it("pending comments with an id that collides with a fresh id defer to fresh", () => {
    // If a pending comment happens to match a real comment id, fresh still
    // wins — the assumption is that the pending is the stale copy.
    const prev = [comment({ id: "rc-1", pending: true, body: "stale-pending" })];
    const fresh = [comment({ id: "rc-1", body: "real" })];
    const merged = mergeFreshComments(prev, fresh);
    expect(merged).toHaveLength(1);
    expect(merged[0].body).toBe("real");
    expect(merged[0].pending).toBeUndefined();
  });

  it("returns an empty list when both inputs are empty", () => {
    expect(mergeFreshComments([], [])).toEqual([]);
  });

  it("returns only pending when fresh is empty but prev has pending", () => {
    // Covers the initial-add case: user adds a pending comment before the
    // first poll lands.
    const prev = [comment({ id: "c-1", pending: true, body: "draft" })];
    const merged = mergeFreshComments(prev, []);
    expect(merged).toHaveLength(1);
    expect(merged[0].body).toBe("draft");
  });

  it("returns only fresh when prev is empty", () => {
    const fresh = [comment({ id: "rc-1" }), comment({ id: "rc-2" })];
    expect(mergeFreshComments([], fresh)).toEqual(fresh);
  });

  it("handles a mix of fresh, pending, and stale correctly", () => {
    const prev = [
      comment({ id: "rc-old" }),          // non-pending, will be dropped (not in fresh)
      comment({ id: "rc-keeper" }),       // non-pending, stays because fresh has it
      comment({ id: "c-pending-1", pending: true, body: "p1" }),  // pending, keep
      comment({ id: "c-pending-2", pending: true, body: "p2" }),  // pending, keep
    ];
    const fresh = [
      comment({ id: "rc-keeper", body: "refreshed keeper" }),
      comment({ id: "rc-new-from-github" }), // new, add
    ];
    const merged = mergeFreshComments(prev, fresh);

    const ids = merged.map((c) => c.id).sort();
    expect(ids).toEqual([
      "c-pending-1",
      "c-pending-2",
      "rc-keeper",
      "rc-new-from-github",
    ]);
    expect(merged.find((c) => c.id === "rc-keeper")?.body).toBe("refreshed keeper");
  });
});
