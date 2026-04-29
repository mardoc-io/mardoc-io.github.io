/**
 * Inject <mark> highlights into HTML by matching against text content,
 * not raw HTML. Uses DOMParser so tag boundaries and entities are
 * handled by the browser, not by us.
 */

export interface CommentHighlight {
  selectedText: string;
  commentId: string;
}

/**
 * Collect all text nodes under a root in document order.
 */
function collectTextNodes(root: Node): Text[] {
  const nodes: Text[] = [];
  const walker = root.ownerDocument!.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    nodes.push(node);
  }
  return nodes;
}

/**
 * Find a selectedText match across one or more adjacent text nodes.
 * Returns the text nodes involved and the start/end offsets within
 * the first and last node.
 */
function findTextAcrossNodes(
  textNodes: Text[],
  searchText: string
): { nodes: Text[]; startOffset: number; endOffset: number } | null {
  // Build a concatenated string with node boundaries tracked
  const segments: { node: Text; start: number; end: number }[] = [];
  let pos = 0;
  for (const node of textNodes) {
    const len = node.textContent?.length ?? 0;
    segments.push({ node, start: pos, end: pos + len });
    pos += len;
  }

  const fullText = textNodes.map((n) => n.textContent ?? "").join("");
  const idx = fullText.indexOf(searchText);
  if (idx === -1) return null;

  const matchEnd = idx + searchText.length;

  // Find which text nodes the match spans
  const involved: Text[] = [];
  let startOffset = 0;
  let endOffset = 0;

  for (const seg of segments) {
    if (seg.end <= idx) continue;
    if (seg.start >= matchEnd) break;

    involved.push(seg.node);
    if (involved.length === 1) {
      startOffset = idx - seg.start;
    }
    endOffset = matchEnd - seg.start;
  }

  if (involved.length === 0) return null;
  return { nodes: involved, startOffset, endOffset };
}

export function injectCommentHighlights(
  html: string,
  comments: CommentHighlight[]
): string {
  if (comments.length === 0 || typeof DOMParser === "undefined") return html;

  const doc = new DOMParser().parseFromString(html, "text/html");
  let changed = false;

  for (const c of comments) {
    if (!c.selectedText) continue;

    const textNodes = collectTextNodes(doc.body);
    const match = findTextAcrossNodes(textNodes, c.selectedText);
    if (!match) continue;

    if (match.nodes.length === 1) {
      // Simple case: match is within a single text node
      const node = match.nodes[0];
      const range = doc.createRange();
      range.setStart(node, match.startOffset);
      range.setEnd(node, match.startOffset + c.selectedText.length);

      const mark = doc.createElement("mark");
      mark.className = "selection-comment-highlight";
      mark.setAttribute("data-comment-id", c.commentId);
      range.surroundContents(mark);
    } else {
      // Cross-tag case: wrap the matched portion in each text node
      for (let i = 0; i < match.nodes.length; i++) {
        const node = match.nodes[i];
        const nodeLen = node.textContent?.length ?? 0;
        const start = i === 0 ? match.startOffset : 0;
        const end = i === match.nodes.length - 1 ? match.endOffset : nodeLen;

        const range = doc.createRange();
        range.setStart(node, start);
        range.setEnd(node, end);

        const mark = doc.createElement("mark");
        mark.className = "selection-comment-highlight";
        mark.setAttribute("data-comment-id", c.commentId);
        range.surroundContents(mark);
      }
    }

    changed = true;
  }

  return changed ? doc.body.innerHTML : html;
}
