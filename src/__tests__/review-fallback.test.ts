import { describe, it, expect, vi } from "vitest";
import {
  isLineResolutionError,
  runInlineFallback,
  type ReviewFallbackDeps,
} from "@/lib/review-fallback";
import type { PendingInlineComment } from "@/lib/github-api";

describe("isLineResolutionError", () => {
  it("matches 422 with 'could not be resolved' in the message", () => {
    const err = { status: 422, message: "Line could not be resolved" };
    expect(isLineResolutionError(err)).toBe(true);
  });

  it("matches 422 with 'pull_request_review_thread.line' in the message", () => {
    const err = {
      status: 422,
      message: "validation failed: pull_request_review_thread.line is invalid",
    };
    expect(isLineResolutionError(err)).toBe(true);
  });

  it("matches when status is nested under response.status (axios-style)", () => {
    const err = {
      response: { status: 422 },
      message: "Line could not be resolved",
    };
    expect(isLineResolutionError(err)).toBe(true);
  });

  it("is case-insensitive on the message", () => {
    expect(isLineResolutionError({ status: 422, message: "LINE COULD NOT BE RESOLVED" })).toBe(true);
  });

  // ─── False positives we must NOT match ────────────────────────────────

  it("does NOT match 422 'can not approve your own pull request'", () => {
    // Real error from GitHub when the authenticated user authored the PR.
    // This one must rethrow — falling into the fallback would repost comments.
    const err = {
      status: 422,
      message: "Review Can not approve your own pull request",
    };
    expect(isLineResolutionError(err)).toBe(false);
  });

  it("does NOT match 401 / 403 / 404 / 500", () => {
    for (const status of [401, 403, 404, 500, 502]) {
      expect(
        isLineResolutionError({ status, message: "Line could not be resolved" })
      ).toBe(false);
    }
  });

  it("does NOT match non-object errors", () => {
    expect(isLineResolutionError(null)).toBe(false);
    expect(isLineResolutionError(undefined)).toBe(false);
    expect(isLineResolutionError("Line could not be resolved")).toBe(false);
    expect(isLineResolutionError(42)).toBe(false);
  });

  it("does NOT match 422 with an unrelated message", () => {
    expect(
      isLineResolutionError({ status: 422, message: "Body is too long" })
    ).toBe(false);
  });
});

// ─── runInlineFallback ────────────────────────────────────────────────────

function makeComment(overrides: Partial<PendingInlineComment> = {}): PendingInlineComment {
  return {
    path: "docs/a.md",
    body: "looks good",
    line: 10,
    side: "RIGHT",
    ...overrides,
  };
}

function makeDeps(
  inlineBehavior: "success" | "fail" | ((c: PendingInlineComment) => Promise<void>),
  issueBehavior: "success" | "fail" = "success"
): ReviewFallbackDeps & {
  inlineCalls: PendingInlineComment[];
  issueCalls: string[];
} {
  const inlineCalls: PendingInlineComment[] = [];
  const issueCalls: string[] = [];
  return {
    inlineCalls,
    issueCalls,
    postInlineComment: async (c) => {
      inlineCalls.push(c);
      if (inlineBehavior === "fail") throw new Error("line out of hunk");
      if (typeof inlineBehavior === "function") return inlineBehavior(c);
    },
    postIssueComment: async (body) => {
      issueCalls.push(body);
      if (issueBehavior === "fail") throw new Error("cannot post issue");
    },
  };
}

