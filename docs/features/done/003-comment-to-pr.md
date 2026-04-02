# 003: Open PR from Comments on Any Branch

## Value
Users can comment on markdown files in any branch (non-PR context) and submit those comments as a new PR. Enables a review workflow without requiring a PR to exist first — the act of commenting creates one.

## Acceptance Criteria
- When viewing a file on a non-default branch, comments can be added (same UX as PR commenting)
- A "Submit as PR" action collects all comments and creates a PR from the current branch to the default branch
- Comments are posted as PR review comments with line mappings
- If a PR already exists for the branch, comments are added to the existing PR instead
- User is shown the PR link after creation

## Dependencies
- 002 (Branch Selector) — need to be on a non-default branch to comment

## Implementation Notes
- Existing `createReviewPR()` in github-api.ts handles PR creation
- Existing `createInlineComment()` handles posting review comments with line ranges
- Need to check for existing PRs from the current branch before creating a new one
- Editor component already has comment infrastructure — wire it to GitHub API when in authenticated mode
