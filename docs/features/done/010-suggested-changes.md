# 010: Suggested Changes on PR Reviews

## Value
Reviewers can propose specific text changes inline on a PR, and the PR owner can accept them with one click — committing the suggestion directly to the branch. Moves mardoc from "comment about what's wrong" to "show exactly what it should say," reducing round-trips and making review actionable.

## Acceptance Criteria
- When commenting on a PR, reviewers can insert a "suggested change" block containing replacement text for the selected lines
- Suggestions render as a diff (original vs proposed) in the comment thread
- PR owner sees an "Accept suggestion" button on each suggestion
- Accepting a suggestion commits the change to the PR branch with a descriptive commit message (e.g., "Apply suggestion from review")
- Batch accept: owner can select multiple suggestions and apply them in a single commit
- Suggestions on lines that have since changed are marked as outdated (cannot be applied without conflict resolution)

## Dependencies
- 003 (Comment to PR) — suggested changes are a specialization of inline comments
- 004 (Edit to PR) — shares the commit-to-branch mechanics

## Implementation Notes
- GitHub API supports suggestion blocks natively in PR review comments (` ```suggestion ` fenced blocks) — leverage this rather than inventing a custom format
- Accepting a suggestion uses `pulls.updateBranch()` or the suggestions API if available; otherwise commit via `repos.createOrUpdateFileContents()` with the patched file
- Need line-range tracking to map the suggestion back to the correct file position
- Rendering the diff inline can reuse the Editor's existing content diffing or a lightweight diff view component
- Consider whether suggestions should be markdown-aware (propose changes to rendered content) or raw-text (propose changes to the source markdown) — raw-text is simpler and matches GitHub's model