describe("runInlineFallback", () => {
  it("posts each comment as an inline comment on the happy path (0 unresolved)", async () => {
    const comments = [
      makeComment({ body: "a" }),
      makeComment({ body: "b" }),
      makeComment({ body: "c" }),
    ];
    const deps = makeDeps("success");
    const result = await runInlineFallback(comments, deps);

    expect(result.unresolvedCount).toBe(0);
    expect(deps.inlineCalls).toHaveLength(3);
    expect(deps.issueCalls).toHaveLength(0);
  });

  it("falls back to issue-comment when inline post fails for that comment", async () => {
    const comments = [makeComment({ body: "oops", path: "docs/a.md", line: 42 })];
    const deps = makeDeps("fail");
    const result = await runInlineFallback(comments, deps);

    expect(result.unresolvedCount).toBe(1);
    expect(deps.inlineCalls).toHaveLength(1);
    expect(deps.issueCalls).toHaveLength(1);
    // Body must carry file + line context so the reviewer can still map it.
    expect(deps.issueCalls[0]).toContain("**docs/a.md**");
    expect(deps.issueCalls[0]).toContain("(L42)");
    expect(deps.issueCalls[0]).toContain("oops");
  });

  it("formats multi-line fallback context as (L{start}-L{end})", async () => {
    const comments = [
      makeComment({ body: "multi", path: "docs/a.md", startLine: 5, line: 10 }),
    ];
    const deps = makeDeps("fail");
    await runInlineFallback(comments, deps);
    expect(deps.issueCalls[0]).toContain("(L5-L10)");
  });

  it("does NOT mark unresolved when startLine === line (single line, no range)", async () => {
    const comments = [
      makeComment({ startLine: 10, line: 10, body: "single" }),
    ];
    const deps = makeDeps("fail");
    await runInlineFallback(comments, deps);
    expect(deps.issueCalls[0]).toContain("(L10)");
    expect(deps.issueCalls[0]).not.toContain("-L10)");
  });

  it("mixed success and failure: only the failing ones count as unresolved", async () => {
    const comments = [
      makeComment({ body: "first-ok", line: 1 }),
      makeComment({ body: "second-bad", line: 99 }),
      makeComment({ body: "third-ok", line: 3 }),
      makeComment({ body: "fourth-bad", line: 100 }),
    ];
    const deps = makeDeps(async (c) => {
      if (c.body.includes("bad")) throw new Error("unresolvable");
    });
    const result = await runInlineFallback(comments, deps);

    expect(result.unresolvedCount).toBe(2);
    expect(deps.inlineCalls).toHaveLength(4); // tried all four
    expect(deps.issueCalls).toHaveLength(2);  // only two fell back
    expect(deps.issueCalls[0]).toContain("second-bad");
    expect(deps.issueCalls[1]).toContain("fourth-bad");
  });

  it("swallows errors from the issue-comment fallback (never rethrows)", async () => {
    const comments = [makeComment({ body: "cursed" })];
    const deps = makeDeps("fail", "fail");
    // Must not throw even though both inline AND issue fallback fail.
    const result = await runInlineFallback(comments, deps);
    expect(result.unresolvedCount).toBe(1);
    expect(deps.issueCalls).toHaveLength(1); // attempt was made
  });

  it("returns 0 unresolved when the input list is empty", async () => {
    const deps = makeDeps("success");
    const result = await runInlineFallback([], deps);
    expect(result.unresolvedCount).toBe(0);
    expect(deps.inlineCalls).toHaveLength(0);
    expect(deps.issueCalls).toHaveLength(0);
  });

  it("NEVER double-posts the same comment", async () => {
    // Regression guard: on a successful inline post, we must not also post
    // an issue comment. This is what would cause the duplication the user
    // was seeing.
    const comments = [makeComment({ body: "unique body" })];
    const deps = makeDeps("success");
    await runInlineFallback(comments, deps);

    const bodies = [
      ...deps.inlineCalls.map((c) => c.body),
      ...deps.issueCalls,
    ];
    expect(bodies.filter((b) => b.includes("unique body"))).toHaveLength(1);
  });

  it("does NOT retry a comment after a failed fallback (no infinite loop)", async () => {
    const comments = [makeComment({ body: "once" })];
    const deps = makeDeps("fail", "fail");
    await runInlineFallback(comments, deps);
    // One inline attempt + one issue attempt = two total, not a retry storm.
    expect(deps.inlineCalls).toHaveLength(1);
    expect(deps.issueCalls).toHaveLength(1);
  });
});
