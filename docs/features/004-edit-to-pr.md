# 004: Edit File and Submit as PR

## Value
Users can edit markdown files directly in the Editor and submit changes as a PR. Turns mardoc into a full propose-changes workflow — edit content, preview it rendered, submit for review.

## Acceptance Criteria
- Editor changes are tracked as a dirty state (modified vs original content)
- "Submit as PR" action creates a new branch, commits the edited file, and opens a PR
- User can provide a PR title/description before submitting
- Works from any branch (edits on default branch create a new feature branch)
- After PR creation, user is shown the PR link

## Dependencies
- 002 (Branch Selector) — useful but not strictly required; edits on default branch can auto-create a feature branch

## Implementation Notes
- Editor already has `onContentChange` wired up — need to convert HTML back to markdown (or store the raw markdown and track edits)
- GitHub API: create branch via `git.createRef()`, update file via `repos.createOrUpdateFileContents()`, then `pulls.create()`
- Consider markdown round-trip fidelity — editing in TipTap and exporting back to markdown may lose formatting. May want a raw markdown editing mode as an alternative.
