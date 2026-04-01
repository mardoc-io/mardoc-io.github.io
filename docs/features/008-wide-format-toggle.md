# 008: Wide Format Toggle

## Value
Users working with wide content (tables, diagrams, code blocks) can expand the document view to use more of the screen, while keeping a ~50px side margin for a clean reading experience. Currently the content area is constrained to a narrower column.

## Acceptance Criteria
- Toggle button in the toolbar or header to switch between normal and wide format
- Wide format expands the content area to near-full viewport width with ~50px padding on each side
- Normal format retains current narrower content width
- Preference persists across sessions (localStorage)
- Works in all views: Editor, Rendered Diff, Side by Side, Final view
- Side-by-side view benefits most — more room for both panes

## Implementation Notes
- Likely a `max-width` toggle on the main content container — from the current constrained width to `calc(100vw - 100px)` or similar
- Store preference in localStorage (e.g. `mardoc_wide_format`)
- Could live in the existing theme/settings context or as a simple standalone toggle
- Button placement: near the view mode switcher makes sense — it's a display preference, not a setting
