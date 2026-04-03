# 015: Create New File in Repo

## Value
Users can create a new markdown file directly in a GitHub repo through mardoc. Write new content in the editor, choose where it lives in the repo, and submit as a PR — all without leaving the app. Lowers the barrier to contributing new docs or pages.

## Acceptance Criteria
- "New file" action available from the toolbar or file tree context menu
- Opens the editor with a blank document
- User specifies the file path within the repo (e.g., `docs/guide.md`)
- Submitting creates a new branch from the repo's default branch, commits the new file, and opens a PR
- User provides a PR title (required) and description (optional)
- After creation, user sees a link to the PR
- Validates that the file doesn't already exist at the target path (warns if it does — user can choose to overwrite or pick a different path)
- Handles errors: not authenticated, repo not found, path conflicts, API failure

## Dependencies
- 004 (Edit to PR) — shares the branch-create-commit-PR mechanics

## Implementation Notes
- Reuses the same submit-as-PR flow from 004/014: `git.createRef()` to create branch, `repos.createOrUpdateFileContents()` to commit, `pulls.create()` to open PR
- Check for existing file at the target path via `repos.getContent()` before committing — surface a warning if it exists
- Editor starts empty with a placeholder prompt for the filename/path
- Could pre-fill the path based on the current directory context in the file tree
- Consider a template picker (blank, blog post, doc page) as a future enhancement — keep v1 simple with a blank document
