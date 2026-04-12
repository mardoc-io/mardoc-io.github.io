# 027 — Concurrent Request Safety

## Value

Fast navigation (quickly switching repos, files, or PRs) causes race conditions where responses arrive out of order and the UI displays data from the wrong resource. No request cancellation exists.

## Acceptance Criteria

- [x] `setCurrentRepo()` drops results from in-flight requests when called again before completion (via staleness guard)
- [x] `openFile()` drops previous file fetch results when a new file is opened
- [x] `openPR()` drops previous PR detail fetch results when a new PR is opened
- [x] `suppressHashChange` replaced with value comparison against `lastWrittenHash.current` — no more setTimeout(0) race
- [x] No stale state displayed after rapid navigation — generation counters discard out-of-order results

## Dependencies

None

## Implementation Notes

- Use `AbortController` for fetch cancellation in `app-context.tsx`
- `setCurrentRepo` (line ~207) needs an abort signal passed through to GitHub API calls
- `openFile` (line ~331) and `openPR` (line ~443) same pattern
- Replace `setTimeout(0)` in `suppressHashChange` with value comparison or `queueMicrotask()`
