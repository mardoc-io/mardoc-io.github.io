/**
 * Selection resolution for HTML review (feature 033).
 *
 * Paired with `injectSourceLineAttributes`: the injector pre-tags
 * every element in the HTML source with `data-mardoc-line="N"`,
 * and this module walks from a selection endpoint up to the
 * nearest tagged ancestor to recover the source line.
 *
 * The logic runs in two places:
 *
 *   1. Unit-testable via jsdom (this file).
 *   2. Inside the review iframe itself, bundled into a string by
 *      `buildIframeSelectionScript` and injected into the
 *      sandboxed `srcdoc`. The script runs the same walk on the
 *      iframe's live DOM and postMessages the result to the
 *      parent app.
 *
 * Keep the script self-contained (no imports, no closures over
 * outside state) so it can be serialized into the srcdoc.
 */

export interface SourceLineRange {
  startLine: number;
  endLine: number;
}

/**
 * Walk up from a selection endpoint to the nearest ancestor
 * element carrying `data-mardoc-line`. Returns the combined line
 * range spanning both endpoints. Returns `null` if no tagged
 * ancestor exists for either endpoint (degraded input — the
 * caller should surface an error, not guess).
 */
export function resolveSelectionSourceLines(
  anchor: Node | null,
  focus: Node | null
): SourceLineRange | null {
  if (!anchor || !focus) return null;

  const anchorLine = findSourceLine(anchor);
  const focusLine = findSourceLine(focus);

  if (anchorLine === null || focusLine === null) return null;

  return {
    startLine: Math.min(anchorLine, focusLine),
    endLine: Math.max(anchorLine, focusLine),
  };
}

function findSourceLine(node: Node): number | null {
  let current: Node | null = node;
  while (current) {
    if (current.nodeType === 1 /* ELEMENT_NODE */) {
      const el = current as Element;
      const attr = el.getAttribute("data-mardoc-line");
      if (attr) {
        const parsed = parseInt(attr, 10);
        if (!isNaN(parsed)) return parsed;
      }
    }
    current = current.parentNode;
  }
  return null;
}

/**
 * Build the script string that runs inside the HTML review iframe.
 *
 * The script:
 *   1. Listens for `mouseup` and `selectionchange`
 *   2. Reads the current selection
 *   3. Walks anchor and focus up to the nearest tagged ancestor
 *   4. Posts `{type: "mardoc-html-selection", text, startLine, endLine}`
 *      back to the parent window
 *
 * The parent listens for this message in `DiffViewer` and flows the
 * selection into the same pending-comment pipeline that markdown
 * uses, so the inline comment lands on the correct source line.
 */
export function buildIframeSelectionScript(): string {
  return `
(function() {
  // If a previous install exists (HMR, re-renders, srcdoc refreshes),
  // abort its listeners before wiring new ones.
  if (window.__mardocHtmlSelectionAbort) {
    window.__mardocHtmlSelectionAbort.abort();
  }
  var controller = new AbortController();
  window.__mardocHtmlSelectionAbort = controller;

  function findLine(node) {
    var cur = node;
    while (cur) {
      if (cur.nodeType === 1 && cur.getAttribute) {
        var attr = cur.getAttribute('data-mardoc-line');
        if (attr) {
          var n = parseInt(attr, 10);
          if (!isNaN(n)) return n;
        }
      }
      cur = cur.parentNode;
    }
    return null;
  }

  function postSelection() {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    var text = sel.toString();
    if (!text || !text.trim()) return;

    var anchorLine = findLine(sel.anchorNode);
    var focusLine = findLine(sel.focusNode);
    if (anchorLine === null || focusLine === null) return;

    var startLine = Math.min(anchorLine, focusLine);
    var endLine = Math.max(anchorLine, focusLine);

    window.parent.postMessage({
      type: 'mardoc-html-selection',
      text: text,
      startLine: startLine,
      endLine: endLine
    }, '*');
  }

  // Fire on mouseup (end of drag) and touchend (mobile) — not on
  // selectionchange because it fires too often during drag.
  document.addEventListener('mouseup', function() {
    setTimeout(postSelection, 0);
  }, { signal: controller.signal });
  document.addEventListener('touchend', function() {
    setTimeout(postSelection, 0);
  }, { signal: controller.signal });
})();
`;
}
