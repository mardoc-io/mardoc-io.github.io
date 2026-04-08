# 017: VS Code Extension

## Value

MarDoc as a rich document editor and PR reviewer inside VS Code. The extension loads mardoc.app in a WebView, passes workspace context, and provides an "Edit with MarDoc" right-click action on document files (markdown and HTML). Git operations (commit, branch, push) stay in VS Code where they belong — MarDoc handles rendering, editing, and PR review.

## Acceptance Criteria

### Extension
- "MarDoc: Open" command launches mardoc.app in a WebView panel
- "Edit with MarDoc" in the explorer context menu for `.md`, `.mdx`, `.html`, `.htm` files — opens the file in MarDoc beside the editor
- Extension detects workspace GitHub remote and branch from git
- Extension gets a GitHub token via `vscode.authentication.getSession('github')`
- On load, passes repo, branch, token, and theme to the app via `postMessage`
- Dark/light theme follows VS Code's active color theme
- Save in MarDoc writes back to disk via postMessage → extension → `vscode.workspace.fs`

### Embed mode (`?embed=true`) in the MarDoc app
- No file tree tab — VS Code drives file navigation
- PR tab stays — browse, review, diff, comment on PRs
- Save writes to disk (via postMessage to extension), not to GitHub API
- Auth section hidden when token is provided externally
- HTML files route to HtmlViewer (sandboxed iframe), markdown files route to Editor — app-side routing already implemented

## Dependencies

- VS Code Extension API (`@types/vscode`)
- `?embed=true` query param support in the MarDoc app (`src/lib/vscode-bridge.ts`)

## Implementation Notes

- Extension is a separate package (`mardoc-vscode/`), ~3 files
- WebView loads `https://mardoc.app/?embed=true` with a hash route to the target file
- Message types: `ready` (app → extension), `init` (extension → app), `file:save` (app → extension)
- Bridge module in the app detects embed mode, hides file tree, routes save to postMessage instead of GitHub API
- Bridge is a no-op when not embedded — zero impact on the web app
- The `init` message handler in `app-context.tsx` already detects HTML files and routes to HtmlViewer — the extension just sends `{ type: "init", fileName, fileContent, filePath }` regardless of file type
- `package.json` context menu `when` clause: `resourceExtname =~ /\\.(md|mdx|html|htm)$/`

## Future Stories (not this one)

- Configurable URL setting for self-hosted or localhost dev
- Multi-file editing session (track edits across files, bulk save)
