# 029 — Remove Console Log Stubs

## Value

`page.tsx` has `console.log` stubs where real handlers should be. `onContentChange` logs "Content changed" and does nothing. `onCreatePR` logs the arguments and does nothing. These are dead code paths that give the impression of functionality.

## Acceptance Criteria

- [ ] `onContentChange` callback either implements real behavior or is removed
- [ ] `onCreatePR` callback either implements real behavior or is removed
- [ ] No `console.log` statements remain in production code paths
- [ ] Audit all components for similar stub handlers

## Dependencies

None

## Implementation Notes

- page.tsx line ~104: `console.log("Content changed")` — determine if this callback is needed
- page.tsx line ~128: `console.log("Creating review PR:", ...)` — PRReview's create handler is a no-op
- If these are genuinely unused, remove the props entirely rather than passing stubs
