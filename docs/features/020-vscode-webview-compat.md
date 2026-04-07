# 020 — VS Code WebView Compatibility

## Value

Links and popups that rely on browser-only APIs (`window.open`) fail silently in VS Code's WebView embed mode. Users click "Follow link" and nothing happens. This story fixes all browser-API assumptions so the embed experience works fully.

## Acceptance Criteria

- [ ] `window.open()` in `followLink` is replaced with a VS Code-compatible approach (postMessage to extension for external URLs, internal navigation for relative/anchor links)
- [ ] Audit for any remaining `window.open`, `window.prompt`, `window.confirm`, `window.alert` calls — none remain
- [ ] External links open correctly in both browser and VS Code WebView
- [ ] Internal/anchor links navigate correctly in both contexts

## Dependencies

None

## Implementation Notes

- `followLink` in Editor.tsx (~line 1079) uses `window.open()` for external links
- VS Code WebView blocks `window.open` — need to postMessage to the extension, which calls `vscode.env.openExternal()`
- Add a `file:open-external` message type to the VS Code bridge
- The extension side (`mardoc-vscode/src/extension.ts`) needs a handler for this message
