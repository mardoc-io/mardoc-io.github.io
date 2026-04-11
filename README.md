# MarDoc

**Markdown and HTML, accessible to everyone on your team.**

MarDoc is a browser-only document layer over GitHub. It takes the markdown and HTML files that already live in your repo and turns them into rendered documents anyone can read, comment on, and edit — no git knowledge, no command line, no decoding diff syntax. Your PM, your designer, your head of marketing, your legal reviewer, your exec sponsor: everyone who cares about what the docs say can now contribute to them directly, in the place they already live.

> **No backend. No signup. No data leaves your browser.** Your GitHub token is stored locally and every API call goes directly from you to GitHub.

![MarDoc screenshot](docs/assets/screenshot.png)

## The problem

Your engineering team put the docs in source control for good reasons: version history, branch workflows, PR review, a single source of truth that lives next to the code it describes. But that decision locked half your organization out.

Non-engineers on your team — product managers, designers, writers, legal reviewers, executives — open GitHub's pull-request UI and see a wall of `+` and `-` lines wrapped in backticks and asterisks. Markdown they could read just fine as a rendered document is suddenly unreadable as source. So the review doesn't happen. Or it happens in Notion. Or Google Docs. Or a thread of emailed screenshots. And then someone on eng has to copy the feedback back into the repo by hand.

The docs that define your strategy, your brand voice, your API contracts, your onboarding, your incident response, your policy — those docs are only as good as the people who can review them. When review is gated on reading git syntax, most of your team can't participate.

MarDoc removes the gate. Same GitHub repo, same files, same commits — wrapped in a layer anyone can use: rendered documents, inline comments, WYSIWYG editing, paste-to-upload images, real pull requests going back to the repo when they're done. Your docs stay in source control. Your team finally gets to review them.

## For everyone on the team

- **Product managers** reviewing specs, RFCs, and ADRs
- **Designers** editing UX writing and marketing copy
- **Technical writers** polishing documentation without touching the command line
- **Executives and legal reviewers** approving policy, brand, and compliance docs
- **Engineers** shipping documentation PRs that actually get reviewed
- **Teams using AI-generated content** — anyone whose LLM outputs land in git-tracked markdown files needs a human-review UX that isn't a unified diff
- **Open-source maintainers** drowning in documentation contributions from community members who don't know git

If it's a markdown or HTML file and it lives in a GitHub repo, MarDoc makes it reviewable and editable by everyone, not just the people on the codebase.

## What you can do

**Read the document, not the diff.**
Open any `.md` or `.html` file in a pull request and see it rendered — headings, tables, images, lists, footnotes, code samples, mermaid diagrams, GitHub alerts. Four view modes (inline diff, side-by-side, suggestion, preview) for different review styles. Word-level change highlighting, not plus-minus lines. Scroll-spy outline for long docs.

**Highlight a sentence and leave a comment — like you would in Google Docs.**
Select any text in the rendered view and type a comment. Your comments queue as a single pending review and go to GitHub as **one** inline review comment notification, not N emails to the author. Approve, request changes, reply to threads, resolve them. Comments are tied to the exact line in the source file, so when the engineer on the team reads them, they land in the right place.

**Edit the document in a WYSIWYG editor.**
No markdown syntax required. Type headings the way you'd type them in a word processor, bold with `Cmd+B`, insert links with `Cmd+K`, make a list by pressing bullet. Toggle to raw markdown if you want — the same document, two views. MarDoc converts back and forth without losing formatting.

**Propose changes as suggestions.**
Click any paragraph, edit it, and your edit becomes a GitHub "suggestion" — the reviewer (or you) can accept it with one click and it lands as a real commit on the PR branch. No manual copy-paste, no "can you change line 47 to say…" comments.

**Paste images. They just work.**
Screenshot something, paste it into the editor, and MarDoc uploads the image to your repo automatically — at whatever folder you configured (`docs/images`, `docs/assets`, wherever your team keeps them). Drag-drop works too. Click the image to resize it, tick a box to center it. When you save the document, every image is already there.

**Write the way you review.**
Cmd+F finds and replaces in both the rich and code views. A command palette (`Cmd+Shift+P`) opens everything the app can do. `?` shows every keyboard shortcut in a filterable list. Autosave protects your work in the browser across refreshes. A word count and reading time tick along in the toolbar. Dark mode.

**Try it before you connect anything.**
Demo mode ships with sample repositories and sample pull requests. Every feature above works against the built-in data — no GitHub token required. You find out if MarDoc fits before you give it any credentials.

**Verified.**
560+ unit tests cover the review pipeline, the markdown parsing, the comment submission, the image upload, the suggestion round-trip — every contract the product depends on. `npm test` is clean on every merge.

## Why not…

**…ask engineers to paste docs into Notion / Google Docs so non-technical reviewers can comment, then paste the feedback back?**
That's the status quo for most teams, and it breaks every link between the document and its repo. No version history. No review-by-PR. No single source of truth. Feedback gets lost in translation and engineering ends up transcribing comments by hand. MarDoc keeps the document in git and brings the non-technical reviewer to it — same tab, same GitHub repo, no synchronization problem.

**…use the native GitHub PR UI?**
It shows a diff with raw markdown syntax. For code that's fine; for prose it's unreadable. A product manager opening a spec PR on github.com sees ``+## Background`` and `-## Context` and has no idea which version reads better. Half your reviewers bounce. MarDoc fixes the exact thing that kept them out.

**…use github.dev (the `.` keyboard shortcut on any repo page)?**
It's a code editor — great for developers editing source, useless for non-developers reviewing docs. No rendered view during review, no inline review comments on rendered blocks, no word-level prose diff, no WYSIWYG.

**…use Notion / Confluence / Google Docs as the doc system?**
Then the docs stop being version-controlled, reviewable-by-PR, and linkable from code. Every change requires a separate workflow that doesn't sync back to the codebase. Docs and code drift. MarDoc lets docs live in the repo and still be editable by people who don't know what a repo is.

**…use Obsidian / HackMD / Typora as the editor?**
Those are single-user writing tools. They're great at local editing but they aren't review tools — no inline GitHub review comments, no batched review submission, no suggestion-as-commit workflow, no commit-back to the branch.

**…build a GitHub App?**
MarDoc is client-only on purpose. A GitHub App requires a server you have to trust with your users' tokens. MarDoc's trust story is "the code runs in your browser, your token stays local, every API call is direct from you to GitHub." Self-hosting is `git clone && npm run build` and you have your own copy — no infrastructure, no subscription, no vendor in the middle.

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
