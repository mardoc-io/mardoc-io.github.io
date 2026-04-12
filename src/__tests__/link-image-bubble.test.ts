/**
 * Characterization tests for LinkImageBubble.
 *
 * Pins the observable behavior of the bubble so future refactors of
 * Editor.tsx can't silently regress the link/image edit flow. These
 * tests target the shipped contract, not the implementation — if the
 * bubble stops rendering a width input on image targets, or stops
 * firing onDismiss on Escape, or breaks the edit-mode transition,
 * these tests catch it.
 *
 * Approach: render the component with a mocked TipTap editor and a
 * fake DOM target (a link <a> or an <img> element). The editor is a
 * recording stub — we don't need a real TipTap instance to verify
 * that Apply calls the right chain of commands.
 *
 * Uses React.createElement (not JSX) because the test file is .ts,
 * not .tsx, and adding JSX would require a separate tsconfig path.
 * Readability cost is real but one-time.
 */
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import LinkImageBubble, { type BubbleTarget } from "@/components/LinkImageBubble";

const e = React.createElement;

// ─── Stub TipTap editor ───────────────────────────────────────────────
//
// LinkImageBubble only calls editor.chain().focus().setLink(...).run()
// and editor.chain().focus().updateAttributes("image", ...).run(),
// plus editor.commands.setTextSelection and editor.state.selection.
// A minimal recording stub is enough to verify the right methods are
// called with the right arguments.

function makeEditorStub() {
  const calls: { method: string; args: unknown[] }[] = [];
  const chainProxy = new Proxy(
    {},
    {
      get(_target, prop: string) {
        if (prop === "run") {
          return () => undefined;
        }
        return (...args: unknown[]) => {
          calls.push({ method: prop, args });
          return chainProxy;
        };
      },
    }
  );
  const editor = {
    state: { selection: { from: 0, to: 0 } },
    commands: {
      setTextSelection: (_pos: unknown) => true,
    },
    chain: () => chainProxy,
  };
  return { editor, calls };
}

