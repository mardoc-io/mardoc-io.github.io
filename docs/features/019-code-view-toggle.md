# 019: Code View Toggle

## Value

Users can switch between the WYSIWYG editor and a raw markdown/HTML source view. This is the escape hatch for anything the rich editor doesn't handle perfectly — HTML comments, complex table attributes, raw HTML blocks, or just verifying exactly what will be committed.

## Acceptance Criteria

- Toggle button in the editor toolbar switches between "Rich" and "Code" views
- Code view shows the raw markdown source in a monospace textarea with syntax highlighting
- Edits in code view are reflected when switching back to rich view (re-parsed through Showdown → TipTap)
- Edits in rich view are reflected when switching to code view (converted via Turndown)
- Save/commit uses whichever view is active — no conversion surprise
- Toggle state is per-file, not global (switching files resets to rich view)
- Code view textarea auto-sizes to content height

## Dependencies

None — TipTap already supports `getHTML()` / `setContent()`, and the Showdown/Turndown pipeline is in place.

## Implementation Notes

- Add a `codeView` boolean state to the Editor component
- When toggling to code view: convert TipTap content via Turndown → show in a `<textarea>` or a simple code editor
- When toggling back to rich view: parse the textarea content via Showdown → set TipTap content
- The toggle button can use the existing toolbar pattern with a `Code` or `FileCode` icon from lucide-react
- For save/commit in code view: use the textarea content directly as markdown (skip Turndown since it's already markdown)
- Consider using the existing `CodeBlockLowlight` styling for the textarea to keep the look consistent
