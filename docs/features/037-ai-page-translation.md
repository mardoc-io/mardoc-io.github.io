# 037 — AI Page Translation (Repo-Resident Translations)

## The reframe

The earlier version of this doc treated translation as a computed view of the source, which created a backend problem: where do you cache the translation? How do you invalidate it? Who pays for the compute on every load?

**None of those are the right question.** A translation is not a cached view — it is an **artifact** that belongs in the repo alongside the source. Once you commit to that frame, every concern dissolves:

- **No cache to invalidate.** Git is the cache. Every translation is a commit.
- **No backend to host.** Translations are just `.md` files in the user's own repo.
- **No provider bill to absorb.** The user brings their own AI provider key (BYOK), same as the GitHub token — MarDoc never sees the content or the key.
- **No rendering path to build.** A translated file is a markdown file. MarDoc already renders those.

The hard problem becomes a social / workflow problem: **how do we make stale translations visible and trivial to update?** That's the actual design space, and it's much smaller than the original framing.

## Value

Teams that ship documentation in multiple languages today fall into three buckets: (a) maintain parallel language trees by hand, which drifts immediately; (b) rely on runtime browser translation, which doesn't round-trip back to the repo and can't be reviewed; or (c) pay for a SaaS translation service that lives outside their source control.

MarDoc's native fit is that the source of truth is already in git. A translation committed back to the same repo gets version history, PR review by a native speaker, diff visibility over time, and a single source of truth — all for free, because that's what git is. MarDoc's job is just to make the translation action one click, and to surface when translations have fallen behind their source.

## How it works

### Translations are sibling files

Two conventions the app auto-detects:

- **Sibling suffix:** `README.md` → `README.es.md`, `README.fr.md` (language code between basename and extension)
- **Subdirectory:** `README.md` → `i18n/es/README.md`, `i18n/fr/README.md`

Either convention works. Teams pick one in `.mardoc.json` (defaults to sibling suffix). When MarDoc opens any file it scans for siblings and surfaces them as a language switcher at the top of the view — essentially a tab bar showing `EN · ES · FR · DE` where tapping one swaps to that file.

### Staleness tracking via frontmatter

Every translated file carries a small YAML frontmatter block:

```yaml
---
mardoc-translation:
  source: README.md
  source-commit: abc123def
  translated-by: anthropic/claude-opus-4-6
  translated-at: 2026-04-12T14:00:00Z
---

# Título del documento
...
```

When MarDoc opens a translated file:
1. Parse the frontmatter
2. Fetch the `source` file from the current branch's HEAD
3. Compare `source-commit` in the frontmatter to the latest commit touching that file
4. If they differ, show a **"source has moved N commits since this translation was blessed"** banner with three actions:
   - **Retranslate from source** — regenerates the whole file via the AI provider, creates a new PR
   - **View source diff** — shows what changed in the source since the last blessed state so the reviewer can decide
   - **Mark as still current** — just updates the `source-commit` frontmatter to HEAD and commits as a one-line PR. The escape hatch for "I read the diff, the translation still holds"

### Correction vs enhancement — the split is free

Edits fall into two buckets and each file tells MarDoc which bucket it's in:

- **Editing a translation file** (`README.es.md`) = correction. The human is improving the translation. On save, MarDoc automatically bumps `source-commit` in the frontmatter to the current HEAD of the source. The act of editing the translation is a blessing that it matches the current source.

- **Editing the source file** (`README.md`) = enhancement. The source commit advances. Every translation's frontmatter now points to an older commit. Staleness banners appear on every translated sibling.

No user action needed to distinguish the two. The file they're editing is the signal.

### Payment — bring your own key

API key for the AI provider lives in Settings next to the GitHub token. Same trust story: stored in `localStorage`, calls go directly from the browser to the provider, MarDoc never sees the content or the key. Users who want translation pay their own provider bill.

Supported providers at launch: Anthropic (Claude), OpenAI. A thin abstraction in `src/lib/ai-provider.ts` makes adding more providers trivial — Gemini, Mistral, a local endpoint, whatever.

Content filtering: some teams won't want to send internal docs to an external API. A per-repo `.mardoc.json` flag can disable AI features entirely for sensitive repos.

### Rendering — there is no special render path

A translated file is a markdown file. MarDoc already renders those. The language switcher is a file picker, not a render mode. This is the biggest thing to internalize: **there is no "translation view." There are just files, and translations are some of them.**

## Acceptance Criteria

### Phase 1 — Sibling detection (no AI yet)

- [ ] Detect sibling-suffix translations: `{base}.{lang}.{ext}` pattern
- [ ] Detect subdirectory translations: `i18n/{lang}/{path}` pattern
- [ ] Language-code set is the standard ISO 639-1 list (en, es, fr, de, ja, zh, …)
- [ ] When opening any file with siblings, show a language switcher tab bar at the top of the view
- [ ] Clicking a language tab opens the corresponding sibling file (uses existing file-open flow)
- [ ] Siblings are flagged in the sidebar file tree with a small language-code badge
- [ ] Repo-level config via `.mardoc.json`: default target languages, save-path convention (sibling vs subdir)

### Phase 2 — Frontmatter staleness (no AI yet)

