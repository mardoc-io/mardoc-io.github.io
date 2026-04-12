# 022 — Mermaid Round-Trip Preservation

## Value

Mermaid code blocks are converted to `<img src="blob:...">` during initial render by `preRenderMermaid`. This destroys the original mermaid source. When converting to code view, Turndown outputs `![Mermaid diagram](blob:https://mardoc.app/...)` — an ephemeral URL with no mermaid syntax. The diagram source is permanently lost. Toggling back to rich view then shows a broken image.

This makes mermaid diagrams non-editable through the code view and breaks commits that include mermaid blocks.

## Acceptance Criteria

- [ ] Mermaid source is preserved through the full round-trip: markdown → HTML → TipTap → Turndown → markdown
- [ ] Code view shows the original fenced mermaid code block, not a blob URL image
- [ ] Toggling from code view back to rich view re-renders the mermaid diagram
- [ ] Committing a file with mermaid blocks produces correct markdown (fenced code blocks, not image tags)
- [ ] New mermaid blocks added in code view render on toggle back to rich view

## Dependencies

None

## Implementation Notes

**Root cause:** `preRenderMermaid` (mermaid.ts line 53-56) creates a blob URL `<img>` and replaces the `<pre>` block. The original source is discarded.

**Fix — two parts:**

1. **Preserve source on the `<img>`:** In `preRenderMermaid`, store the original mermaid source in a data attribute:
   ```typescript
   img.setAttribute("data-mermaid-source", source);
   ```

2. **Turndown rule to restore fenced blocks:** Add a custom Turndown rule in `turndown.ts` that matches `<img>` tags with `data-mermaid-source` and converts them back to:
   ````
   ```mermaid
   {source}
   ```
   ````

3. **Re-render on code view toggle:** Make `toggleCodeView` async — when switching back from code view, run `preRenderMermaid()` on the Showdown HTML before calling `setContent`.
