# 014: Submit Local File to GitHub as PR

## Value
After editing a local file, users can submit it to a GitHub repo as a pull request. Completes the local-to-GitHub workflow: write locally, preview rendered, push for review.

## Acceptance Criteria
- "Submit as PR" action appears in the toolbar when viewing a local file and authenticated
- User selects the target repo (from their repo list or by typing `owner/repo`)
- User specifies the target file path within the repo (defaults to the local filename)
- User provides a PR title (required) and description (optional)
- Submitting creates a new branch from the repo's default branch, commits the file, and opens a PR
- After creation, user sees a link to the PR
- Handles errors: not authenticated, repo not found, API failure

## Dependencies
- 012 (Open Local File) — needs local file content in the editor

## Implementation Notes
- New function in `github-api.ts`: `submitLocalFileAsPR(repoFullName, targetPath, content, title, description)` — creates branch via `git.createRef`, commits via `repos.createOrUpdateFileContents`, opens PR via `pulls.create`
- If file exists at the target path, GitHub API returns it as a modification; if not, it's an addition — no special handling needed, but fetch the existing file's SHA if updating
- UTF-8 encoding for the commit: use `TextEncoder` → base64 (reverse of the decode path in `fetchFileContent`)
- Submit UI: a modal with repo selector, path input, title input, description textarea, submit button. Keep it minimal — similar weight to the existing "Submit as PR" for comments
- If a repo is already selected in the app, pre-fill it as the target
