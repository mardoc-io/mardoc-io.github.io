# 012: Open Local File in Editor

## Value
Users can open a markdown file from their local filesystem and preview/edit it in the TipTap editor — no GitHub connection required. Standalone local preview and editing.

## Acceptance Criteria
- "Open Local File" button in the sidebar (below the file tree, or as an action when no repo is connected)
- Clicking it opens the browser file picker, filtered to `.md` / `.mdx`
- Selected file content renders in the editor with full formatting (syntax highlighting, tables, mermaid, task lists)
- File path breadcrumb shows the local filename
- Editing works identically to repo files — toolbar, undo/redo
- App state distinguishes "local file" from "repo file" so repo-specific UI (branch selector) can hide
- Opening a new local file replaces the current one

## Dependencies
None.

## Implementation Notes
- Use `<input type="file" accept=".md,.mdx">` (simplest cross-browser approach); consider `showOpenFilePicker` as a future enhancement
- Read file content via `FileReader.readAsText()`
- Extend `AppState` with a `localFile: { name: string; content: string } | null` field
- When a local file is active, feed its content to the `Editor` component the same way `fileContent` is used today
- Local image references won't resolve — show them broken or with a placeholder; acceptable for this story
