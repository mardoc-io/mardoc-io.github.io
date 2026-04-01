# 009: Document Link Navigation

## Value
Clicking links in rendered markdown does something useful instead of breaking or going nowhere. Relative links navigate within MarDoc, anchor links jump to headings, and external links open in a new tab. Makes the rendered view behave like a real document reader.

## Suggested Breakdown

### 009a: Anchor links (same-document)
- Clicking `[section](#heading-name)` scrolls to that heading within the current file
- Headings need `id` attributes generated from their text (standard slug rules: lowercase, hyphens, strip special chars)
- Works in all rendered views (Editor, Diff, Side by Side, Final)

### 009b: Relative links (cross-document)
- Clicking `[design doc](../design/architecture.md)` navigates to that file within MarDoc
- Resolve relative paths against the current file's location in the repo tree
- Triggers file load via existing `openFile()` flow
- If the target file doesn't exist in the tree, show an error toast rather than failing silently
- Works with 007 (URL routing) if implemented — navigation updates the hash

### 009c: External links
- Clicking `https://...` links opens in a new browser tab (`target="_blank"`, `rel="noopener"`)
- Should already mostly work but needs explicit handling to prevent MarDoc from trying to intercept them

## Acceptance Criteria
- All three link types work in all rendered views
- No link click causes a full page navigation away from MarDoc
- Relative links that point to non-markdown files (images, PDFs) fall back to opening on GitHub

## Dependencies
- 007 (URL Routing) — not required, but if present, cross-document navigation should update the hash

## Implementation Notes
- TipTap's Link extension likely handles click events — need to intercept and route based on link type
- Non-TipTap rendered views (DiffViewer HTML) need a click handler on `<a>` tags that classifies and routes
- Relative path resolution: given current file path and link href, compute the target path in the repo tree
- Anchor slug generation should match GitHub's algorithm for compatibility (GFM heading IDs)
