# 027 — Concurrent Request Safety

## Value

Fast navigation (quickly switching repos, files, or PRs) causes race conditions where responses arrive out of order and the UI displays data from the wrong resource. No request cancellation exists.

## Acceptance Criteria

- [ ] `setCurrentRepo()` cancels in-flight requests when called again before completion
- [ ] `openFile()` cancels previous file fetches when a new file is opened
- [ ] `openPR()` cancels previous PR detail fetches when a new PR is opened
- [ ] `suppressHashChange` uses a reliable mechanism (not `setTimeout(0)`)
- [ ] No stale state displayed after rapid navigation

## Dependencies

None

## Implementation Notes

- Use `AbortController` for fetch cancellation in `app-context.tsx`
- `setCurrentRepo` (line ~207) needs an abort signal passed through to GitHub API calls
- `openFile` (line ~331) and `openPR` (line ~443) same pattern
- Replace `setTimeout(0)` in `suppressHashChange` with value comparison or `queueMicrotask()`
