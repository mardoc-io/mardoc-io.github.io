# 033 — Inline Comments on HTML Files

## Value

The README pitches "markdown **and HTML**" as first-class review surfaces, but today only markdown supports the select-a-passage / leave-a-comment / post-back-to-GitHub flow. HTML files render beautifully in the DiffViewer iframe (shipped in feature 031), but reviewers can't highlight a sentence and leave feedback on it. That breaks the core promise of the product for the entire class of AI-generated HTML documents — research reports, cost analyses, architecture write-ups — that teams want to review.

This is the #1 gap in HTML parity. Ship this and the README's "markdown and HTML" claim becomes load-bearing.

## Acceptance Criteria

- [ ] User can select text inside the rendered HTML iframe and the selection is captured by the parent app
- [ ] Selection triggers the existing comment-input flow (same affordance as markdown)
- [ ] Comment is tied to a line range in the HTML *source* file (1-indexed, matches what `pulls.createReview` expects)
- [ ] Comment posts back to GitHub as an inline review comment on the PR
- [ ] Existing comments on an HTML file render as pins/highlights over the rendered iframe
- [ ] Clicking a comment pin scrolls to and highlights the target passage
- [ ] Comment threads (reply, resolve) work the same as markdown
- [ ] Batched-review submission (single GitHub API call for N queued comments) works for HTML
- [ ] A regression test proves selection-to-line-range works on a realistic HTML document
- [ ] README acceptance test (`readme-claims.test.ts`) for the HTML path is added and green

## Dependencies

- **031 — HTML Document Rendering** (shipped): HTML files render in a sandboxed iframe via `HtmlViewer` and in `DiffViewer` rendered-mode.
- **Markdown inline comment infrastructure** (shipped): `mapSelectionToLines`, `mergeFreshComments`, the pending-review queue, and the submission batching all live in `github-api.ts` / `PRDetail.tsx`.

## Implementation Notes

### The cross-iframe selection problem

HTML renders in a sandboxed `<iframe srcdoc sandbox="allow-scripts">`. `window.getSelection()` in the parent does NOT see selections inside the iframe — they live on the iframe's own `document`. Three options:

1. **Parent polls `iframe.contentWindow.getSelection()`** on mouse events bubbled out from inside. Requires sandbox flag `allow-same-origin` (breaks the current security story — the iframe could then access parent localStorage and the GitHub token).
2. **Inject a script into the iframe** (via `srcdoc`) that listens for selection/mouseup inside and `postMessage`s the selected text + offsets back to the parent. Keeps the sandbox locked down. This is the right path.
3. **Abandon iframe rendering for HTML review mode** and inline the sanitized HTML directly into the parent DOM. Loses custom CSS isolation and any embedded scripts. Non-starter for AI-generated reports that rely on their own styles.

**Decision: option 2.** The `HtmlViewer` already injects a resize script via `srcdoc` — extend that pattern with a selection-listener script.

### Selection → source-line-range mapping

The reviewer selects text in the *rendered* HTML, but the comment must be tied to lines in the HTML *source* file. Two challenges:

1. **Rendered text ≠ source text.** Whitespace collapses, attributes disappear, comments are invisible.
2. **The same visible text can appear in multiple source locations** (common in boilerplate-heavy HTML).

Approach: mirror the markdown `mapSelectionToLines` fuzzy-match fallback. The injected iframe script reports (a) the selected text and (b) the text content of a reasonable contextual window (say, ±100 chars). The parent runs a fuzzy match against the HTML source string and picks the best source-line match. If no match, fall back to the containing block (nearest element with a `data-line` attribute, if we pre-process the source to inject line markers).

**Alternative considered:** pre-process the HTML source to inject `data-source-line="N"` attributes on every element before rendering, then the iframe script reports the nearest ancestor's `data-source-line`. Cleaner and deterministic, but requires an HTML parser (cheerio or a lightweight DOM walker) in the browser. Probably the right answer — more reliable than text fuzzy matching.

**Recommended path:** attribute injection. Write a small pass that walks the HTML source string, assigns a `data-mardoc-line` attribute to every element with a meaningful text payload, and records the source-line mapping in a side table. The iframe script reports the nearest ancestor's `data-mardoc-line`. The parent looks up the source line from the side table and passes it to the existing comment-submission flow.

### Comment rendering (pins / highlights)

Two sub-problems:

1. **Render existing comments over the iframe.** The iframe can't be decorated from the parent, so the injected script must paint them. Pass the comment list in via `postMessage` after load; the script walks the DOM, finds the target elements (by `data-mardoc-line`), and overlays a pin or background highlight.
2. **Click-to-scroll and click-to-activate.** The script listens for clicks on its own pins and `postMessage`s the comment ID back to the parent, which activates the thread in the side panel.

### Batching and submission

Nothing here needs to change. Pending comments get queued in the same `PRComment[]` structure with `pending: true`. The existing single-review-per-submission flow (`submitPendingReview` in `PRDetail.tsx`) handles HTML and markdown indistinguishably once the line range is computed.

### Tests to add (test-first, red → green)

1. **`src/__tests__/html-source-lines.test.ts`** (new) — unit tests for the attribute-injection pass:
   - Single element → `data-mardoc-line=1`
   - Nested elements → each gets the line of its opening tag
   - Multi-line source → attributes match 1-indexed source lines
   - Self-closing tags, void elements, comments handled correctly
   - Side table maps each injected ID back to a line range
2. **`src/__tests__/html-selection-mapping.test.ts`** (new) — given (a) an HTML source, (b) a "nearest ancestor line" reported from the iframe, returns a `{startLine, endLine}` that matches what `computeBlockLineRanges` would return for the equivalent markdown.
3. **`src/__tests__/readme-claims.test.ts`** (extend) — new `describe` block: "README claim: same flow for HTML files" — walks the same invariants (select, line range, inline comment) against an HTML fixture.
4. **Iframe-integration test** (deferred — requires jsdom iframe support which vitest has limited coverage for; start with the unit tests above and validate the postMessage wiring in manual QA).

### Out of scope for this story

- WYSIWYG editing of HTML (separate story)
- Word-level prose diff on HTML (separate story)
- Suggestion round-trip for HTML (separate story)
- Changing the iframe sandbox flags (we keep `allow-scripts` only)

## Open questions

- Does `data-mardoc-line` survive the iframe's own CSS selectors / JS? It's a custom data attribute — should be inert, but verify with a test fixture that uses `querySelectorAll("*")`.
- How do we handle HTML documents that embed markdown-rendered regions (via JS) or load content dynamically at runtime? Probably just scope this story to static HTML source; dynamic content is a known limitation.
- Do we need to escape the comment text when rendering pin tooltips inside the iframe? Yes — the injected script must HTML-escape all user-supplied strings.

## Related follow-on stories (HTML parity track)

- **034 — Word-level prose diff for HTML** (extend `computeWordDiff` to HTML source, accounting for tag boundaries)
- **035 — WYSIWYG editing of HTML files** (TipTap is HTML-native, so this is mostly plumbing — route `.html` through Editor with a raw-HTML round-trip path instead of Turndown)
- **036 — Suggestion round-trip for HTML** (how does a GitHub "suggestion" block wrap HTML? Test nested code fences inside `<pre>` blocks)
