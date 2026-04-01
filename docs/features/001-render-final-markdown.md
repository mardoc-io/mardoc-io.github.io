# 001: Render Final Markdown View with Comments

## Value
Users can view the final rendered markdown (head version only, no diff) for PR files, with full commenting ability. Currently the PR view only offers "Rendered Diff" and "Side by Side" — there's no clean read-through of the final document.

## Acceptance Criteria
- New view mode alongside "Rendered Diff" and "Side by Side" (e.g. "Final" or "Rendered")
- Shows only the head content rendered as markdown — no diff highlighting, no base content
- Full commenting support: select text, add comments, view in side panel
- Comments map to line numbers in the head content for GitHub API integration

## Implementation Notes
- Add a third `viewMode` option in DiffViewer
- Reuse existing `headBlockToHtml` rendering and comment infrastructure
- Simpler than diff view — just render `file.headContent` as a single document
