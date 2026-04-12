/**
 * Pure text-manipulation helpers for the markdown toolbar.
 *
 * Both of the textarea-based editing surfaces in MarDoc — the code
 * view in the Editor and the suggest-mode block editor in
 * DiffViewer — need to support hotkey-driven formatting. The actual
 * string transforms live here so they can be unit-tested in
 * isolation and shared between both surfaces.
 *
 * Every function takes the full text, the current selection range,
 * and returns the new text plus the new selection range.
 */

export interface FormatResult {
  text: string;
  selStart: number;
  selEnd: number;
}

/**
 * Wrap the selected range with a prefix + suffix. If nothing is
 * selected, insert a "text" placeholder so the user can immediately
 * type over it.
 */
export function applyWrap(
  text: string,
  selStart: number,
  selEnd: number,
  prefix: string,
  suffix: string
): FormatResult {
  const before = text.slice(0, selStart);
  const selected = text.slice(selStart, selEnd);
  const after = text.slice(selEnd);

  if (selected) {
    const newText = before + prefix + selected + suffix + after;
    return {
      text: newText,
      selStart: selStart + prefix.length,
      selEnd: selEnd + prefix.length,
    };
  }
  // No selection — insert placeholder
  const placeholder = "text";
  const newText = before + prefix + placeholder + suffix + after;
  return {
    text: newText,
    selStart: selStart + prefix.length,
    selEnd: selStart + prefix.length + placeholder.length,
  };
}

/**
 * Add (or toggle off) a line prefix on the line(s) covered by the
 * selection. Used for headings, bullet lists, blockquotes, etc.
 * If the line already starts with the prefix, remove it.
 */
export function applyLinePrefix(
  text: string,
  selStart: number,
  selEnd: number,
  prefix: string
): FormatResult {
  // Find start of current line
  const lineStart = text.lastIndexOf("\n", selStart - 1) + 1;
  const lineEnd = text.indexOf("\n", selEnd);
  const actualEnd = lineEnd === -1 ? text.length : lineEnd;

  const before = text.slice(0, lineStart);
  const line = text.slice(lineStart, actualEnd);
  const after = text.slice(actualEnd);

  // Toggle: if line already starts with prefix, remove it
  if (line.startsWith(prefix)) {
    const newText = before + line.slice(prefix.length) + after;
    return {
      text: newText,
      selStart: Math.max(lineStart, selStart - prefix.length),
      selEnd: selEnd - prefix.length,
    };
  }

  const newText = before + prefix + line + after;
  return {
    text: newText,
    selStart: selStart + prefix.length,
    selEnd: selEnd + prefix.length,
  };
}

/**
 * Wrap the selection in a fenced code block. If nothing is selected,
 * insert an empty block with the cursor placed between the fences.
 */
export function applyCodeBlock(
  text: string,
  selStart: number,
  selEnd: number
): FormatResult {
  const selected = text.slice(selStart, selEnd);
  const before = text.slice(0, selStart);
  const after = text.slice(selEnd);
  if (selected) {
    const newText = before + "```\n" + selected + "\n```" + after;
    return {
      text: newText,
      selStart: selStart + 4,
      selEnd: selStart + 4 + selected.length,
    };
  }
  const newText = before + "```\n\n```" + after;
  return { text: newText, selStart: selStart + 4, selEnd: selStart + 4 };
}

/**
 * Insert a horizontal rule at the selection point. Current selection
 * is discarded if any.
 */
export function applyHorizontalRule(
  text: string,
  selStart: number,
  selEnd: number
): FormatResult {
  const before = text.slice(0, selStart);
  const after = text.slice(selEnd);
  const newText = before + "\n---\n" + after;
  return { text: newText, selStart: selStart + 5, selEnd: selStart + 5 };
}

/**
 * Insert a markdown link. If text is selected, wrap it as the link
 * text and place the cursor on "url". If nothing is selected, insert
 * a "[text](url)" placeholder with "text" selected.
 */
export function applyLink(
  text: string,
  selStart: number,
  selEnd: number
): FormatResult {
  const selected = text.slice(selStart, selEnd);
  const before = text.slice(0, selStart);
  const after = text.slice(selEnd);
  if (selected) {
    const newText = before + "[" + selected + "](url)" + after;
    const urlStart = selStart + selected.length + 3;
    return { text: newText, selStart: urlStart, selEnd: urlStart + 3 };
  }
  const newText = before + "[text](url)" + after;
  return { text: newText, selStart: selStart + 1, selEnd: selStart + 5 };
}
