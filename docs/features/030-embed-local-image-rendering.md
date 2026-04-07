# 030 — Local Image Rendering in Embed Mode

## Value

When editing markdown in VS Code embed mode, relative image references (e.g., `![diagram](./images/arch.png)`) don't render because the app can't access the local filesystem. Users see broken images for any document that references local assets. This is a core requirement for making MarDoc useful as a VS Code markdown editor.

## Acceptance Criteria

- [ ] Relative image paths in markdown render correctly when opened via VS Code embed mode
- [ ] Images are loaded from the local workspace filesystem via the VS Code extension bridge
- [ ] Absolute URLs (https://) continue to load directly from the network
- [ ] GitHub raw content URLs continue to load via the existing authenticated image pipeline
- [ ] Large images don't block the editor from rendering (async/lazy loading)
- [ ] If an image fails to load, show a placeholder with the path (not a broken image icon)

## Dependencies

- 017 (VS Code extension)

## Implementation Notes

**App side:**
- Detect relative image paths in rendered HTML (paths that don't start with `http://` or `https://`)
- For each relative image, resolve against the current file's directory
- Send a `file:read-image` postMessage to the VS Code extension with the resolved path
- Extension responds with base64-encoded image data
- Replace `src` with `data:image/...` URI when the response arrives

**Extension side (`mardoc-vscode/`):**
- Add handler for `file:read-image` message type
- Use `vscode.workspace.fs.readFile()` to read the image from the workspace
- Respond with `{ type: "file:image-data", path, data: base64, mimeType }` 
- Detect MIME type from file extension (png, jpg, gif, svg, webp)

**Image resolution:**
- Relative paths resolve against the directory of the currently open file
- Support `./`, `../`, and bare paths (e.g., `images/foo.png`)
- Reuse `resolvePath` from `link-handler.ts` for path resolution
