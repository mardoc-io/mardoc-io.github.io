# 032 — Mermaid Theme Upgrade

## Value

Mermaid diagrams rendered with the default theme look bland and disconnected from the app's design. AI-generated HTML documents demonstrate that `theme: 'base'` with custom `themeVariables` produces dramatically better output. Adopting this approach in MarDoc's markdown renderer improves diagram quality across both the Editor and DiffViewer.

## Acceptance Criteria

- [x] Mermaid diagrams render with custom themed colors (blues, teals, ambers) in light mode
- [x] Mermaid diagrams render with complementary dark palette in dark mode
- [x] Theme automatically syncs when user toggles light/dark mode
- [x] Flowcharts use `curve: 'basis'` for smoother edges
- [x] Sequence diagrams have increased actor/message margins for readability
- [x] Diagram container has subtle background and rounded corners
- [x] Existing mermaid round-trip preservation is not affected

## Dependencies

None.

## Implementation Notes

**Single file change** (`src/lib/mermaid.ts`):
- `LIGHT_THEME_VARS` and `DARK_THEME_VARS` constants with full `themeVariables` objects
- `getMermaidConfig(isDark)` builds the config with `theme: "base"` and layout options
- `syncMermaidTheme()` detects dark mode from `document.documentElement.classList` and re-initializes only when theme changes
- Both `preRenderMermaid` and `renderMermaidBlocks` call `syncMermaidTheme()` before rendering

**CSS update** (`src/app/globals.css`):
- `.mermaid-diagram` gets subtle background, padding, and border-radius
