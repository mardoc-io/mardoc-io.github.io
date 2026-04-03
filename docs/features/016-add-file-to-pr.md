# 016: Add File to Existing PR

## Value
While reviewing a PR, users can add a new markdown file directly to the PR branch. No need to leave the app, clone the repo, or create a separate PR — just write the content and commit it to the branch under review.

## Acceptance Criteria
- "Add File" button appears in the sidebar when viewing a PR's changed files
- Clicking it opens a blank editor scoped to the PR
- User specifies the file path within the repo
- Submitting commits the file to the PR's head branch (not a new PR)
- After commit, the file appears in the PR's changed files list
- Editor clears and returns to the PR diff view showing the new file

## Dependencies
- 015 (Create New File) — reuses the editor new-file flow and TipTap-to-markdown conversion

## Implementation Notes
- New function in `github-api.ts`: `commitFileToPRBranch(repoFullName, headBranch, filePath, content, message)` — commits directly to the PR branch via `repos.createOrUpdateFileContents`
- Reuse the Editor's new-file mode but with a different submit target (PR branch instead of new branch + PR)
- AppContext needs `addFileToPR()` action that sets up the editor in add-to-PR mode, carrying the PR's head branch info
- After commit, refresh PR files to show the new file in the diff
