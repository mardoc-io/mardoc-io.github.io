# 039 — Per-File Comment Filtering & Highlight Accuracy

## Value

When viewing a file in a PR, the comment panel and inline highlights show comments from **all files in the PR**, not just the current file. This creates noise (irrelevant comments cluttering the sidebar), false highlights (text matches from other files' comments lighting up in the current file), and broken click-to-go (clicking a cross-file highlight selects a comment whose context doesn't exist here). The result is a confusing review experience that gets worse as PR size grows.

Fixing this makes the per-file review feel focused and trustworthy — comments belong to what you're looking at.

## Bugs

### Bug 1: Comment panel shows all PR comments regardless of selected file

**Symptom:** Open a PR with comments on multiple files. Switch between files — the sidebar always shows the same full set of comments.

**Root cause:** `PRComment` has no `path` field. `fetchPRComments()` (`github-api.ts:447-467`) maps review comments from the GitHub API but drops `c.path`. `DiffViewer.tsx:450-468` builds `allPanelComments` from the full unfiltered array.

**Files:**
- `src/types/index.ts` — `PRComment` interface (missing `path`)
- `src/lib/github-api.ts` — `fetchPRComments()` (drops `c.path`)
- `src/components/DiffViewer.tsx` — `allPanelComments` memo (no file filter)

### Bug 2: Highlights appear from other files' comments

**Symptom:** A file shows yellow comment highlights on text that was never commented on — the highlighted text matches `selectedText` from a comment on a different file.

**Root cause:** `renderBlockHtml()` (`DiffViewer.tsx:797-841`) searches ALL unresolved comments' `selectedText` against the current file's HTML. Cross-file matches produce spurious `<mark>` tags.

**Files:**
- `src/components/DiffViewer.tsx` — `renderBlockHtml()` callback

### Bug 3: Click-to-go navigates to wrong or missing context

**Symptom:** Clicking a highlight or a comment in the panel may: (a) select a comment from another file, or (b) fail to scroll because the comment's `selectedText` doesn't exist in the current file's DOM.

**Root cause:** Downstream of bugs 1 & 2 — once comments are filtered correctly, the existing `handleCommentSelect` and `handleMarkClick` logic works.

## Acceptance Criteria

- [x] `PRComment` type includes a `path` field
- [x] `fetchPRComments()` populates `path` from the GitHub review comment's `.path` property
- [x] Issue comments (no file path from GitHub) excluded from per-file view (Option A)
- [x] `allPanelComments` in `DiffViewer` filters to comments matching the current `file.path` (plus locally-pending comments for the current file)
- [x] Comment count badge in the DiffViewer toolbar reflects per-file count, not PR-wide
- [x] Comment count in the PR header (`PRDetail.tsx:489`) continues to show PR-wide count
- [x] `renderBlockHtml()` only injects highlights for the current file's comments
- [x] Clicking a highlight opens the correct comment in the panel
- [x] Clicking a comment in the panel scrolls to the correct mark in the diff
- [x] All five markdown view modes work: Inline Diff, Split, Suggest, Preview
- [x] Both HTML view modes work: Rendered, Source Diff
- [x] Mobile bottom sheet shows per-file comments (same filtering)
- [x] Switching files updates the comment panel immediately
- [x] Pending (not yet submitted) comments appear only on their originating file

## Implementation Plan

### 1. Add `path` to `PRComment` type
`src/types/index.ts` — add `path?: string` to the interface.

### 2. Populate `path` in `fetchPRComments()`
`src/lib/github-api.ts:447` — add `path: c.path` to the review comment mapping. Issue comments (`ic-*`) get no path (they're PR-level).

### 3. Filter comments in `DiffViewer`
`src/components/DiffViewer.tsx` — change the `allPanelComments` memo to filter `comments` by matching `file.path`:
- Review comments (`rc-*`): include if `comment.path === file.path`
- Pending comments: include if `comment.pendingPath === file.path`
- Issue comments (`ic-*`, no path): exclude from per-file view (or show under a separator)

### 4. Verify downstream consumers
`renderBlockHtml`, `handleCommentSelect`, comment count badge, mobile BottomSheet — all derive from `allPanelComments`, so filtering at the source fixes them all.

### 5. Handle general PR comments
Issue comments have no file association. Options:
- **Option A:** Show them only in the PR header comment count, not in per-file panels. Simplest.
- **Option B:** Add a "General" section at the bottom of the panel. More complete but adds UI complexity.

Recommend Option A for now — ship and iterate.

### 6. Tests
- Unit test for `fetchPRComments` path population (mock Octokit response with `path` field)
- Unit test for comment filtering logic (given comments across 3 files, verify only matching ones appear)
- Manual test across all view modes with a multi-file PR

## Files to Change

| File | Change |
|------|--------|
| `src/types/index.ts` | Add `path?: string` to `PRComment` |
| `src/lib/github-api.ts` | Set `path: c.path` in review comment mapping |
| `src/components/DiffViewer.tsx` | Filter `allPanelComments` by `file.path` |
| `src/lib/comment-merge.ts` | Preserve `path` field during merge (verify) |
