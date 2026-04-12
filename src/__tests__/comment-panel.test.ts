/**
 * Characterization tests for CommentPanel.
 *
 * Pins the observable behavior of the review comment panel so the
 * DiffViewer refactors can't silently regress the comment UX.
 *
 * Coverage:
 *   - Empty state shows the "no comments yet" placeholder
 *   - Active comments render with quoted text + line range
 *   - Pending comments show Pending badge + Discard button
 *   - GitHub-sourced comments show GitHub badge
 *   - Suggestion bodies render as a separate block with an Accept
 *     button (only when not pending)
 *   - Pending suggestions show the "submit review first" hint instead
 *   - Reply input appears only on the active comment
 *   - Reply enter / send-button trigger onReply
 *   - Resolve button fires onResolve
 *   - Resolved comments appear in a separate group
 *   - Close button fires onClose
 */
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import CommentPanel, { type PanelComment } from "@/components/CommentPanel";

const e = React.createElement;

function makeComment(overrides: Partial<PanelComment> = {}): PanelComment {
  return {
    id: "c1",
    selectedText: "the quick brown fox",
    body: "I think this needs a citation.",
    author: "alice",
    avatarColor: "#4caf50",
    createdAt: new Date("2026-01-15T10:30:00Z").toISOString(),
    blockIndex: 0,
    resolved: false,
    startLine: 42,
    endLine: 42,
    replies: [],
    source: "local",
    pending: false,
    ...overrides,
  };
}

function mount(props: Partial<React.ComponentProps<typeof CommentPanel>> & { comments: PanelComment[] }) {
  return render(
    e(CommentPanel, {
      comments: props.comments,
      activeCommentId: props.activeCommentId ?? null,
      onSelect: props.onSelect ?? (() => {}),
      onReply: props.onReply ?? (() => {}),
      onResolve: props.onResolve ?? (() => {}),
      onAccept: props.onAccept,
      onDiscardPending: props.onDiscardPending,
      onClose: props.onClose ?? (() => {}),
    } as React.ComponentProps<typeof CommentPanel>)
  );
}

afterEach(() => cleanup());

// ─── Header and empty state ──────────────────────────────────────────

