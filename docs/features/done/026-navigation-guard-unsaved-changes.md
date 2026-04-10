# 026 — Unsaved Changes Navigation Guard

## Value

Users can lose edits by clicking a different file or PR with no warning. There's no visual indicator that the current document has unsaved changes, and no confirmation before navigating away.

## Acceptance Criteria

- [x] Visual indicator (dot, badge, or color change) on the file breadcrumb when the document is dirty
- [x] Confirmation prompt before navigating away from a dirty document (file click, PR click, branch change)
- [x] Browser `beforeunload` event warns when closing the tab with unsaved changes
- [x] In VS Code embed mode, use inline confirmation (not `window.confirm`)

## Dependencies

- 020 (VS Code WebView compat — can't use `window.confirm` in embed mode)

## Implementation Notes

- `isDirty` state already exists and tracks changes accurately (after PR #35 fix)
- Add a `beforeunload` handler when `isDirty` is true
- Intercept navigation in `openFile`, `openPR`, and hash route changes — show inline confirmation modal
- Add a small dot indicator next to the file path breadcrumb when dirty
