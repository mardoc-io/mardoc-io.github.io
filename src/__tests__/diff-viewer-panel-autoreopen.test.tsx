/**
 * Regression for the PR comment panel auto-reopening on every 30s
 * poll tick.
 *
 * PRDetail polls `fetchPRComments` every 30s and pipes the result
 * through `mergeFreshComments`, which ALWAYS returns a new array
 * (Array.from(byId.values())) regardless of whether the data changed.
 *
 * DiffViewer derives `allPanelComments` via useMemo keyed on `comments`,
 * so a new parent array → a new memoized array → the "auto-show panel
 * when there are comments" effect fires → `setShowPanel(true)`.
 *
 * Before the fix, that meant a user on a PR with unresolved comments
 * could not keep the panel closed: every 30 seconds it snapped back
 * open. The fix tracks the previous unresolved-presence in a ref and
 * only fires `setShowPanel(true)` on the 0→N transition.
 */
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import DiffViewer from "@/components/DiffViewer";
import type { PRFile, PRComment } from "@/types";

vi.mock("@/lib/app-context", () => ({
  useApp: () => ({ isEmbedded: false }),
}));

vi.mock("@/lib/github-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/github-api")>(
    "@/lib/github-api"
  );
  return {
    ...actual,
    loadAuthenticatedImages: vi.fn(),
    loadEmbedLocalImages: vi.fn(),
    rewriteImageUrls: (html: string) => html,
    mapSelectionToLines: () => ({ startLine: 1, endLine: 1 }),
  };
});

vi.mock("@/lib/mermaid", () => ({
  renderMermaidBlocks: vi.fn(),
}));
vi.mock("@/lib/highlight", () => ({
  highlightCodeBlocks: (html: string) => html,
}));

beforeEach(() => {
  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        onchange: null,
        dispatchEvent: () => false,
      }),
    });
  }
});

afterEach(() => {
  cleanup();
});

function makeMarkdownFile(): PRFile {
  return {
    path: "docs/notes.md",
    status: "modified",
    baseContent: "# Notes\n\nOriginal line.\n",
    headContent: "# Notes\n\nUpdated line.\n",
  };
}

function makeComment(overrides: Partial<PRComment> = {}): PRComment {
  return {
    id: "rc-1",
    path: "docs/notes.md",
    author: "alice",
    avatarColor: "#264653",
    body: "Could you clarify?",
    createdAt: "2026-04-16T00:00:00Z",
    blockIndex: 0,
    selectedText: "Updated line.",
    resolved: false,
    replies: [],
    ...overrides,
  };
}

// Clone a comments array the way mergeFreshComments does: new array
// reference, same contents. This is the exact shape that triggered
// the auto-reopen bug.
function clonePollRefresh(prev: PRComment[]): PRComment[] {
  return prev.map((c) => ({ ...c }));
}

describe("DiffViewer — comment panel auto-reopen regression", () => {
  it("does not reopen the panel when the comments array is refreshed with the same data", async () => {
    const file = makeMarkdownFile();
    const initialComments = [makeComment()];

    const { rerender } = render(
      <DiffViewer
        file={file}
        repoFullName="owner/repo"
        baseBranch="main"
        headBranch="feat/test"
        comments={initialComments}
        onAddComment={vi.fn()}
        onResolveComment={vi.fn()}
        onReplyComment={vi.fn()}
        onSubmitSuggestions={vi.fn()}
        onAcceptSuggestion={vi.fn()}
        onDiscardPendingComment={vi.fn()}
      />
    );

    // Panel auto-opens on mount because there are unresolved comments.
    const panelHeader = await waitFor(() => screen.getByText(/Comments \(1\)/));
    expect(panelHeader).toBeTruthy();

    // User closes the panel via the X button in the panel header.
    const closeBtn = panelHeader.parentElement?.querySelector("button");
    expect(closeBtn).toBeTruthy();
    fireEvent.click(closeBtn!);

    // Panel header is gone.
    await waitFor(() => {
      expect(screen.queryByText(/Comments \(1\)/)).toBeNull();
    });

    // Simulate the 30s poll: PRDetail's setComments(mergeFreshComments(...))
    // produces a fresh array reference with identical data.
    rerender(
      <DiffViewer
        file={file}
        repoFullName="owner/repo"
        baseBranch="main"
        headBranch="feat/test"
        comments={clonePollRefresh(initialComments)}
        onAddComment={vi.fn()}
        onResolveComment={vi.fn()}
        onReplyComment={vi.fn()}
        onSubmitSuggestions={vi.fn()}
        onAcceptSuggestion={vi.fn()}
        onDiscardPendingComment={vi.fn()}
      />
    );

    // Panel must stay closed.
    expect(screen.queryByText(/Comments \(1\)/)).toBeNull();

    // A second poll tick should also keep it closed.
    rerender(
      <DiffViewer
        file={file}
        repoFullName="owner/repo"
        baseBranch="main"
        headBranch="feat/test"
        comments={clonePollRefresh(initialComments)}
        onAddComment={vi.fn()}
        onResolveComment={vi.fn()}
        onReplyComment={vi.fn()}
        onSubmitSuggestions={vi.fn()}
        onAcceptSuggestion={vi.fn()}
        onDiscardPendingComment={vi.fn()}
      />
    );
    expect(screen.queryByText(/Comments \(1\)/)).toBeNull();
  });

  it("still reopens the panel on the 0→N transition (new comment arrives after user closed an empty panel)", async () => {
    const file = makeMarkdownFile();

    const { rerender } = render(
      <DiffViewer
        file={file}
        repoFullName="owner/repo"
        baseBranch="main"
        headBranch="feat/test"
        comments={[]}
        onAddComment={vi.fn()}
        onResolveComment={vi.fn()}
        onReplyComment={vi.fn()}
        onSubmitSuggestions={vi.fn()}
        onAcceptSuggestion={vi.fn()}
        onDiscardPendingComment={vi.fn()}
      />
    );

    // Empty-state panel is showing (showPanel defaults to true).
    const emptyHeader = await waitFor(() => screen.getByText(/Comments \(0\)/));
    const closeBtn = emptyHeader.parentElement?.querySelector("button");
    fireEvent.click(closeBtn!);

    await waitFor(() => {
      expect(screen.queryByText(/Comments \(0\)/)).toBeNull();
    });

    // A new comment arrives via polling.
    rerender(
      <DiffViewer
        file={file}
        repoFullName="owner/repo"
        baseBranch="main"
        headBranch="feat/test"
        comments={[makeComment()]}
        onAddComment={vi.fn()}
        onResolveComment={vi.fn()}
        onReplyComment={vi.fn()}
        onSubmitSuggestions={vi.fn()}
        onAcceptSuggestion={vi.fn()}
        onDiscardPendingComment={vi.fn()}
      />
    );

    // 0→1 unresolved-count transition → panel reopens.
    await waitFor(() => {
      expect(screen.getByText(/Comments \(1\)/)).toBeTruthy();
    });
  });
});
