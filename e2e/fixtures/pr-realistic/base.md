# 037 — AI Page Translation (Repo-Resident Translations)

## Value

Teams that ship documentation in multiple languages today either (a) maintain parallel language trees by hand, which drifts immediately, or (b) rely on runtime browser translation, which doesn't round-trip back to the repo and can't be reviewed. MarDoc already has the right surface: open a `.md` or `.html` file, hit a "Translate" action, get an AI-generated translation rendered in the editor, review it like any other document, and commit it back to the repo as a sibling file (e.g. `guide.es.md`, `guide.fr.md` or `i18n/es/guide.md`). The translation becomes a real file under version control — reviewable, diffable, PR-able, and permanently attached to the repo as the source of truth.

This turns MarDoc into the documentation i18n workflow for AI-era teams: one source document, N committed translations, all reviewable by the humans on the team who actually speak those languages, no external translation service or CAT tool in the loop.

## Acceptance Criteria

- [ ] "Translate" action available from the editor toolbar and command palette on any markdown or HTML document
- [ ] User selects a target language (persisted list of recent targets + searchable full list)
- [ ] AI generates a translation of the full document, preserving structure (headings, lists, tables, code blocks, links, images, mermaid diagrams, GitHub alerts, footnotes)
- [ ] Code blocks are NOT translated (code stays in its original form — only comments inside code blocks are translated, optionally)
- [ ] Link URLs are NOT translated; link *text* is
- [ ] Image alt text and captions are translated
- [ ] Mermaid diagram labels are translated; diagram structure is preserved
- [ ] User chooses the save path (default: configurable pattern like `{basename}.{lang}.{ext}` or `i18n/{lang}/{path}`)
- [ ] Translated document opens in the editor for human review before commit
- [ ] Commit is a real PR (or direct commit, based on existing editor settings) — same workflow as any other edit
- [ ] Repo-level configuration for: default target languages, save path pattern, translation provider
- [ ] Works in both real-repo mode and demo mode (demo mode uses a mocked translation response)
- [ ] Translation provider is configurable (OpenAI, Anthropic, local model via endpoint) — user supplies their own API key, stored in localStorage alongside the GitHub token
- [ ] No translation data leaves the user's browser except to the configured provider's API endpoint (preserves the "no backend" trust story)
- [ ] Per-block "re-translate" action for reviewers who want to fix a specific paragraph
- [ ] Round-trip test: markdown → translated markdown → rendered → markdown preserves structure byte-for-byte on blocks that weren't translated (code, links, images)

## Dependencies

- **HTML inline comments (033)** and **HTML WYSIWYG (035)** should probably ship first so that HTML translations can be reviewed with the same flow as markdown translations. Not a hard blocker — translation can ship for markdown first and HTML later.
- **AI provider abstraction** (new) — a thin wrapper around OpenAI/Anthropic SDKs that handles: chunking, rate limiting, API key management, error surfacing. Lives in `src/lib/ai-provider.ts`. Reusable by future AI features (document summarization, comment suggestions, etc.).

## Implementation Notes

### Provider abstraction

- `src/lib/ai-provider.ts` — ports + adapters. Interface `TranslationProvider { translate(text, sourceLang, targetLang, options): Promise<string> }`. Adapters: `OpenAIProvider`, `AnthropicProvider`, `CustomEndpointProvider`.
- API keys stored in `localStorage` under namespaced keys (`mardoc.ai.openai.key`, etc.), surfaced in Settings panel.
- Never log or include API keys in error messages.

### Chunking strategy

Large documents blow out single-shot prompts. Split at block boundaries (`parseBlocks` from `diff-blocks.ts` — the same function that powers markdown review pipeline). Translate block-by-block with shared context (previous block + target language) so terminology stays consistent. Re-assemble in source order.

### Structure preservation

The prompt to the LLM must include the rules: "preserve markdown/HTML syntax exactly, translate only visible prose, do not translate code, do not translate URLs, do not reformat tables, keep mermaid node IDs stable, translate only mermaid labels." Add a post-processing validator that re-parses the output with `parseBlocks` and confirms the block count matches the input — if it doesn't, the LLM hallucinated structure and we surface a warning.

### Code block handling

Default: leave code blocks untranslated. Optional: translate comments inside code blocks (would require language-aware comment parsing — defer to a follow-on story).

### Save path conventions

Two patterns users pick between in settings:

1. **Sibling suffix:** `README.md` → `README.es.md`. Simple, works anywhere, but pollutes the root.
2. **Subdirectory:** `README.md` → `i18n/es/README.md`. Cleaner for large doc trees, matches conventions in many i18n frameworks.

Config per repo, stored in a `.mardoc.json` file the app reads/writes. If `.mardoc.json` doesn't exist, default to sibling suffix and prompt to create it on first translation.

### Review workflow

Translated document opens in the editor with a banner: "AI-translated from README.md — review and edit before committing." The reviewer can accept as-is or edit freely. Committing creates the translated file with an attribution commit message (`chore(i18n): add Spanish translation of README.md via AI`). Subsequent re-translations update the same file via PR, keeping diff history so humans can review what changed.

### "Keep in sync" follow-on (deferred)

After the first translation lands, users want: "whenever README.md changes, flag the Spanish translation as stale." This needs commit-hash tracking (store the source commit SHA in the translated file's front-matter) and a staleness indicator in the sidebar. Defer to a follow-on story (038).

### Tests to add (test-first)

1. `src/__tests__/ai-provider.test.ts` — mock provider contract, chunking correctness, structure-preservation validator
2. `src/__tests__/translation-save-path.test.ts` — sibling-suffix and subdirectory path computation
3. `src/__tests__/translation-roundtrip.test.ts` — given a document with known code blocks/links/images, the non-prose elements must be byte-identical in the translated output
4. `src/__tests__/readme-claims.test.ts` — extend with "translation preserves structure" claim if we add it to the README

### Out of scope for this story

- Translating code comments inside code blocks
- Keep-in-sync staleness detection (deferred to 038)
- Translation memory / glossary management
- Bulk "translate entire repo" action

## Open questions

- Which AI provider is the default? Anthropic Claude has better structured-output discipline for long documents; OpenAI is more universally adopted. Probably ship with both and let users pick.
- Do we need a content-filtering guard for sensitive documents? Some teams won't want to send internal docs to an external API. Suggest: add a per-repo "AI features enabled" flag in `.mardoc.json` so repos can opt out entirely.
- How do we handle translation of documents that reference each other by filename? A link to `[Guide](./guide.md)` in a Spanish translation should probably point to `./guide.es.md` if it exists. That's a post-processing pass over the translated output — doable but out of scope for v1.

## Related

- **038 — Translation staleness detection** (follow-on: track source SHA in translated files, flag when source changes)
- **039 — AI-assisted editing** (reuses the AI provider abstraction for inline rewrites, summarization, comment suggestions)
