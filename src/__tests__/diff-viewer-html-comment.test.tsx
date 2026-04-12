/**
 * Integration test for the HTML commenting flow in DiffViewer.
 *
 * Reproduces the user's report: when viewing an HTML file in a PR,
 * the inline comment flow should work end-to-end. This test mounts
 * DiffViewer with an HTML PRFile, simulates the mardoc-html-selection
 * postMessage the iframe script would send, and verifies the pending
 * comment input appears and submission works.
 *
 * The iframe sandbox and iframe script are NOT exercised by jsdom —
 * this test only verifies the parent-side contract. If this test
 * passes and the real app still breaks, the bug is in the iframe
 * script or browser sandbox (not the React code).
 */
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, act } from "@testing-library/react";
import DiffViewer from "@/components/DiffViewer";
import type { PRFile } from "@/types";

// Mock useApp so we don't need the full AppProvider
vi.mock("@/lib/app-context", () => ({
  useApp: () => ({ isEmbedded: false }),
}));

// Mock the GitHub API functions that DiffViewer imports
vi.mock("@/lib/github-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/github-api")>("@/lib/github-api");
  return {
    ...actual,
    loadAuthenticatedImages: vi.fn(),
    loadEmbedLocalImages: vi.fn(),
    rewriteImageUrls: (html: string) => html,
    mapSelectionToLines: () => ({ startLine: 1, endLine: 1 }),
  };
});

// Mock mermaid/highlight since they need DOM APIs jsdom doesn't have
vi.mock("@/lib/mermaid", () => ({
  renderMermaidBlocks: vi.fn(),
}));
vi.mock("@/lib/highlight", () => ({
  highlightCodeBlocks: (html: string) => html,
}));

// jsdom doesn't provide window.matchMedia — useViewport needs it
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

function makeHtmlFile(): PRFile {
  return {
    path: "docs/sample.html",
    status: "modified",
    baseContent: "<html><body><p>Original text.</p></body></html>",
    headContent: "<html><body><p>New text to comment on.</p></body></html>",
  };
}

afterEach(() => {
  cleanup();
});

describe("DiffViewer — HTML commenting flow (parent side)", () => {
  it("renders the HTML file view with an iframe", () => {
    const file = makeHtmlFile();
    render(
      <DiffViewer
        file={file}
        repoFullName="owner/repo"
        baseBranch="main"
        headBranch="feat/test"
        comments={[]}
        onAddComment={vi.fn()}
        onResolveComment={vi.fn()}
      />
    );
    // HTML file view renders an iframe
    const iframe = document.querySelector("iframe");
    expect(iframe).toBeTruthy();
  });

  it("srcDoc contains the selection listener script so the iframe can post selections", () => {
    const file = makeHtmlFile();
    render(
      <DiffViewer
        file={file}
        repoFullName="owner/repo"
        baseBranch="main"
        headBranch="feat/test"
        comments={[]}
        onAddComment={vi.fn()}
        onResolveComment={vi.fn()}
      />
    );
    const iframe = document.querySelector("iframe") as HTMLIFrameElement;
    // srcdoc attribute / property contains the selection script
    const srcDoc = iframe.getAttribute("srcdoc") || iframe.srcdoc;
    expect(srcDoc).toContain("mardoc-html-selection");
  });

  it("shows the pending comment input after a mardoc-html-selection postMessage", async () => {
    const file = makeHtmlFile();
    render(
      <DiffViewer
        file={file}
        repoFullName="owner/repo"
        baseBranch="main"
        headBranch="feat/test"
        comments={[]}
        onAddComment={vi.fn()}
        onResolveComment={vi.fn()}
      />
    );

    // Wait for the message-listener effect to install
    await waitFor(() => {
      expect(document.querySelector("iframe")).toBeTruthy();
    });

    // Simulate the iframe posting a selection back to the parent
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            type: "mardoc-html-selection",
            text: "New text to comment on",
            startLine: 1,
            endLine: 1,
          },
        })
      );
    });

    // The pending-selection comment input should appear
    await waitFor(() => {
      expect(screen.getByText("Commenting on selected text:")).toBeTruthy();
    });
    expect(screen.getByText(/New text to comment on/)).toBeTruthy();
    expect(screen.getByPlaceholderText("Write your comment...")).toBeTruthy();
  });

  it("submits an inline comment with the posted line range", async () => {
    const file = makeHtmlFile();
    const onAddComment = vi.fn();
    render(
      <DiffViewer
        file={file}
        repoFullName="owner/repo"
        baseBranch="main"
        headBranch="feat/test"
        comments={[]}
        onAddComment={onAddComment}
        onResolveComment={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(document.querySelector("iframe")).toBeTruthy();
    });

    // Simulate the iframe posting a selection on lines 4-6
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            type: "mardoc-html-selection",
            text: "hello from iframe",
            startLine: 4,
            endLine: 6,
          },
        })
      );
    });

    // Type a comment and click the submit button (exact text "Comment",
    // not the toolbar toggle labeled "Comments" with an s)
    const input = await waitFor(() =>
      screen.getByPlaceholderText("Write your comment...") as HTMLInputElement
    );
    fireEvent.change(input, { target: { value: "Please clarify" } });

    // The submit button lives inside the pending-selection bar with
    // exact text "Comment". Use a node-filter to disambiguate from
    // the "Comments" toggle in the file toolbar.
    const buttons = Array.from(document.querySelectorAll("button"));
    const submitBtn = buttons.find((b) => b.textContent?.trim() === "Comment");
    expect(submitBtn).toBeTruthy();
    fireEvent.click(submitBtn!);

    expect(onAddComment).toHaveBeenCalledWith(
      0,
      "Please clarify",
      "hello from iframe",
      4,
      6
    );
  });
});
