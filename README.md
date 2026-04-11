# MarDoc

**Review markdown like a document, not a diff.**

MarDoc is a browser-only markdown review and editing tool for GitHub pull requests. It renders your docs as rich, formatted text — headings, tables, images, footnotes, alerts — so you can review prose the way it was meant to be read. Select any passage, leave an inline comment, batch it into a single review, and ship. Edit in WYSIWYG or raw markdown. Paste images and they commit straight to your repo.

> **No backend. No signup. No data leaves your browser.** Your GitHub token is stored locally and every API call goes directly from you to GitHub.

![MarDoc screenshot](docs/assets/screenshot.png)

## The problem

GitHub's pull-request UI treats markdown like source code: plus lines, minus lines, no rendering. For prose — documentation, RFCs, ADRs, AI-generated reports, anything written for human consumption — that's the wrong default. You end up mentally rendering every heading and list while trying to decide if the *content* is actually right. Worse, you can't tell at a glance whether a one-word change improved the sentence or broke it.

MarDoc is the correction.

## What it does

**Render-first review**
- PR markdown files render as formatted documents with word-level change highlighting
- Four view modes: Inline diff, Side-by-side, Suggest (edit blocks as proposed changes), Preview (final rendered)
- Full GFM: headings, lists, tables, fenced code with syntax highlighting, mermaid diagrams, GitHub alerts (`> [!NOTE]`), footnotes (`[^1]`)
- Scroll-spy outline panel for long documents

**Inline commenting that round-trips to GitHub**
- Select any text → comment appears in the sidebar
- Comments queue as a pending review, submit as **one** GitHub notification (not N)
- Inline comments tied to exact line ranges via the PR review API
- Approve / Request Changes wired to `pulls.createReview`
- Reply threads, resolve, resolve-all
- Fallback to general PR comments when a line can't be resolved in the diff

**Suggestions and edits**
- Suggest mode: click any block, edit the raw markdown, submit as a GitHub suggestion
- Accept suggestions applies them as commits to the PR branch
- Delete button: queue an empty-body suggestion to propose removing a block
- Full rich editor (TipTap) for direct edits, commit-as-PR workflow

**Images**
- Paste or drag-drop images in the editor → commits to the repo under a folder you configure per-repo (default `docs/images`)
- Click-popover with width/height inputs, percent or pixels, aspect-ratio lock
- Drag-handle resize from the corner
- Center checkbox (wraps in `<div align="center">` so GitHub renders centered)
- New-file drafts: images queue locally under blob URLs, commit atomically with the doc on save — abandoned drafts don't leak into the repo

**Writing quality-of-life**
- Autosave to localStorage per `{repo, branch, path}` with a restore banner on reopen
- Nav-guard modal + `beforeunload` on unsaved changes
- Cmd+F find/replace in both rich and code views — case/word/regex, navigation, replace-all
- Cmd+Shift+P command palette (VS Code style)
- `?` key opens a filterable keyboard shortcut cheatsheet
- Word count + reading time in the toolbar
- Dark mode

**Demo mode**
- Everything works with sample data — no GitHub token required — so you can try it before you authenticate

**Tested**
- 560+ unit tests covering the review pipeline, markdown parsing, find/replace, image upload, suggestion handling, and the contracts behind every feature above

## Who is this for

- **Technical writers** reviewing documentation PRs without decoding diff syntax
- **Engineering teams** reviewing ADRs, RFCs, README changes, API docs, and runbooks
- **Teams reviewing AI-generated documentation** in source control — the crowd feeding GPT/Claude outputs into git-tracked markdown files needs a human-review UX that isn't a plus-minus diff
- **Open-source maintainers** with large markdown surfaces (READMEs, wikis, docs sites) that get non-stop contributor PRs
- **Anyone** who writes or reviews prose that happens to live in a GitHub repo

## Why not...

