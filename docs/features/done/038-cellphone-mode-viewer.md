# 038 — Cellphone Mode Viewer

## Value

MarDoc today is a desktop-first tool: sidebars, multi-column diff views, WYSIWYG toolbars, comment panels. Opening it on a phone produces a usable but not comfortable experience — reviewers tapping through a PR on the train to their 9am standup get shrunken desktop chrome instead of a mobile-native read. For the AI-era market we're targeting (PMs, execs, designers, legal reviewers on the go), cellphone mode isn't a nice-to-have — it's where half the reviews will happen.

Cellphone mode turns MarDoc into a read-and-comment experience sized and shaped for a phone: one document at a time, full-width prose, thumb-friendly comment affordances, swipe navigation between files in a PR, and a comment-queue flow that assumes the user will submit the whole review from the phone. Editing is optional — most phone users just read and leave comments, the same pattern as Google Docs mobile.

## Acceptance Criteria

- [x] App detects viewport width and switches to cellphone layout below a breakpoint (768px via useViewport hook)
- [x] Sidebar collapses into a hamburger drawer that overlays when opened
- [x] Comment panel slides up from the bottom as a sheet instead of a right-side rail
- [x] DiffViewer shows one view mode at a time (rendered, by default) with a compact mode-switcher (side-by-side hidden on mobile)
- [x] Selecting text triggers a floating action button ("Comment on selection") fixed at the bottom — tap to open the comment input
- [x] Comment input auto-focuses with a virtual keyboard, submits on return
- [ ] PR file list appears as a vertical list with swipe-left/swipe-right gestures to move between files
- [x] Editor toolbar shrinks to icon-only and can be scrolled horizontally if it overflows
- [x] Command palette opens as full-screen on mobile
- [x] Cheatsheet and settings open as full-screen modals instead of side panels
- [x] Typography scale adjusts: 16px body, 1.65 line height, drop cap, section marks on mobile
- [x] Touch targets are all ≥44pt (Apple HIG) on key affordances (comment button, PR cards, file items)
- [x] Dark mode works in cellphone layout
- [x] Landscape orientation on phone uses desktop layout (breakpoint is 768px, landscape exceeds this)
- [ ] iPad / tablet uses desktop layout by default, with a user toggle to force cellphone mode
- [x] All existing features work in cellphone mode (read, comment, review, edit, suggest, approve)
- [x] A user can complete a full PR review from an iPhone without ever needing a horizontal scroll

## Dependencies

- No new backend dependencies — it's a layout / UX rework of existing client-side code
- Touch gesture support for swipe navigation (pick a lightweight library or write a small wrapper over pointer events — prefer the latter)
- Review of all components that currently assume desktop-scale viewport: `Sidebar.tsx`, `DiffViewer.tsx`, `PRDetail.tsx`, `Editor.tsx`, `SettingsPanel.tsx`, `CommandPalette.tsx`

## Implementation Notes

### Breakpoint strategy

Use Tailwind's existing `sm:`, `md:`, `lg:` responsive utilities. Add a `useViewport()` hook that returns `'mobile' | 'tablet' | 'desktop'` based on window width + user agent hints (to distinguish iPad from iPhone-in-landscape). The hook drives conditional rendering where layout differences are structural (e.g. sidebar → drawer), not just stylistic.

Structural changes (where we render a different component):
- `Sidebar` → `MobileSidebarDrawer` (overlay with backdrop, hamburger trigger in header)
- `CommentPanel` (right rail) → `CommentSheet` (bottom sheet, drag-to-dismiss)
- `DiffViewer` view-mode selector → compact mode-switcher
- `CommandPalette` → full-screen search modal
- `SettingsPanel` (side panel) → full-screen modal

Stylistic changes (same component, different Tailwind classes):
- Editor toolbar → icon-only, horizontal scroll
- Typography → adjusted line height and heading scale
- Spacing → larger touch targets

### Selection → floating action button

On selection end, the parent gets the selection via the existing selection-tracking hook. In cellphone mode, render a small floating button near the selection's bounding rect. Tap opens the comment input as a bottom sheet. The existing selection-to-line-range logic (`mapSelectionToLines` for markdown, `data-mardoc-line` for HTML) stays the same — only the UI that wraps it changes.

### Swipe navigation

For moving between files in a PR: pointer events on the main content area. Swipe left → next file, swipe right → previous file. Threshold: 80px horizontal with <30px vertical drift. Implement as a small hook (`useSwipe`) so it's testable and reusable. Animate with CSS transform, not a full page transition.

### Bottom sheet component

Write a minimal `BottomSheet` component: backdrop, sheet with drag-to-dismiss, snap points (half-height, full-height). No external dep. Accessible (focus trap, escape-to-close, aria-modal). Reusable for: comment input, comment thread view, settings, command palette.

### Editor in cellphone mode

WYSIWYG editing on a phone is real but secondary. For v1, the Editor in cellphone mode:
- Collapses the toolbar to a small floating "format" button that opens a bottom sheet with format actions
- Hides the code-view toggle (editing raw markdown on a phone is painful)
- Disables the find/replace action (not useful on a phone form factor)
- Keeps autosave, keyboard shortcuts where the OS supports them, and the save button prominent

### Testing

1. **Visual regression tests** at multiple viewports (375x667 iPhone SE, 390x844 iPhone 14, 768x1024 iPad portrait). Use Playwright or Vitest browser mode if we add it. Deferred if too heavy — start with manual QA.
2. **Unit tests** for `useViewport` (mock `window.matchMedia`) and `useSwipe` (synthetic pointer events).
3. **Integration tests** for cellphone-mode flows: open PR → read file → select text → leave comment → submit review. Stub out Octokit and drive the DOM directly.
4. **Manual QA checklist** in the PR description: walk through the full review flow on a real iPhone, screenshot each step.

### Out of scope for this story

- Offline mode / PWA install (we're not a PWA yet — that's a separate story)
- Push notifications for PR updates
- Native app wrappers (Capacitor, React Native) — cellphone mode is a responsive web layer, not a native app
- Cross-device sync (review started on phone, continued on desktop) — already works, since the review queue lives in GitHub

## Open questions

- What breakpoint do we use? 640px (Tailwind's `sm:` boundary) is the safe default, but some devices are 430px wide. Probably 768px — anything narrower is cellphone mode.
- Do we ship cellphone mode as a user-toggleable preference or always on below the breakpoint? Probably always on with a "desktop mode" escape hatch in settings for power users.
- How do we handle the virtual keyboard pushing content around? The bottom sheet needs to resize on `visualViewport` changes.
- Swipe navigation might conflict with horizontal scroll inside code blocks. Solution: don't start a swipe gesture if the touch starts on a `<pre>` or a scrollable element.
- Does the comment pin overlay on HTML iframes work with touch? Need to verify in the HTML review flow (feature 033).

## Related

- **033 — Inline comments on HTML** — must work in cellphone mode (taps inside the iframe must surface a floating action button on the parent)
- **039 — PWA infrastructure** (follow-on: manifest, service worker, install prompt, offline read-only for previously-viewed PRs)
