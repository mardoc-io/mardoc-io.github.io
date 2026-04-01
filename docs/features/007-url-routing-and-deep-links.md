# 007: URL Routing and Deep Links

## Value
Every navigation state produces a shareable URL. Users can bookmark, share, and link directly to a file, PR, or PR file view. Browser back/forward buttons work. Page refresh preserves navigation state instead of dumping the user on the welcome screen.

## Acceptance Criteria
- Hash-based routing reflects navigation state bidirectionally (URL ↔ app state)
- URL updates as the user navigates (address bar is always a shareable link)
- Inbound links restore full navigation state: repo, view, file/PR selection
- Browser back/forward buttons navigate through view history
- Page refresh preserves current view
- Graceful fallback: if a linked file/PR doesn't exist or the user lacks access, show an error rather than a blank screen

## URL Scheme
```
/#/{owner}/{repo}/blob/{branch}/{path}       → file view
/#/{owner}/{repo}/pull/{number}               → PR diff view
/#/{owner}/{repo}/pull/{number}/files/{idx}   → specific file in PR
/#/{owner}/{repo}                             → repo root (file tree)
```

Mirrors GitHub's URL structure so it feels familiar.

## Suggested Breakdown

### 007a: Hash router infrastructure
- Add a lightweight hash router (no library needed — `hashchange` event + parser)
- Define route patterns and a parser that extracts owner, repo, branch, path, PR number, file index
- Wire `parseHash()` on mount and `hashchange` events to dispatch navigation actions in AppContext
- Wire navigation actions (`openFile`, `openPR`, `setCurrentRepo`) to update `window.location.hash`
- No UI changes — just the plumbing

### 007b: File deep links
- Navigating to a file updates the hash to `/#/{owner}/{repo}/blob/{branch}/{path}`
- Inbound file links trigger repo load (if needed) → file tree load → file selection
- Handles missing files gracefully

### 007c: PR deep links
- Navigating to a PR updates the hash to `/#/{owner}/{repo}/pull/{number}`
- Selecting a file within a PR appends `/files/{idx}`
- Inbound PR links trigger repo load → PR fetch → PR selection
- Handles missing/closed PRs gracefully

### 007d: Browser history integration
- Back/forward buttons navigate between views
- `pushState`-style behavior via hash changes (each navigation pushes a new hash, not replaces)

## Dependencies
- 005 (Restore Last Repo) — the auto-restore logic should defer to URL state if a hash route is present (URL wins over localStorage)

## Implementation Notes
- Static export on GitHub Pages rules out path-based routing — hash routing is the right fit
- Keep the router minimal: a `parseHash()` function, a `useHashRoute()` hook, and hash updates in existing navigation functions
- No external routing library needed — the route space is small and well-defined
- The init flow in `app-context.tsx` needs to check for a hash route before falling back to localStorage repo restore (from 005)
