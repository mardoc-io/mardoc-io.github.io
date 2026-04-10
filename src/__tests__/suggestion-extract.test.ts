import { describe, it, expect } from "vitest";
import {
  extractCommentSuggestions,
  mergeSuggestions,
  type BlockRange,
} from "@/lib/suggestion-extract";
import { PRComment, PendingSuggestion } from "@/types";

function comment(partial: Partial<PRComment>): PRComment {
  return {
    id: "rc-1",
    author: "reviewer",
    avatarColor: "#000",
    body: "",
    createdAt: "2026-04-10T00:00:00Z",
    resolved: false,
    replies: [],
    ...partial,
  };
}

function suggestion(editedMarkdown: string): string {
  return "```suggestion\n" + editedMarkdown + "\n```";
}

// Three blocks: lines 1-3, 5-7, 9-12. Gaps represent blank lines in the file.
const headBlocks = ["# Heading", "First paragraph.", "Second paragraph line one."];
const headBlockRanges: BlockRange[] = [
  { startLine: 1, endLine: 1 },
  { startLine: 3, endLine: 3 },
  { startLine: 5, endLine: 5 },
];

describe("extractCommentSuggestions", () => {
  it("extracts a submitted suggestion mapped by line number from GitHub", () => {
    // Fetched review comment: GitHub surfaces its line number via blockIndex.
    const result = extractCommentSuggestions(
      [comment({ body: suggestion("# New heading"), blockIndex: 1 })],
      headBlocks,
      headBlockRanges
    );

    expect(result).toHaveLength(1);
    expect(result[0].blockIndex).toBe(0);
    expect(result[0].editedMarkdown).toBe("# New heading");
    expect(result[0].endLine).toBe(1);
  });

  it("maps a suggestion on line 3 to block 1 (middle block)", () => {
    const result = extractCommentSuggestions(
      [comment({ body: suggestion("Updated first para"), blockIndex: 3 })],
      headBlocks,
      headBlockRanges
    );
    expect(result).toHaveLength(1);
    expect(result[0].blockIndex).toBe(1);
  });

  it("maps a suggestion on line 5 to block 2 (last block)", () => {
    const result = extractCommentSuggestions(
      [comment({ body: suggestion("Updated second para"), blockIndex: 5 })],
      headBlocks,
      headBlockRanges
    );
    expect(result).toHaveLength(1);
    expect(result[0].blockIndex).toBe(2);
  });

  it("prefers pendingEndLine when set (local optimistic copy)", () => {
    // Local optimistic comment has pendingStartLine/pendingEndLine set, and
    // blockIndex is undefined or unrelated. Pending metadata wins.
    const result = extractCommentSuggestions(
      [
        comment({
          body: suggestion("Local edit"),
          pendingStartLine: 3,
          pendingEndLine: 3,
        }),
      ],
      headBlocks,
      headBlockRanges
    );
    expect(result).toHaveLength(1);
    expect(result[0].blockIndex).toBe(1);
  });

  it("skips comments that are not suggestions", () => {
    const result = extractCommentSuggestions(
      [comment({ body: "Just a regular comment", blockIndex: 1 })],
      headBlocks,
      headBlockRanges
    );
    expect(result).toHaveLength(0);
  });

  it("skips suggestions that don't map to any block", () => {
    const result = extractCommentSuggestions(
      [comment({ body: suggestion("orphan"), blockIndex: 999 })],
      headBlocks,
      headBlockRanges
    );
    expect(result).toHaveLength(0);
  });

  it("skips suggestions with no line information", () => {
    const result = extractCommentSuggestions(
      [comment({ body: suggestion("no line") })],
      headBlocks,
      headBlockRanges
    );
    expect(result).toHaveLength(0);
  });

  it("handles multiple suggestions across different blocks", () => {
    const comments = [
      comment({ id: "rc-1", body: suggestion("A"), blockIndex: 1 }),
      comment({ id: "rc-2", body: suggestion("B"), blockIndex: 3 }),
      comment({ id: "rc-3", body: suggestion("C"), blockIndex: 5 }),
    ];
    const result = extractCommentSuggestions(comments, headBlocks, headBlockRanges);
    expect(result).toHaveLength(3);
    expect(result.map((s) => s.blockIndex).sort()).toEqual([0, 1, 2]);
  });

  // ─── Regression: the bug the user reported ─────────────────────────────

  it("REGRESSION: does NOT rely on comment.selectedText for block mapping", () => {
    // The previous (broken) implementation mapped suggestions via
    // `headBlocks.findIndex(b => b.includes(comment.selectedText))`. Fetched
    // review comments from GitHub don't have `selectedText` set — that's a
    // MarDoc-local concept. So submitted suggestions disappeared from the
    // suggest view after the refetch. This test guards against the
    // regression by passing a comment with NO selectedText and verifying
    // the mapping still works.
    const result = extractCommentSuggestions(
      [
        comment({
          body: suggestion("After submission"),
          blockIndex: 3,
          // no selectedText, no pending* fields — just like fetched data
        }),
      ],
      headBlocks,
      headBlockRanges
    );
    expect(result).toHaveLength(1);
    expect(result[0].blockIndex).toBe(1);
  });
});

describe("mergeSuggestions", () => {
  const s = (blockIndex: number, editedMarkdown: string): PendingSuggestion => ({
    blockIndex,
    originalMarkdown: "",
    editedMarkdown,
    startLine: 1,
    endLine: 1,
  });

  it("combines pending and submitted suggestions for different blocks", () => {
    const pending = [s(0, "pending-0")];
    const submitted = [s(1, "submitted-1"), s(2, "submitted-2")];
    const merged = mergeSuggestions(pending, submitted);
    expect(merged).toHaveLength(3);
  });

  it("pending wins over submitted for the same block index", () => {
    const pending = [s(1, "fresh-edit")];
    const submitted = [s(1, "old-submission")];
    const merged = mergeSuggestions(pending, submitted);
    expect(merged).toHaveLength(1);
    expect(merged[0].editedMarkdown).toBe("fresh-edit");
  });

  it("returns empty when both inputs are empty", () => {
    expect(mergeSuggestions([], [])).toEqual([]);
  });

  it("returns pending-only when submitted is empty", () => {
    expect(mergeSuggestions([s(0, "a")], [])).toHaveLength(1);
  });

  it("returns submitted-only when pending is empty", () => {
    expect(mergeSuggestions([], [s(0, "a"), s(1, "b")])).toHaveLength(2);
  });
});
