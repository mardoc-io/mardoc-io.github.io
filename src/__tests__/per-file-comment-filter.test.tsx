/**
 * Tests for per-file comment filtering in DiffViewer.
 *
 * Verifies that the comment panel only shows comments belonging to
 * the currently selected file, not the entire PR. Covers:
 *   - Review comments (rc-*) filtered by path
 *   - Pending comments filtered by pendingPath
 *   - Issue comments (ic-*, no path) excluded from per-file view
 *   - Switching files changes which comments are visible
 *   - Comment count badge reflects per-file count
 */
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
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

const fileA: PRFile = {
  path: "docs/getting-started.md",
  status: "modified",
  baseContent: "# Getting Started\n\nOld content.\n",
  headContent: "# Getting Started\n\nNew content.\n",
};

const fileB: PRFile = {
  path: "docs/contributing.md",
  status: "added",
  baseContent: "",
  headContent: "# Contributing\n\nFork the repository.\n",
};

function comment(overrides: Partial<PRComment>): PRComment {
  return {
    id: "default",
    author: "alice",
    avatarColor: "#264653",
    body: "Test comment",
    createdAt: "2026-04-28T00:00:00Z",
    resolved: false,
    replies: [],
    ...overrides,
  };
}

const noop = vi.fn();

function renderViewer(file: PRFile, comments: PRComment[]) {
  return render(
    <DiffViewer
      file={file}
      repoFullName="owner/repo"
      baseBranch="main"
      headBranch="feat/test"
      comments={comments}
      onAddComment={noop}
      onResolveComment={noop}
      onReplyComment={noop}
      onSubmitSuggestions={noop}
      onAcceptSuggestion={noop}
      onDiscardPendingComment={noop}
    />
  );
}

describe("Per-file comment filtering", () => {
  const commentsAcrossFiles: PRComment[] = [
    comment({ id: "rc-1", path: "docs/getting-started.md", body: "Comment on getting started", selectedText: "New content" }),
    comment({ id: "rc-2", path: "docs/getting-started.md", body: "Another on getting started" }),
    comment({ id: "rc-3", path: "docs/contributing.md", body: "Comment on contributing", selectedText: "Fork the repository" }),
    comment({ id: "ic-1", body: "General PR comment (no path)" }),
    comment({ id: "c-pending-1", pending: true, pendingPath: "docs/getting-started.md", body: "Pending on getting started" }),
    comment({ id: "c-pending-2", pending: true, pendingPath: "docs/contributing.md", body: "Pending on contributing" }),
  ];

  it("shows only comments matching fileA when viewing fileA", async () => {
    renderViewer(fileA, commentsAcrossFiles);

    await waitFor(() => {
      expect(screen.getByText(/Comments \(3\)/)).toBeTruthy();
    });

    expect(screen.getByText("Comment on getting started")).toBeTruthy();
    expect(screen.getByText("Another on getting started")).toBeTruthy();
    expect(screen.getByText("Pending on getting started")).toBeTruthy();

    expect(screen.queryByText("Comment on contributing")).toBeNull();
    expect(screen.queryByText("General PR comment (no path)")).toBeNull();
    expect(screen.queryByText("Pending on contributing")).toBeNull();
  });

  it("shows only comments matching fileB when viewing fileB", async () => {
    renderViewer(fileB, commentsAcrossFiles);

    await waitFor(() => {
      expect(screen.getByText(/Comments \(2\)/)).toBeTruthy();
    });

    expect(screen.getByText("Comment on contributing")).toBeTruthy();
    expect(screen.getByText("Pending on contributing")).toBeTruthy();

    expect(screen.queryByText("Comment on getting started")).toBeNull();
    expect(screen.queryByText("General PR comment (no path)")).toBeNull();
  });

  it("shows no comments when viewing a file with none", async () => {
    const fileC: PRFile = {
      path: "docs/changelog.md",
      status: "modified",
      baseContent: "# Changelog\n\nOld.\n",
      headContent: "# Changelog\n\nNew.\n",
    };

    renderViewer(fileC, commentsAcrossFiles);

    await waitFor(() => {
      expect(screen.getByText(/No comments yet/)).toBeTruthy();
    });
  });

  it("excludes issue comments (no path) from per-file view", async () => {
    const onlyIssueComments = [
      comment({ id: "ic-1", body: "General PR comment" }),
    ];

    renderViewer(fileA, onlyIssueComments);

    await waitFor(() => {
      expect(screen.getByText(/No comments yet/)).toBeTruthy();
    });
  });

  it("switches comment set when rerendered with a different file", async () => {
    const { rerender } = renderViewer(fileA, commentsAcrossFiles);

    await waitFor(() => {
      expect(screen.getByText("Comment on getting started")).toBeTruthy();
    });
    expect(screen.queryByText("Comment on contributing")).toBeNull();

    rerender(
      <DiffViewer
        file={fileB}
        repoFullName="owner/repo"
        baseBranch="main"
        headBranch="feat/test"
        comments={commentsAcrossFiles}
        onAddComment={noop}
        onResolveComment={noop}
        onReplyComment={noop}
        onSubmitSuggestions={noop}
        onAcceptSuggestion={noop}
        onDiscardPendingComment={noop}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Comment on contributing")).toBeTruthy();
    });
    expect(screen.queryByText("Comment on getting started")).toBeNull();
  });
});
