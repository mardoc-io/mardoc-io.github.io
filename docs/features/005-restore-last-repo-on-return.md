# 005: Restore Last Repo on Return

## Value
Returning users land back where they left off — the app automatically reloads their last-selected repo instead of dropping them on a blank screen and forcing them through Settings → wait for enumeration → find repo → click.

## Acceptance Criteria
- On startup, if a valid token and saved repo exist in localStorage, the app calls `setCurrentRepo()` to load the repo automatically
- The user sees a loading state while the repo tree and PRs are fetched (not a blank "no repo selected" screen)
- If the saved repo fails to load (deleted, token revoked, permissions changed), fall back gracefully — clear the saved repo and show the normal unauthenticated/no-repo state
- No extra clicks required for the returning user path

## Implementation Notes
- The fix is in `src/lib/app-context.tsx`, in the initialization `useEffect` (~line 103–115)
- The saved repo is already read from localStorage (`REPO_KEY`) — it just needs to be passed to `setCurrentRepo()` after Octokit is initialized
- `setCurrentRepo()` already handles fetching the tree, PRs, and setting loading states — no new loading logic needed
- Error handling: wrap the auto-restore in a try/catch; on failure, `localStorage.removeItem(REPO_KEY)` and let the user re-select manually
