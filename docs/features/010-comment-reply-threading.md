# 010: Comment Reply Threading

## Value
Reviewers can have threaded conversations on PR comments — replies, back-and-forth discussion, and resolution — all synced with GitHub. Currently the reply input exists in the UI but is a placeholder (`console.log`). Wiring it up completes the review collaboration loop.

## Acceptance Criteria
- Replies to a comment are posted to the GitHub PR review API as threaded replies
- Threaded replies from GitHub are fetched and displayed under the parent comment
- Reply input submits via Enter and posts to GitHub
- Resolve/unresolve syncs with GitHub (dismiss/re-request as appropriate)
- Works in all three view modes: Inline Diff, Side by Side, Preview

## Dependencies
- Story 003 (Comment to PR) — comment creation must be wired to GitHub first

## Implementation Notes
- `handleReply` in DiffViewer.tsx is the placeholder — currently `console.log("Reply to", commentId, body)`
- GitHub API: `POST /repos/{owner}/{repo}/pulls/{pull_number}/comments/{comment_id}/replies`
- Need to fetch existing reply threads when loading PR comments — current fetch likely only gets top-level comments
- `PanelComment.replies` array already exists in the type — just needs to be populated from API data
- Consider optimistic UI updates for snappy feel, with rollback on API failure