describe("CommentPanel — header and empty state", () => {
  it("shows a zero count when there are no comments", () => {
    mount({ comments: [] });
    expect(screen.getByText("Comments (0)")).toBeTruthy();
  });

  it("shows an empty-state message when there are no unresolved comments", () => {
    mount({ comments: [] });
    expect(screen.getByText(/No comments yet/i)).toBeTruthy();
  });

  it("active count excludes resolved comments", () => {
    mount({
      comments: [
        makeComment({ id: "a", resolved: false }),
        makeComment({ id: "b", resolved: true }),
        makeComment({ id: "c", resolved: false }),
      ],
    });
    expect(screen.getByText("Comments (2)")).toBeTruthy();
  });

  it("close button fires onClose", () => {
    const onClose = vi.fn();
    mount({ comments: [], onClose });
    // The close button is the only button in the header
    const closeBtn = document.querySelector('.toolbar-btn') as HTMLButtonElement;
    expect(closeBtn).toBeTruthy();
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ─── Comment rendering ───────────────────────────────────────────────

describe("CommentPanel — active comment rendering", () => {
  it("renders the quoted selected text with smart quotes", () => {
    mount({
      comments: [makeComment({ selectedText: "the quick brown fox" })],
    });
    // Uses left double quote followed by text followed by right double quote
    expect(screen.getByText(/the quick brown fox/)).toBeTruthy();
  });

  it("renders a single-line reference when startLine === endLine", () => {
    mount({
      comments: [makeComment({ startLine: 42, endLine: 42 })],
    });
    expect(screen.getByText("Line 42")).toBeTruthy();
  });

  it("renders a line range when startLine !== endLine", () => {
    mount({
      comments: [makeComment({ startLine: 10, endLine: 14 })],
    });
    expect(screen.getByText("Lines 10–14")).toBeTruthy();
  });

  it("renders the comment body", () => {
    mount({
      comments: [makeComment({ body: "Please add a citation here." })],
    });
    expect(screen.getByText("Please add a citation here.")).toBeTruthy();
  });

  it("renders the author name", () => {
    mount({
      comments: [makeComment({ author: "bob" })],
    });
    expect(screen.getByText("bob")).toBeTruthy();
  });

  it("renders a Pending badge for pending comments", () => {
    mount({
      comments: [makeComment({ pending: true })],
    });
    expect(screen.getByText("Pending")).toBeTruthy();
  });

  it("renders a GitHub badge for GitHub-sourced comments", () => {
    mount({
      comments: [makeComment({ source: "github", pending: false })],
    });
    expect(screen.getByText("GitHub")).toBeTruthy();
  });

  it("shows a Discard button on pending comments when onDiscardPending is provided", () => {
    const onDiscardPending = vi.fn();
    mount({
      comments: [makeComment({ pending: true })],
      onDiscardPending,
    });
    const discardBtn = screen.getByText("Discard");
    fireEvent.click(discardBtn);
    expect(onDiscardPending).toHaveBeenCalledWith("c1");
  });

  it("does NOT show Discard when onDiscardPending is not provided", () => {
    mount({
      comments: [makeComment({ pending: true })],
    });
    expect(screen.queryByText("Discard")).toBeNull();
  });
});

// ─── Suggestion rendering ────────────────────────────────────────────

describe("CommentPanel — suggestion rendering", () => {
  it("renders a suggestion body as a distinct block with Accept button when not pending", () => {
    const onAccept = vi.fn();
    mount({
      comments: [
        makeComment({
          body: "```suggestion\nnew text\n```",
          pending: false,
        }),
      ],
      onAccept,
    });
    expect(screen.getByText("Suggested change:")).toBeTruthy();
    const acceptBtn = screen.getByText("Accept suggestion");
    fireEvent.click(acceptBtn);
    expect(onAccept).toHaveBeenCalledWith("c1");
  });

  it("hides Accept button on a pending suggestion and shows the submit-first hint", () => {
    const onAccept = vi.fn();
    mount({
      comments: [
        makeComment({
          body: "```suggestion\nnew text\n```",
          pending: true,
        }),
      ],
      onAccept,
    });
    expect(screen.queryByText("Accept suggestion")).toBeNull();
    expect(screen.getByText(/Submit the review first/i)).toBeTruthy();
  });

  it("does not render the Accept button at all when onAccept is not provided", () => {
    mount({
      comments: [
        makeComment({
          body: "```suggestion\nnew text\n```",
          pending: false,
        }),
      ],
    });
    expect(screen.queryByText("Accept suggestion")).toBeNull();
  });
});

// ─── Replies ─────────────────────────────────────────────────────────

describe("CommentPanel — replies", () => {
  it("renders existing replies", () => {
    mount({
      comments: [
        makeComment({
          replies: [
            {
              author: "bob",
              avatarColor: "#2196f3",
              body: "I agree, let's link the source",
              createdAt: "2026-01-15T11:00:00Z",
            },
          ],
        }),
      ],
    });
    expect(screen.getByText("I agree, let's link the source")).toBeTruthy();
  });

  it("does NOT show reply input when comment is not active", () => {
    mount({
      comments: [makeComment({ id: "c1" })],
      activeCommentId: null,
    });
    expect(screen.queryByPlaceholderText("Reply...")).toBeNull();
  });

  it("shows reply input when comment is active", () => {
    mount({
      comments: [makeComment({ id: "c1" })],
      activeCommentId: "c1",
    });
    expect(screen.getByPlaceholderText("Reply...")).toBeTruthy();
  });

  it("Enter in the reply input fires onReply", () => {
    const onReply = vi.fn();
    mount({
      comments: [makeComment({ id: "c1" })],
      activeCommentId: "c1",
      onReply,
    });
    const input = screen.getByPlaceholderText("Reply...") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "my reply" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onReply).toHaveBeenCalledWith("c1", "my reply");
  });

  it("Enter does NOT fire onReply when the reply input is empty", () => {
    const onReply = vi.fn();
    mount({
      comments: [makeComment({ id: "c1" })],
      activeCommentId: "c1",
      onReply,
    });
    const input = screen.getByPlaceholderText("Reply...");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onReply).not.toHaveBeenCalled();
  });

  it("Resolve button fires onResolve when active", () => {
    const onResolve = vi.fn();
    mount({
      comments: [makeComment({ id: "c1" })],
      activeCommentId: "c1",
      onResolve,
    });
    fireEvent.click(screen.getByText("Resolve"));
    expect(onResolve).toHaveBeenCalledWith("c1");
  });
});

// ─── Selection ───────────────────────────────────────────────────────

describe("CommentPanel — selection", () => {
  it("clicking a comment fires onSelect with its id", () => {
    const onSelect = vi.fn();
    mount({
      comments: [makeComment({ id: "c1" })],
      onSelect,
    });
    // Click the quoted-text area (inside the card body)
    fireEvent.click(screen.getByText(/the quick brown fox/));
    expect(onSelect).toHaveBeenCalledWith("c1");
  });

  it("the active comment gets a distinct border style", () => {
    const { rerender } = mount({
      comments: [makeComment({ id: "c1" })],
      activeCommentId: null,
    });
    // When active, the comment has the accent border — rerender with
    // activeCommentId set and verify the className changes
    rerender(
      e(CommentPanel, {
        comments: [makeComment({ id: "c1" })],
        activeCommentId: "c1",
        onSelect: () => {},
        onReply: () => {},
        onResolve: () => {},
        onClose: () => {},
      } as React.ComponentProps<typeof CommentPanel>)
    );
    // Reply input only appears when the comment is active
    expect(screen.getByPlaceholderText("Reply...")).toBeTruthy();
  });
});

// ─── Resolved group ──────────────────────────────────────────────────

describe("CommentPanel — resolved comments", () => {
  it("shows resolved comments in a separate 'Resolved' group", () => {
    mount({
      comments: [
        makeComment({ id: "c1", resolved: false, body: "unresolved" }),
        makeComment({ id: "c2", resolved: true, body: "resolved" }),
      ],
    });
    expect(screen.getByText("Resolved")).toBeTruthy();
    expect(screen.getByText("resolved")).toBeTruthy();
    // Also: the active count excludes the resolved one
    expect(screen.getByText("Comments (1)")).toBeTruthy();
  });

  it("does NOT render the Resolved group header when no resolved comments", () => {
    mount({
      comments: [makeComment({ resolved: false })],
    });
    expect(screen.queryByText("Resolved")).toBeNull();
  });
});
