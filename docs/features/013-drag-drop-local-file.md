# 013: Drag-and-Drop Local File

## Value
Users can drag a markdown file from Finder/Explorer onto the app to open it. Faster and more natural than the file picker for users who work with local files.

## Acceptance Criteria
- Dragging a file over the main content area shows a drop zone overlay (visual indicator)
- Dropping a `.md` / `.mdx` file opens it in the editor (same behavior as 012's file picker)
- Non-markdown files are rejected with a brief toast or message
- Drop zone disappears on drag-leave or drop
- Works alongside the file picker from 012

## Dependencies
- 012 (Open Local File) — reuses the local file state and rendering

## Implementation Notes
- Add `onDragOver`, `onDragEnter`, `onDragLeave`, `onDrop` handlers to the main content area (likely `page.tsx` or the editor wrapper)
- On drop, read the file with `FileReader.readAsText()` and feed it into the same `localFile` state from 012
- Check `file.name` extension before accepting
- Drop zone overlay: a full-area semi-transparent div with "Drop markdown file here" text, shown via state toggle on dragenter
