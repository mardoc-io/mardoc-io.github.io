/**
 * Tests for the iframe selection script — the string that ships
 * into the sandboxed HTML review iframe.
 *
 * We can't run the script inside a real iframe in vitest (jsdom
 * has limited iframe support), so we evaluate it in the current
 * jsdom window with a fake `window.parent` that captures the
 * posted messages. That's enough to verify the contract:
 *
 *   - On mouseup with a non-empty selection, the script posts
 *     a `mardoc-html-selection` message with text, startLine, endLine.
 *   - When the selection endpoints walk up to tagged ancestors,
 *     the reported lines match the attribute values.
 *   - When no ancestor is tagged, the script posts nothing.
 *   - Collapsed/empty selections post nothing.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { buildIframeSelectionScript } from "@/lib/html-selection";

function runScript(): void {
  // Evaluate the script in the jsdom context. The script is an
  // IIFE so it runs immediately and installs its own listeners.
  // We use the Function constructor instead of eval to keep
  // strict-mode linting happy — the behavior is identical for
  // this test's purposes.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function(buildIframeSelectionScript())();
}

function selectNodes(anchor: Node, focus: Node): void {
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  const range = document.createRange();
  range.setStart(anchor, 0);
  range.setEnd(focus, focus.nodeType === Node.TEXT_NODE ? (focus as Text).length : 1);
  sel.addRange(range);
}

function dispatchMouseUp(): void {
  const event = new MouseEvent("mouseup", { bubbles: true });
  document.dispatchEvent(event);
}

describe("iframe selection script — postMessage contract", () => {
  let postMessageSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Reset DOM and listeners between tests. jsdom shares
    // document across tests in the same file, so we have to
    // clear any listeners the previous test installed. The
    // cleanest way is to replace the documentElement — but
    // that's heavy. Instead, we reuse the document and rely on
    // each test installing its own listeners via runScript(),
    // and clearing the spy between tests.
    document.body.innerHTML = "";
    postMessageSpy = vi.fn();
    // The script posts to window.parent — in jsdom, window.parent
    // === window unless we override. Monkey-patch postMessage on
    // the parent so we can observe calls.
    Object.defineProperty(window.parent, "postMessage", {
      value: postMessageSpy,
      configurable: true,
      writable: true,
    });
  });

  it("posts a selection message when the user selects tagged text", async () => {
    document.body.innerHTML =
      '<p data-mardoc-line="5">hello world selection target</p>';
    const text = document.querySelector("p")!.firstChild!;

    runScript();
    selectNodes(text, text);
    dispatchMouseUp();

    // setTimeout(..., 0) inside the script defers the post
    await new Promise((r) => setTimeout(r, 10));

    expect(postMessageSpy).toHaveBeenCalledTimes(1);
    const [message] = postMessageSpy.mock.calls[0];
    expect(message.type).toBe("mardoc-html-selection");
    expect(message.startLine).toBe(5);
    expect(message.endLine).toBe(5);
    expect(typeof message.text).toBe("string");
    expect(message.text.length).toBeGreaterThan(0);
  });

  it("posts a multi-line range when the selection crosses elements", async () => {
    document.body.innerHTML =
      '<h1 data-mardoc-line="3">Title</h1>' +
      '<p data-mardoc-line="5">Body text here</p>';
    const h1Text = document.querySelector("h1")!.firstChild!;
    const pText = document.querySelector("p")!.firstChild!;

    runScript();
    selectNodes(h1Text, pText);
    dispatchMouseUp();
    await new Promise((r) => setTimeout(r, 10));

    expect(postMessageSpy).toHaveBeenCalledTimes(1);
    const [message] = postMessageSpy.mock.calls[0];
    expect(message.startLine).toBe(3);
    expect(message.endLine).toBe(5);
  });

  it("does NOT post when no ancestor has data-mardoc-line", async () => {
    document.body.innerHTML = "<p>untagged content</p>";
    const text = document.querySelector("p")!.firstChild!;

    runScript();
    selectNodes(text, text);
    dispatchMouseUp();
    await new Promise((r) => setTimeout(r, 10));

    expect(postMessageSpy).not.toHaveBeenCalled();
  });

  it("does NOT post on a collapsed selection", async () => {
    document.body.innerHTML = '<p data-mardoc-line="2">text</p>';

    runScript();
    // Clear any selection
    window.getSelection()!.removeAllRanges();
    dispatchMouseUp();
    await new Promise((r) => setTimeout(r, 10));

    expect(postMessageSpy).not.toHaveBeenCalled();
  });
});
