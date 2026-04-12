# 030 — Local Image Rendering in Embed Mode

## Value

When editing markdown in VS Code embed mode, relative image references (e.g., `![diagram](./images/arch.png)`) don't render because the app can't access the local filesystem. Users see broken images for any document that references local assets. This is a core requirement for making MarDoc useful as a VS Code markdown editor.

## Acceptance Criteria

- [x] Relative image paths in markdown render correctly when opened via VS Code embed mode (loadEmbedLocalImages scans container, resolves paths, requests via bridge)
- [x] Images are loaded from the local workspace filesystem via the VS Code extension bridge (embed-image-bridge.ts + postMessage protocol file:read-image → file:image-data / file:image-error)
- [x] Absolute URLs (https://) continue to load directly from the network (candidates filter skips http://, https://, //cdn urls)
- [x] GitHub raw content URLs continue to load via the existing authenticated image pipeline (loadAuthenticatedImages unchanged, loadEmbedLocalImages skips anything with data-gh-path)
- [x] Large images don't block the editor from rendering (Promise.allSettled — all requests run in parallel and don't await each other; 5s default timeout per image)
- [x] If an image fails to load, show a placeholder with the path (same mardoc-image-failed class as PR #71, alt text includes the original src path)

## Implementation status

**App side: COMPLETE.** Ships in this PR.

**Extension side: NOT IN THIS REPO.** The mardoc-vscode extension needs a matching handler that listens for `file:read-image` messages and responds with `file:image-data` or `file:image-error`. Until that's shipped on the extension side, relative images in embed mode will timeout after 5s and show the placeholder. The app-side contract is ready and documented in `src/lib/embed-image-bridge.ts`.

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
