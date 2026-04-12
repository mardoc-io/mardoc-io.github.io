# 018: HTML in Markdown Round-Trip Fidelity

## Value

Markdown files often contain embedded HTML — `<details>`, `<summary>`, styled `<div>`s, `<video>`, `<iframe>`, custom attributes. Today MarDoc silently destroys this HTML on save because Turndown strips or converts unrecognized tags. Users should be able to edit a markdown file with embedded HTML and commit it without losing the HTML they didn't touch.

## Problem

The conversion pipeline is: Markdown → Showdown → HTML → TipTap → HTML → Turndown → Markdown. Each stage can lose information:

1. **Showdown** parses HTML in markdown but doesn't flag it as "pass-through"
2. **TipTap** normalizes HTML into its document model — unknown tags are dropped or flattened
3. **Turndown** converts HTML back to markdown, stripping anything it doesn't have a rule for

Elements that break on round-trip today:
- `<details>` / `<summary>` — lost entirely
- `<div>` with class/style/id attributes — attributes stripped, structure flattened
- `<span>` with inline styles — stripped to plain text
- `<video>`, `<audio>`, `<iframe>` — lost entirely
- HTML comments `<!-- -->` — lost
- `<sup>`, `<sub>` — may survive rendering but lost on Turndown conversion
- `<kbd>`, `<abbr>`, `<mark>` — may partially survive
- `<table>` with colspan/rowspan/attributes — simplified to basic markdown table
- `<br>` within block elements — may be converted to newlines inconsistently

## Acceptance Criteria

- HTML elements embedded in markdown survive the edit → save round-trip unchanged (when the user didn't edit them)
- A test suite validates round-trip fidelity for each common HTML element type
- No regression in standard markdown rendering (headings, lists, bold, italic, code, tables, task lists)

## Implementation Notes

### Phase 1 — Tests first
- Set up vitest (lightweight, works with Next.js)
- Write round-trip tests: markdown-in → Showdown → TipTap → Turndown → markdown-out
- Each test covers one HTML element type — establishes the current failure baseline
- Tests document expected behavior even before fixes

### Phase 2 — Turndown rules
- Add `.keep()` for known pass-through elements: `details`, `summary`, `div`, `span`, `video`, `audio`, `iframe`, `sup`, `sub`, `kbd`, `abbr`, `mark`
- Add `.addRule()` for elements that need specific markdown output (e.g., `<br>` → `\n`)
- Configure Turndown to preserve HTML attributes on kept elements

### Phase 3 — TipTap HTML block node (if needed)
- If Turndown `.keep()` isn't sufficient because TipTap strips the HTML before Turndown sees it, add a custom TipTap node that preserves raw HTML blocks as opaque content
- This is the more invasive option — only pursue if Phase 2 doesn't cover enough cases

## Dependencies

- vitest (new dev dependency)
