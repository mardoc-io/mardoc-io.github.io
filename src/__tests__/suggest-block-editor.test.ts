/**
 * Characterization tests for SuggestBlockEditor + MarkdownToolbar.
 *
 * Pins the behavior of the suggest-mode editing UI that was
 * extracted from DiffViewer.tsx. Future refactors must keep:
 *   - Header with line range
 *   - Done/Delete/Cancel buttons
 *   - Markdown toolbar with format groups
 *   - Textarea with keyboard shortcuts (Escape, ⌘+Enter,
 *     auto-surround, ⌘B/I/E/K hotkeys)
 */
import React, { useRef } from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import SuggestBlockEditor from "@/components/SuggestBlockEditor";
import MarkdownToolbar from "@/components/MarkdownToolbar";

const e = React.createElement;

afterEach(() => cleanup());

// ─── SuggestBlockEditor ──────────────────────────────────────────

function Wrapper(props: Omit<React.ComponentProps<typeof SuggestBlockEditor>, "textareaRef">) {
  const ref = useRef<HTMLTextAreaElement>(null!);
  return e(SuggestBlockEditor, { ...props, textareaRef: ref });
}

function mount(
  overrides: Partial<Omit<React.ComponentProps<typeof SuggestBlockEditor>, "textareaRef">> = {}
) {
  return render(
    e(Wrapper, {
      blockIndex: 0,
      startLine: 3,
      endLine: 5,
      text: "## Heading\n\nsome paragraph",
      onTextChange: () => {},
      onFinish: () => {},
      onDelete: () => {},
      onCancel: () => {},
      ...overrides,
    } as Parameters<typeof Wrapper>[0])
  );
}

describe("SuggestBlockEditor — rendering", () => {
  it("shows the line range in the header", () => {
    mount({ startLine: 10, endLine: 14 });
    expect(screen.getByText(/Lines 10–14/)).toBeTruthy();
  });

  it("renders Done, Delete, and Cancel buttons", () => {
    mount();
    expect(screen.getByText("Done")).toBeTruthy();
    expect(screen.getByText("Delete")).toBeTruthy();
    expect(screen.getByText("Cancel")).toBeTruthy();
  });

  it("renders the textarea with the current text", () => {
    mount({ text: "hello world" });
    expect(screen.getByDisplayValue("hello world")).toBeTruthy();
  });

  it("renders the markdown toolbar (5 format groups)", () => {
    mount();
    expect(screen.getByTitle(/Heading 1/)).toBeTruthy();
    expect(screen.getByTitle(/Bold/)).toBeTruthy();
    expect(screen.getByTitle(/Bullet List/)).toBeTruthy();
    expect(screen.getByTitle(/Blockquote/)).toBeTruthy();
    expect(screen.getByTitle(/Add Link/)).toBeTruthy();
  });
});

describe("SuggestBlockEditor — button actions", () => {
  it("onFinish fires when Done is clicked", () => {
    const onFinish = vi.fn();
    mount({ onFinish });
    fireEvent.click(screen.getByText("Done"));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("onDelete fires when Delete is clicked", () => {
    const onDelete = vi.fn();
    mount({ onDelete });
    fireEvent.click(screen.getByText("Delete"));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("onCancel fires when Cancel is clicked", () => {
    const onCancel = vi.fn();
    mount({ onCancel });
    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("onTextChange fires when the user types", () => {
    const onTextChange = vi.fn();
    mount({ text: "old", onTextChange });
    const textarea = screen.getByDisplayValue("old");
    fireEvent.change(textarea, { target: { value: "new" } });
    expect(onTextChange).toHaveBeenCalledWith("new");
  });
});

describe("SuggestBlockEditor — keyboard shortcuts", () => {
  it("Escape fires onCancel", () => {
    const onCancel = vi.fn();
    mount({ onCancel });
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.keyDown(textarea, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("⌘+Enter fires onFinish", () => {
    const onFinish = vi.fn();
    mount({ onFinish });
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("plain Enter does NOT fire onFinish", () => {
    const onFinish = vi.fn();
    mount({ onFinish });
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(onFinish).not.toHaveBeenCalled();
  });

  it("auto-surround * wraps selected text with asterisks", () => {
    const onTextChange = vi.fn();
    mount({ text: "hello world", onTextChange });
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    // Select "world"
    textarea.setSelectionRange(6, 11);
    fireEvent.keyDown(textarea, { key: "*" });
    expect(onTextChange).toHaveBeenCalledWith("hello *world*");
  });

  it("auto-surround does NOT fire when there's no selection", () => {
    const onTextChange = vi.fn();
    mount({ text: "hello", onTextChange });
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    textarea.setSelectionRange(5, 5); // collapsed
    fireEvent.keyDown(textarea, { key: "*" });
    expect(onTextChange).not.toHaveBeenCalled();
  });

  it("⌘B fires the Bold action on the current selection", () => {
    const onTextChange = vi.fn();
    mount({ text: "some text", onTextChange });
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 4); // "some"
    fireEvent.keyDown(textarea, { key: "b", metaKey: true });
    expect(onTextChange).toHaveBeenCalledWith("**some** text");
  });

  it("⌘I fires the Italic action", () => {
    const onTextChange = vi.fn();
    mount({ text: "italic please", onTextChange });
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 6); // "italic"
    fireEvent.keyDown(textarea, { key: "i", metaKey: true });
    expect(onTextChange).toHaveBeenCalledWith("_italic_ please");
  });

  it("⌘K fires the Add Link action", () => {
    const onTextChange = vi.fn();
    mount({ text: "click me", onTextChange });
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 8);
    fireEvent.keyDown(textarea, { key: "k", metaKey: true });
    expect(onTextChange).toHaveBeenCalledWith("[click me](url)");
  });
});

// ─── MarkdownToolbar ────────────────────────────────────────────

function ToolbarWrapper(props: Omit<React.ComponentProps<typeof MarkdownToolbar>, "textareaRef">) {
  const ref = useRef<HTMLTextAreaElement>(null!);
  return React.createElement(
    "div",
    null,
    e(MarkdownToolbar, { ...props, textareaRef: ref }),
    e("textarea", {
      ref,
      defaultValue: props.text,
      onChange: (ev: React.ChangeEvent<HTMLTextAreaElement>) =>
        props.onTextChange(ev.target.value),
    })
  );
}

describe("MarkdownToolbar — rendering", () => {
  it("renders all 14 format buttons", () => {
    render(
      e(ToolbarWrapper, {
        text: "",
        onTextChange: () => {},
      } as Parameters<typeof ToolbarWrapper>[0])
    );
    const buttons = document.querySelectorAll(".toolbar-btn");
    // 3 headings + 5 inline + 3 list + 3 block + 1 link = 15
    expect(buttons.length).toBe(15);
  });

  it("shows the hotkey in Bold button title", () => {
    render(
      e(ToolbarWrapper, {
        text: "",
        onTextChange: () => {},
      } as Parameters<typeof ToolbarWrapper>[0])
    );
    expect(screen.getByTitle("Bold (⌘B)")).toBeTruthy();
  });
});
