"use client";

import React, { useCallback } from "react";
import {
  Heading1,
  Heading2,
  Heading3,
  Bold,
  Italic,
  Strikethrough,
  Code,
  Link,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  FileCode,
  Minus,
  Highlighter,
} from "lucide-react";
import {
  applyWrap,
  applyLinePrefix,
  applyCodeBlock,
  applyHorizontalRule,
  applyLink,
  type FormatResult,
} from "@/lib/markdown-format";

export interface FormatAction {
  icon: React.ReactNode;
  label: string;
  hotkey?: string;
  apply: (text: string, selStart: number, selEnd: number) => FormatResult;
}

// Group 1: Headings
const HEADING_ACTIONS: FormatAction[] = [
  {
    icon: <Heading1 size={15} />, label: "Heading 1",
    apply: (t, s, e) => applyLinePrefix(t, s, e, "# "),
  },
  {
    icon: <Heading2 size={15} />, label: "Heading 2",
    apply: (t, s, e) => applyLinePrefix(t, s, e, "## "),
  },
  {
    icon: <Heading3 size={15} />, label: "Heading 3",
    apply: (t, s, e) => applyLinePrefix(t, s, e, "### "),
  },
];

// Group 2: Inline formatting
const INLINE_ACTIONS: FormatAction[] = [
  {
    icon: <Bold size={15} />, label: "Bold", hotkey: "b",
    apply: (t, s, e) => applyWrap(t, s, e, "**", "**"),
  },
  {
    icon: <Italic size={15} />, label: "Italic", hotkey: "i",
    apply: (t, s, e) => applyWrap(t, s, e, "_", "_"),
  },
  {
    icon: <Strikethrough size={15} />, label: "Strikethrough",
    apply: (t, s, e) => applyWrap(t, s, e, "~~", "~~"),
  },
  {
    icon: <Code size={15} />, label: "Inline Code", hotkey: "e",
    apply: (t, s, e) => applyWrap(t, s, e, "`", "`"),
  },
  {
    icon: <Highlighter size={15} />, label: "Highlight",
    apply: (t, s, e) => applyWrap(t, s, e, "==", "=="),
  },
];

// Group 3: Lists
const LIST_ACTIONS: FormatAction[] = [
  {
    icon: <List size={15} />, label: "Bullet List",
    apply: (t, s, e) => applyLinePrefix(t, s, e, "- "),
  },
  {
    icon: <ListOrdered size={15} />, label: "Numbered List",
    apply: (t, s, e) => applyLinePrefix(t, s, e, "1. "),
  },
  {
    icon: <CheckSquare size={15} />, label: "Task List",
    apply: (t, s, e) => applyLinePrefix(t, s, e, "- [ ] "),
  },
];

// Group 4: Block elements
const BLOCK_ACTIONS: FormatAction[] = [
  {
    icon: <Quote size={15} />, label: "Blockquote",
    apply: (t, s, e) => applyLinePrefix(t, s, e, "> "),
  },
  {
    icon: <FileCode size={15} />, label: "Code Block",
    apply: (t, s, e) => applyCodeBlock(t, s, e),
  },
  {
    icon: <Minus size={15} />, label: "Horizontal Rule",
    apply: (t, s, e) => applyHorizontalRule(t, s, e),
  },
];

// Group 5: Link
const LINK_ACTIONS: FormatAction[] = [
  {
    icon: <Link size={15} />, label: "Add Link", hotkey: "k",
    apply: (t, s, e) => applyLink(t, s, e),
  },
];

/** All actions flat for hotkey lookup. */
export const ALL_FORMAT_ACTIONS: FormatAction[] = [
  ...HEADING_ACTIONS,
  ...INLINE_ACTIONS,
  ...LIST_ACTIONS,
  ...BLOCK_ACTIONS,
  ...LINK_ACTIONS,
];

function ToolbarDivider() {
  return <div className="w-px h-5 bg-[var(--border)] mx-1" />;
}

export interface MarkdownToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  text: string;
  onTextChange: (text: string) => void;
}

export default function MarkdownToolbar({
  textareaRef,
  text,
  onTextChange,
}: MarkdownToolbarProps) {
  const applyAction = useCallback(
    (action: FormatAction) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const { selectionStart, selectionEnd } = textarea;
      const result = action.apply(text, selectionStart, selectionEnd);
      onTextChange(result.text);

      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(result.selStart, result.selEnd);
      });
    },
    [textareaRef, text, onTextChange]
  );

  const renderGroup = (actions: FormatAction[]) =>
    actions.map((action) => (
      <button
        key={action.label}
        onClick={(e) => { e.preventDefault(); applyAction(action); }}
        title={`${action.label}${action.hotkey ? ` (⌘${action.hotkey.toUpperCase()})` : ""}`}
        className="toolbar-btn"
      >
        {action.icon}
      </button>
    ));

  return (
    <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-[var(--accent)] bg-[var(--surface)]">
      {renderGroup(HEADING_ACTIONS)}
      <ToolbarDivider />
      {renderGroup(INLINE_ACTIONS)}
      <ToolbarDivider />
      {renderGroup(LIST_ACTIONS)}
      <ToolbarDivider />
      {renderGroup(BLOCK_ACTIONS)}
      <ToolbarDivider />
      {renderGroup(LINK_ACTIONS)}
    </div>
  );
}