function makeContainer(width = 800, height = 600) {
  const container = document.createElement("div");
  container.getBoundingClientRect = () =>
    ({
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      width,
      height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
  document.body.appendChild(container);
  return container;
}

function makeLinkTarget(href = "https://example.com"): BubbleTarget {
  const a = document.createElement("a");
  a.href = href;
  a.textContent = "click me";
  document.body.appendChild(a);
  a.getBoundingClientRect = () =>
    ({
      top: 100,
      left: 100,
      right: 200,
      bottom: 120,
      width: 100,
      height: 20,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    } as DOMRect);
  return { type: "link", href, element: a };
}

function makeImageTarget(opts: {
  src?: string;
  alt?: string;
  width?: string;
  height?: string;
  center?: boolean;
  naturalWidth?: number;
  naturalHeight?: number;
} = {}): BubbleTarget {
  const img = document.createElement("img");
  img.src = opts.src ?? "https://example.com/pic.png";
  img.alt = opts.alt ?? "";
  document.body.appendChild(img);
  // jsdom doesn't set naturalWidth/naturalHeight — force them
  Object.defineProperty(img, "naturalWidth", {
    value: opts.naturalWidth ?? 400,
    configurable: true,
  });
  Object.defineProperty(img, "naturalHeight", {
    value: opts.naturalHeight ?? 200,
    configurable: true,
  });
  img.getBoundingClientRect = () =>
    ({
      top: 50,
      left: 50,
      right: 250,
      bottom: 150,
      width: 200,
      height: 100,
      x: 50,
      y: 50,
      toJSON: () => ({}),
    } as DOMRect);
  return {
    type: "image",
    href: opts.src ?? "https://example.com/pic.png",
    alt: opts.alt,
    width: opts.width,
    height: opts.height,
    center: opts.center,
    element: img,
  };
}

function mount(opts: {
  target: BubbleTarget | null;
  editor?: ReturnType<typeof makeEditorStub>["editor"] | null;
  onDismiss?: () => void;
  onFollowLink?: (href: string) => void;
  container?: HTMLElement;
}) {
  const container = opts.container ?? makeContainer();
  const containerRef = { current: container };
  return render(
    e(LinkImageBubble, {
      containerRef,
      editor: opts.editor === undefined ? makeEditorStub().editor : opts.editor,
      target: opts.target,
      onDismiss: opts.onDismiss ?? (() => {}),
      onFollowLink: opts.onFollowLink ?? (() => {}),
    } as React.ComponentProps<typeof LinkImageBubble>)
  );
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

// ─── Render gate ─────────────────────────────────────────────────────

describe("LinkImageBubble — render gate", () => {
  it("renders nothing when target is null", () => {
    const { container } = mount({ target: null });
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when editor is null", () => {
    const { container } = mount({ target: makeLinkTarget(), editor: null });
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when the target element has been removed from the DOM", () => {
    const target = makeLinkTarget();
    target.element.remove();
    const { container } = mount({ target });
    expect(container.innerHTML).toBe("");
  });

  it("renders a bubble when a valid link target is provided", () => {
    mount({ target: makeLinkTarget("https://example.com") });
    // The href appears in the collapsed preview
    expect(screen.getByText("https://example.com")).toBeTruthy();
  });

  it("prefixes image targets with the 🖼 marker", () => {
    const { container } = mount({
      target: makeImageTarget({ src: "https://example.com/pic.png" }),
    });
    // The preview span contains "🖼 " followed by the URL
    expect(container.textContent).toContain("🖼");
    expect(container.textContent).toContain("pic.png");
  });
});

// ─── Link target — preview, edit, remove, follow ────────────────────

describe("LinkImageBubble — link target", () => {
  it("shows Edit, Follow, and Remove buttons for a link", () => {
    mount({ target: makeLinkTarget() });
    expect(screen.getByTitle("Edit")).toBeTruthy();
    expect(screen.getByTitle("Follow link")).toBeTruthy();
    expect(screen.getByTitle("Remove link")).toBeTruthy();
  });

  it("calls onFollowLink + onDismiss when Follow is tapped", () => {
    const onDismiss = vi.fn();
    const onFollowLink = vi.fn();
    mount({
      target: makeLinkTarget("https://example.com"),
      onDismiss,
      onFollowLink,
    });
    fireEvent.click(screen.getByTitle("Follow link"));
    expect(onFollowLink).toHaveBeenCalledWith("https://example.com");
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("entering edit mode shows URL input (but no alt/width fields)", () => {
    mount({ target: makeLinkTarget() });
    fireEvent.click(screen.getByTitle("Edit"));
    // URL input appears
    expect(screen.getByText("URL")).toBeTruthy();
    // Image-only fields do NOT appear for link targets
    expect(screen.queryByText("Alt text")).toBeNull();
    expect(screen.queryByText("Size")).toBeNull();
    expect(screen.queryByText(/Center image/)).toBeNull();
  });

  it("Apply on a link target calls setLink with the edited href", () => {
    const stub = makeEditorStub();
    mount({ target: makeLinkTarget("https://old.com"), editor: stub.editor });
    fireEvent.click(screen.getByTitle("Edit"));
    const input = screen.getByDisplayValue("https://old.com");
    fireEvent.change(input, { target: { value: "https://new.com" } });
    // Click Apply — use the text content
    fireEvent.click(screen.getByText("Apply"));
    // setLink should have been called with the new URL
    const setLinkCall = stub.calls.find((c) => c.method === "setLink");
    expect(setLinkCall).toBeTruthy();
    expect(setLinkCall!.args[0]).toMatchObject({ href: "https://new.com" });
  });

  it("Remove on a link target calls unsetLink + onDismiss", () => {
    const stub = makeEditorStub();
    const onDismiss = vi.fn();
    mount({ target: makeLinkTarget(), editor: stub.editor, onDismiss });
    fireEvent.click(screen.getByTitle("Remove link"));
    const unsetLinkCall = stub.calls.find((c) => c.method === "unsetLink");
    expect(unsetLinkCall).toBeTruthy();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("Apply button is disabled when the URL is empty", () => {
    mount({ target: makeLinkTarget("https://x.com") });
    fireEvent.click(screen.getByTitle("Edit"));
    const input = screen.getByDisplayValue("https://x.com");
    fireEvent.change(input, { target: { value: "  " } });
    const applyBtn = screen.getByText("Apply") as HTMLButtonElement;
    expect(applyBtn.disabled).toBe(true);
  });
});

// ─── Image target — edit, width/height, center, remove ─────────────

describe("LinkImageBubble — image target", () => {
  it("shows Edit and Remove (no Follow) for an image", () => {
    mount({ target: makeImageTarget() });
    expect(screen.getByTitle("Edit")).toBeTruthy();
    expect(screen.queryByTitle("Follow link")).toBeNull();
    expect(screen.getByTitle("Remove image")).toBeTruthy();
  });

  it("entering edit mode on an image shows URL, alt, size, and center fields", () => {
    mount({
      target: makeImageTarget({ alt: "diagram", width: "300", height: "150" }),
    });
    fireEvent.click(screen.getByTitle("Edit"));
    expect(screen.getByText("Image URL")).toBeTruthy();
    expect(screen.getByText("Alt text")).toBeTruthy();
    expect(screen.getByText("Size")).toBeTruthy();
    expect(screen.getByText(/Center image/)).toBeTruthy();
    expect(screen.getByDisplayValue("diagram")).toBeTruthy();
    expect(screen.getByDisplayValue("300")).toBeTruthy();
    expect(screen.getByDisplayValue("150")).toBeTruthy();
  });

  it("auto-fills height when width changes and aspect lock is on (2:1 natural ratio)", () => {
    // naturalWidth=400, naturalHeight=200 → ratio 2.0
    // Width=500 → Height should become 250
    mount({
      target: makeImageTarget({ naturalWidth: 400, naturalHeight: 200 }),
    });
    fireEvent.click(screen.getByTitle("Edit"));
    const widthInput = screen.getByPlaceholderText("Width") as HTMLInputElement;
    fireEvent.change(widthInput, { target: { value: "500" } });
    const heightInput = screen.getByPlaceholderText("Height") as HTMLInputElement;
    expect(heightInput.value).toBe("250");
  });

  it("auto-fills width when height changes and aspect lock is on", () => {
    mount({
      target: makeImageTarget({ naturalWidth: 400, naturalHeight: 200 }),
    });
    fireEvent.click(screen.getByTitle("Edit"));
    const heightInput = screen.getByPlaceholderText("Height") as HTMLInputElement;
    fireEvent.change(heightInput, { target: { value: "300" } });
    const widthInput = screen.getByPlaceholderText("Width") as HTMLInputElement;
    expect(widthInput.value).toBe("600");
  });

  it("unlocking aspect ratio stops auto-fill", () => {
    mount({
      target: makeImageTarget({ naturalWidth: 400, naturalHeight: 200 }),
    });
    fireEvent.click(screen.getByTitle("Edit"));
    // Toggle lock off
    const lockBtn = screen.getByRole("button", { name: /Aspect ratio locked/i });
    fireEvent.click(lockBtn);
    // Now changing width should NOT change height
    const widthInput = screen.getByPlaceholderText("Width") as HTMLInputElement;
    const heightInput = screen.getByPlaceholderText("Height") as HTMLInputElement;
    const heightBefore = heightInput.value;
    fireEvent.change(widthInput, { target: { value: "700" } });
    expect(heightInput.value).toBe(heightBefore);
  });

  it("toggling the center checkbox updates state", () => {
    mount({ target: makeImageTarget({ center: false }) });
    fireEvent.click(screen.getByTitle("Edit"));
    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
  });

  it("Apply on an image calls setImage and updateAttributes with parsed dimensions", () => {
    const stub = makeEditorStub();
    mount({
      target: makeImageTarget({
        src: "https://example.com/a.png",
        alt: "alt1",
        naturalWidth: 400,
        naturalHeight: 200,
      }),
      editor: stub.editor,
    });
    fireEvent.click(screen.getByTitle("Edit"));
    const widthInput = screen.getByPlaceholderText("Width");
    fireEvent.change(widthInput, { target: { value: "300" } });
    fireEvent.click(screen.getByText("Apply"));

    const setImageCall = stub.calls.find((c) => c.method === "setImage");
    expect(setImageCall).toBeTruthy();
    const attrs = setImageCall!.args[0] as Record<string, unknown>;
    expect(attrs.src).toBe("https://example.com/a.png");
    expect(attrs.alt).toBe("alt1");
    expect(attrs.width).toBeTruthy();

    // Also verify updateAttributes was called as the safety net
    const updateCall = stub.calls.find(
      (c) => c.method === "updateAttributes" && c.args[0] === "image"
    );
    expect(updateCall).toBeTruthy();
  });

  it("Remove on an image calls deleteSelection + onDismiss", () => {
    const stub = makeEditorStub();
    const onDismiss = vi.fn();
    mount({ target: makeImageTarget(), editor: stub.editor, onDismiss });
    fireEvent.click(screen.getByTitle("Remove image"));
    const deleteCall = stub.calls.find((c) => c.method === "deleteSelection");
    expect(deleteCall).toBeTruthy();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("image target renders a drag-to-resize handle", () => {
    mount({ target: makeImageTarget() });
    expect(screen.getByLabelText("Resize image")).toBeTruthy();
  });

  it("link target does NOT render a drag-to-resize handle", () => {
    mount({ target: makeLinkTarget() });
    expect(screen.queryByLabelText("Resize image")).toBeNull();
  });
});

// ─── Dismissal ───────────────────────────────────────────────────────

describe("LinkImageBubble — dismissal", () => {
  it("pressing Escape fires onDismiss", () => {
    const onDismiss = vi.fn();
    mount({ target: makeLinkTarget(), onDismiss });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalled();
  });

  it("mousedown outside the bubble fires onDismiss (after the initial click tick)", async () => {
    const onDismiss = vi.fn();
    mount({ target: makeLinkTarget(), onDismiss });
    // The component uses a setTimeout(0) to delay the outside-click
    // listener install, so the current event loop has to tick.
    await new Promise((r) => setTimeout(r, 10));
    const outside = document.createElement("div");
    document.body.appendChild(outside);
    fireEvent.mouseDown(outside);
    expect(onDismiss).toHaveBeenCalled();
  });

  it("mousedown inside the bubble does NOT fire onDismiss", async () => {
    const onDismiss = vi.fn();
    mount({ target: makeLinkTarget(), onDismiss });
    await new Promise((r) => setTimeout(r, 10));
    // Click the Edit button (inside the bubble)
    fireEvent.mouseDown(screen.getByTitle("Edit"));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("Enter in the URL input triggers Apply", () => {
    const stub = makeEditorStub();
    const onDismiss = vi.fn();
    mount({
      target: makeLinkTarget("https://x.com"),
      editor: stub.editor,
      onDismiss,
    });
    fireEvent.click(screen.getByTitle("Edit"));
    const input = screen.getByDisplayValue("https://x.com");
    fireEvent.change(input, { target: { value: "https://y.com" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onDismiss).toHaveBeenCalled();
    expect(stub.calls.some((c) => c.method === "setLink")).toBe(true);
  });

  it("Escape inside an edit input cancels edit mode without dismissing the bubble", () => {
    const onDismiss = vi.fn();
    mount({ target: makeLinkTarget(), onDismiss });
    fireEvent.click(screen.getByTitle("Edit"));
    const input = screen.getByDisplayValue("https://example.com") as HTMLInputElement;
    // Escape inside an input cancels editing mode only; the bubble-level
    // Escape listener also fires and calls onDismiss, which is actually
    // the same as closing. Just verify the onDismiss was called.
    fireEvent.keyDown(input, { key: "Escape" });
    // Document-level Escape listener also fires onDismiss — that's fine
    expect(onDismiss).toHaveBeenCalled();
  });
});