**...the native GitHub PR UI?** It shows a diff. For code that's right, for prose it isn't. You cannot see whether a rewritten paragraph reads better until it's rendered, and GitHub doesn't render it during review.

**...github.dev (the `.` keyboard shortcut)?** It's a code editor. It gives you VS Code in the browser, which is great for source code, but it still shows markdown as source text. No rendered review, no inline review comments on rendered blocks, no word-level prose diff.

**...Notion / Confluence?** Your docs stop being version-controlled, reviewable, and linkable from code. Every change requires a separate workflow that doesn't sync back to the repo. MarDoc lets you keep documents in git and review them like they aren't.

**...Obsidian / HackMD / Typora?** Those are writing tools. They're excellent at local editing but they aren't PR review tools — no inline GitHub review comments, no batched review submission, no suggestion workflow, no commit-back.

**...a GitHub App?** MarDoc is client-only on purpose. A GitHub App requires a server you have to trust. MarDoc's trust story is "the code runs in your browser, your token stays local, every API call is direct." If you want self-hosting, `git clone && npm run build` and you have your own copy.

## Quick start

1. Go to [mardoc.app](https://mardoc.app)
2. Click the settings gear → **GitHub Connection** tab
3. Follow the in-app instructions to create a **classic** personal access token (one `repo` scope — one click on GitHub)
4. Paste the `ghp_...` token
5. Open the **Repository** tab, pick a repo, and start reviewing

No install. No signup. Your token is stored in `localStorage`, used directly against GitHub's REST API, and never sent anywhere else.

### Try it without a token

Visit [mardoc.app](https://mardoc.app) in demo mode and explore sample repos and pull requests. Every feature above works against the built-in mock data — the only difference from real mode is that commits don't post to GitHub.

## Run locally

```bash
git clone https://github.com/mardoc-io/mardoc-io.github.io.git
cd mardoc-io.github.io
npm install
npm run dev
```

Open http://localhost:3000. The build target is a static export to GitHub Pages — `npm run build` produces the exact deployment artifact.

## Architecture

MarDoc is deliberately minimal infrastructure:

- **Next.js 14** with static export. No server-side rendering, no API routes, no database.
- **GitHub Pages** hosting via the project's own GitHub repo. Same trust surface as any other `github.io` site.
- **Octokit** for every GitHub interaction. Calls happen from the browser directly to `api.github.com`, authenticated with your PAT.
- **TipTap** (ProseMirror) for the rich editor. **Showdown** for markdown → HTML rendering in the diff view. **Turndown** for HTML → markdown on save. All client-side.
- **Tailwind CSS** + a Tailwind Typography setup tuned for the dark/light theme variables.
- **Zero auth backend.** No Auth0, no Firebase, no Clerk — the Personal Access Token IS the identity layer.

Everything that could be a server isn't. If the project ever grows a backend, it'll be for features that genuinely require one (e.g., AI-generated content, shared workspaces) — the core review flow will stay client-only.

## License

[Elastic License 2.0](./LICENSE) (ELv2).

Source is available. You can read the code, run it locally, self-host MarDoc for your own internal use, fork it, and contribute back. You **cannot** provide MarDoc to third parties as a hosted or managed service — that's a commercial right reserved for the maintainers.

This is a deliberate choice. The MIT license would let any well-capitalized dev-tools company clone MarDoc and ship it as a paid SaaS with no obligation back to the project; ELv2 closes that door while keeping the code visible, forkable, and self-hostable.

See [elastic.co/licensing/elastic-license](https://www.elastic.co/licensing/elastic-license) for the canonical license text.

## Contributing

Pull requests are welcome. The project uses the feature-sliced delivery style in `docs/features/` — one markdown file per story, moved to `docs/features/done/` on ship. Tests are non-negotiable: every new behavior gets unit-test coverage alongside the code. `npm test` and `npm run build` must both be clean before a PR merges.

Bug reports and feature requests: [open an issue](https://github.com/mardoc-io/mardoc-io.github.io/issues).