- [ ] Parse `mardoc-translation` frontmatter from any opened markdown file
- [ ] If `source-commit` differs from the current HEAD commit of the source file, show a staleness banner at the top of the view
- [ ] Banner shows the commit delta ("3 commits behind") and a link to view the source diff since the blessed state
- [ ] "Mark as still current" action: updates `source-commit` to HEAD, creates a one-line commit via the existing PR flow
- [ ] Editing a translation file automatically bumps `source-commit` on save (bundled with the user's own edits in the same commit)
- [ ] Sidebar shows a staleness indicator on translated files with a numeric badge for commits behind
- [ ] "Translations overview" view listing every `(source, translation, staleness)` triple across the repo

### Phase 3 — AI provider + one-click translate

- [ ] `src/lib/ai-provider.ts` abstraction with `TranslationProvider` interface
- [ ] Anthropic adapter (`claude-sonnet-4-6` default, opus as option)
- [ ] OpenAI adapter (`gpt-4o` default)
- [ ] API keys stored in localStorage under namespaced keys
- [ ] Settings panel: "AI Provider" tab with provider selector, key input, test button, cost estimator
- [ ] Per-repo opt-out via `.mardoc.json`: `{ ai: { enabled: false } }` disables the feature entirely
- [ ] "Translate to…" action available from the editor toolbar and command palette
- [ ] Translation request chunks the source at block boundaries (reuses `parseBlocks` from `diff-blocks.ts`) so long documents don't blow out the context window
- [ ] Prompt explicitly instructs the model to preserve markdown syntax, leave code blocks untranslated, preserve link URLs (translate link text), translate alt text, preserve mermaid node IDs (translate labels only)
- [ ] Post-process validation: re-parse the output with `parseBlocks` and warn if the block count doesn't match the input (model hallucinated structure)
- [ ] Translated document opens in the editor for human review before commit, with a "AI-translated from X — review before shipping" banner
- [ ] Save action creates a new file at the configured path (`README.es.md` or `i18n/es/README.md`) with the `mardoc-translation` frontmatter pre-filled
- [ ] Demo mode: sample translations included so the feature is visible without a real API key

### Phase 4 — Merge-aware retranslation (the hard one, can defer)

- [ ] "Retranslate from source" action compares the source file at the current HEAD to the source file at the blessed `source-commit`
- [ ] Identifies which blocks changed in the source since the last translation
- [ ] Block-level diff picker UI: shows each changed source block alongside the existing translation for that block, lets the reviewer choose retranslate / keep existing / edit manually
- [ ] Blocks that weren't touched in the source keep their existing translation (preserving human corrections)
- [ ] Only the selected blocks are sent to the AI provider (minimizes token cost)
- [ ] Result is re-assembled and saved as an update to the translation file with bumped `source-commit`

## Non-goals for v1

- **Translation memory / glossary management** — Phase 3 just sends the whole block to the provider. Users with terminology consistency needs can layer their own glossary into the prompt via `.mardoc.json` config (future).
- **Automatic retranslation on source change** — every translation event is an explicit human action. No background job fires translations without review.
- **Bulk "translate entire repo"** — one file at a time. The batch version is a follow-up when the single-file flow is proven.
- **Translating code comments inside code blocks** — defer. Code stays as written in v1.
- **Cross-linking rewrite** — if `README.es.md` contains `[Guide](./guide.md)`, MarDoc doesn't automatically rewrite to `./guide.es.md`. That's a separate pass.
- **Translation quality gates** — no back-translation sanity check, no automated diff against a human-translated reference, no LLM-as-judge evaluation. The human reviewer is the quality gate.

## Dependencies

- **Phase 1 and 2** have no dependencies. They work for teams that translate manually today — no AI required. Ship these first.
- **Phase 3** depends on the AI provider abstraction and Settings panel updates. New dependency on `@anthropic-ai/sdk` and `openai` packages (devDep — shipped to the browser, user-provided keys).
- **Phase 4** depends on Phases 1–3. Merge picker UI is substantial.

## Security considerations

- **API key storage:** same trust story as the GitHub token. `localStorage` only. Warn users never to commit `.mardoc.json` containing keys.
- **Content egress:** every translation call sends the full document to the configured provider. Users MUST understand this — flag it prominently in the Settings panel and in the "translate" action's confirmation dialog. Per-repo opt-out for sensitive content.
- **Prompt injection:** a malicious markdown file could contain prompt-injection payloads aimed at the LLM. The translation flow treats the document as data, not instructions, and wraps it in clear delimiters in the prompt — but this isn't bulletproof. Document the risk.
- **Rate limits:** the AI provider has its own rate limits. Reuse the existing rate-limit circuit breaker pattern for translation calls — when the provider returns 429, pause translation until the reset and show a clear message.

## The shape of v1 success

A realistic scenario we should be able to demo:

1. A team has an English `README.md` and a Spanish PM who doesn't write English well
2. The PM opens the repo in MarDoc, navigates to `README.md`, clicks "Translate to Spanish"
3. A few seconds later, `README.es.md` opens in the editor with the translation and a review banner
4. The PM reviews, fixes a couple of awkward phrases, commits as a PR
5. A native Spanish reviewer on the team opens the PR, reads the rendered document (not a diff), leaves inline comments on anything that reads wrong, approves
6. PR merges. `README.es.md` is now canonical Spanish.
7. Two weeks later, someone updates `README.md` with a new section. MarDoc shows a staleness banner on `README.es.md` the next time anyone opens it. The PM clicks "view source diff," sees it's just a new paragraph, clicks "retranslate just this block," reviews the result, commits an update.

That's the flow. Every step happens in MarDoc. No external translation service, no copy-paste, no ticket to engineering to "update the Spanish docs."

## Related

- **038 — Cellphone mode** (shipped): the mobile reviewer on step 5 of the scenario above is a real user; mobile comment flow works for translations the same way it works for source files
- **033 — HTML inline comments** (shipped): HTML translations work through the same pipeline as markdown translations, same sibling detection rules, same frontmatter
- **024 — API error handling** (shipped): the rate-limit circuit breaker pattern is reusable for the AI provider
