import { RepoFile, PullRequest } from "@/types";

const MOCK_HTML_DOC = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Architecture Overview — MarDoc</title>
<script type="module">
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
mermaid.initialize({ startOnLoad: true, theme: 'base', themeVariables: {
  primaryColor: '#E6F1FB', primaryTextColor: '#0C447C', primaryBorderColor: '#85B7EB',
  secondaryColor: '#E1F5EE', lineColor: '#5F5E5A', textColor: '#2C2C2A', fontSize: '14px'
}});
<\/script>
<style>
  :root { --bg: #FAFAF8; --surface: #FFFFFF; --border: #E2E0D8; --text: #1A1A18; --accent: #185FA5; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); line-height: 1.7; font-size: 15px; }
  .page { max-width: 800px; margin: 0 auto; padding: 40px 24px 80px; }
  h1 { font-size: 28px; font-weight: 700; margin-bottom: 8px; }
  h2 { font-size: 20px; font-weight: 600; margin: 32px 0 12px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
  p { margin-bottom: 16px; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 20px; margin: 16px 0; }
  .card .label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #888; font-weight: 600; margin-bottom: 4px; }
  .card .value { font-size: 16px; font-weight: 600; }
  .diagram { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 20px; margin: 20px 0; }
  .diagram-title { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 12px; }
  code { font-family: "SFMono-Regular", Consolas, monospace; font-size: 13px; background: #F1EFE8; padding: 2px 6px; border-radius: 3px; }
</style>
</head>
<body>
<div class="page">
  <h1>MarDoc Architecture Overview</h1>
  <p>A browser-only PWA that transforms markdown review on GitHub into a rich document experience.</p>

  <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 24px 0;">
    <div class="card"><div class="label">Runtime</div><div class="value">Browser-only</div></div>
    <div class="card"><div class="label">Framework</div><div class="value">Next.js 14</div></div>
    <div class="card"><div class="label">Editor</div><div class="value">TipTap 2.11</div></div>
  </div>

  <h2>System Flow</h2>
  <div class="diagram">
    <div class="diagram-title">Request lifecycle</div>
    <pre class="mermaid">
flowchart LR
  A["Browser"] -->|"GitHub API"| B["Octokit"]
  B --> C["Repo Files"]
  B --> D["Pull Requests"]
  C --> E["TipTap Editor"]
  D --> F["DiffViewer"]
  E -->|"Turndown"| G["Markdown Commit"]
  F --> H["Inline Comments"]
  style A fill:#E6F1FB,stroke:#85B7EB,color:#0C447C
  style B fill:#FAEEDA,stroke:#FAC775,color:#633806
  style E fill:#E1F5EE,stroke:#5DCAA5,color:#085041
  style F fill:#E1F5EE,stroke:#5DCAA5,color:#085041
    </pre>
  </div>

  <h2>Key Design Decisions</h2>
  <p><strong>Zero backend.</strong> Everything runs in the browser. Static export to GitHub Pages via Next.js. The GitHub API (via <code>Octokit</code>) is the only external dependency.</p>
  <p><strong>Markdown-first.</strong> The source of truth is always <code>.md</code> files in a repo. The editor renders markdown but round-trips back to markdown for commits.</p>
  <p><strong>Progressive enhancement.</strong> The app works in demo mode with zero config. Adding a GitHub PAT unlocks real repos.</p>
</div>
</body>
</html>`;

const MOCK_HTML_DOC_V2 = MOCK_HTML_DOC.replace(
  "<h2>Key Design Decisions</h2>",
  `<h2>HTML Document Support</h2>
  <p><strong>New in v0.4:</strong> MarDoc now renders HTML documents alongside markdown. AI-generated reports, architecture guides, and styled documents render beautifully in the viewer.</p>

  <h2>Key Design Decisions</h2>`
);

export const repoFiles: RepoFile[] = [
  {
    id: "1",
    name: "docs",
    path: "docs",
    type: "folder",
    children: [
      {
        id: "2",
        name: "getting-started.md",
        path: "docs/getting-started.md",
        type: "file",
        content: `# Getting Started

Welcome to the **mardoc.app** — a collaborative markdown workspace backed by GitHub.

## Installation

To get started, clone the repository and install dependencies:

\`\`\`bash
git clone https://github.com/your-org/markdoc-editor.git
cd markdoc-editor
npm install
npm run dev
\`\`\`

## Quick Start

1. Open the sidebar to browse your repository files
2. Click on any markdown file to open it in the editor
3. Edit using the WYSIWYG toolbar or write raw markdown
4. Changes are automatically synced to GitHub

## Features

- **WYSIWYG Editing**: Write markdown with a rich text editor
- **GitHub Sync**: All files are backed by a GitHub repository
- **PR Reviews**: Review pull requests with rendered diff views
- **Inline Comments**: Comment on specific sections of documents
- **Dark Mode**: Toggle between light and dark themes

## Architecture

The application uses a modern React stack with Next.js for server-side rendering and TipTap for the editor component. The GitHub integration uses Octokit to interact with the GitHub API.

> **Note**: This is a prototype with mock data. GitHub integration will be added in a future release.
`,
      },
      {
        id: "3",
        name: "api-reference.md",
        path: "docs/api-reference.md",
        type: "file",
        content: `# API Reference

This document covers the core APIs available in the mardoc.app.

## Editor API

### \`useEditor()\`

Returns the TipTap editor instance with all configured extensions.

\`\`\`typescript
const editor = useEditor({
  extensions: [StarterKit, Placeholder],
  content: initialContent,
});
\`\`\`

### \`useDocument(path: string)\`

Fetches and manages a document from the GitHub repository.

\`\`\`typescript
const { content, save, loading } = useDocument("docs/readme.md");
\`\`\`

## GitHub API

### Authentication

All API calls require a valid GitHub token. Configure your token in the settings panel or via environment variables.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | \`/api/files\` | List repository files |
| GET | \`/api/files/:path\` | Get file content |
| PUT | \`/api/files/:path\` | Update file content |
| POST | \`/api/pr\` | Create pull request |
| GET | \`/api/pr/:id\` | Get PR details |

## Webhooks

The editor supports GitHub webhooks for real-time synchronization. Configure your webhook URL in the repository settings.

---

*Last updated: March 2026*
`,
      },
      {
        id: "9",
        name: "creating-a-github-pat.md",
        path: "docs/creating-a-github-pat.md",
        type: "file",
        content: `# Creating a GitHub Personal Access Token

mardoc.app connects to your GitHub repositories using a **Personal Access Token (PAT)**. This guide walks you through creating one with the right permissions.

## Step 1: Open GitHub Token Settings

Navigate to [github.com/settings/tokens](https://github.com/settings/tokens) and click **Generate new token** → **Generate new token (classic)**.

> **Tip**: You can also use fine-grained tokens for tighter scope control. The steps below cover classic tokens, which are simpler to set up.

## Step 2: Configure the Token

| Setting | Value |
|---------|-------|
| **Note** | \`mardoc.app\` (or any label you'll recognize) |
| **Expiration** | 90 days recommended — you can always regenerate |
| **Scopes** | See below |

### Required Scopes

Check these two boxes:

- \`repo\` — full read/write on any repository you already have access to. Checking this top-level box ticks all six sub-scopes automatically.
- \`read:org\` — needed if any of the repositories you want to review belong to a GitHub organization. Without it, org repos (and anything behind SAML SSO) won't show up reliably in the picker. Skip only if every repo you review is in your personal account.

\`\`\`
✅  repo
  ✅  repo:status
  ✅  repo_deployment
  ✅  public_repo
  ✅  repo:invite
  ✅  security_events
✅  read:org              ← check this if you want to see org repos
\`\`\`

### One extra step for SSO-protected orgs

After generating the token, the token list page shows a **Configure SSO** button next to it. Click that and authorize each organization you want to see repos from. Without this step, SSO orgs stay invisible even with both scopes set.

## Step 3: Generate and Copy

1. Click **Generate token**
2. **Copy the token immediately** — GitHub will not show it again
3. Store it somewhere safe (a password manager is ideal)

## Step 4: Connect to mardoc.app

1. Open mardoc.app
2. Click the **⚙ Settings** icon in the sidebar
3. Paste your token into the **GitHub Token** field
4. Click **Connect**

You should see your repositories appear in the sidebar. You're all set!

## Troubleshooting

### "Bad credentials" error

- Double-check that you copied the full token (it starts with \`ghp_\`)
- Verify the token hasn't expired in your [GitHub settings](https://github.com/settings/tokens)

### Can't see a repository

- Ensure the token has \`repo\` scope
- For organization repos, you may need \`read:org\` scope and SSO authorization
- Check that you have at least read access to the repository

### Token expired

Generate a new token following the steps above, then update it in mardoc.app Settings.

---

*Need help? Open an issue at [github.com/mardoc-io/mardoc-io.github.io](https://github.com/mardoc-io/mardoc-io.github.io/issues).*
`,
      },
      {
        id: "9",
        name: "architecture-overview.html",
        path: "docs/architecture-overview.html",
        type: "file",
        content: MOCK_HTML_DOC,
      },
      {
        id: "8",
        name: "contributing.md",
        path: "docs/contributing.md",
        type: "file",
        content: `# Contributing Guide

Thank you for your interest in contributing to mardoc.app!

## Development Setup

Fork the repository and create a feature branch:

\`\`\`bash
git checkout -b feature/my-new-feature
\`\`\`

## Pull Request Process

1. Ensure your code passes all linting checks
2. Write or update tests as needed
3. Update documentation for any changed functionality
4. Submit a PR against the \`main\` branch

## Code Style

We follow the project's ESLint and Prettier configuration. Run \`npm run lint\` before submitting.

## Reporting Issues

Please use GitHub Issues to report bugs. Include:
- Steps to reproduce
- Expected vs actual behavior
- Screenshots if applicable
`,
      },
    ],
  },
  {
    id: "4",
    name: "README.md",
    path: "README.md",
    type: "file",
    content: `# mardoc.app

A modern markdown workspace backed by GitHub. Edit, review, and collaborate on documentation — without leaving your browser.

## Overview

mardoc.app brings a Notion-like editing experience to your GitHub-backed markdown files. Review PRs with rendered diffs, leave inline comments, and collaborate seamlessly.

## Features

### Rich Editing

Write in a WYSIWYG editor powered by TipTap — or drop into raw markdown. The editor supports everything you'd expect:

| Syntax | Renders as | Shortcut |
|--------|-----------|----------|
| \`**bold**\` | **bold** | ⌘B |
| \`*italic*\` | *italic* | ⌘I |
| \`~~strike~~\` | ~~strike~~ | — |
| \`> quote\` | blockquote | — |

### Code Blocks

Full syntax highlighting for all major languages:

` + "```typescript\n" + `interface Document {
  path: string;
  content: string;
  lastModified: Date;
}

async function loadDocument(path: string): Promise<Document> {
  const response = await fetch(\`/api/files/\${path}\`);
  return response.json();
}
` + "```\n\n```python\n" + `# Python works too
def render_markdown(source: str) -> str:
    """Convert markdown source to HTML."""
    return markdown.convert(source)
` + "```\n\n" + `### Diagrams with Mermaid

Embed diagrams directly in your markdown — they render inline:

` + "```mermaid\n" + `sequenceDiagram
    participant User
    participant mardoc
    participant GitHub

    User->>mardoc: Edit document
    mardoc->>GitHub: Create branch
    mardoc->>GitHub: Commit changes
    mardoc->>GitHub: Open pull request
    GitHub-->>mardoc: PR created
    mardoc-->>User: Review link ready
` + "```\n\n```mermaid\n" + `graph LR
    A[Markdown Files] --> B[mardoc.app]
    B --> C[GitHub Repository]
    C --> D[Pull Requests]
    D --> E[Review & Merge]
    E --> A
` + "```\n\n" + `### Pull Request Reviews

Review documentation changes with rendered diffs — not raw markdown:

| View Mode | Best For |
|-----------|----------|
| **Inline Diff** | Seeing what changed in the final output |
| **Side by Side** | Comparing before and after, line by line |
| **Preview** | Reading the result as a reader would |

### Inline Comments

Click any paragraph, heading, or code block to leave a comment anchored to that specific content. Comments thread into GitHub PR reviews.

## GitHub Integration

mardoc.app is a thin layer on top of GitHub. Your repository is the source of truth.

` + "```mermaid\n" + `graph TD
    A[Your Repository] -->|read| B[mardoc.app]
    B -->|branch + commit| A
    A -->|PR review| B
    B -->|comments| A
` + "```\n\n" + `| Permission | Why |
|-----------|-----|
| \`repo\` | Read files, create branches, open PRs |
| \`read:org\` | Browse organization repos (required if you have any) |

We never store your code. Every read and write goes directly to the GitHub API. See the [PAT setup guide](docs/creating-a-github-pat.md) to get started.

## Display Options

- **Dark & Light Mode** — toggle in the header
- **Wide Format** — expand the content area for tables and diagrams
- **Branch Selector** — switch branches without leaving the editor

## Getting Started

See the [Getting Started Guide](docs/getting-started.md) for setup instructions.

## License

MIT
`,
  },
  {
    id: "5",
    name: "CHANGELOG.md",
    path: "CHANGELOG.md",
    type: "file",
    content: `# Changelog

## v0.3.0 - 2026-04-01

### Added
- Wide format toggle — expand content area for tables and diagrams
- Branch selector — switch branches without leaving the editor
- Restore last repo on return — picks up where you left off

### Improved
- Mermaid diagram rendering in Editor and DiffViewer
- Image rendering from private repos via authenticated GitHub API

## v0.2.0 - 2026-03-31

### Added
- PR file tree sidebar with collapsible navigation
- Mermaid diagram support in rendered views
- Private repo image rendering via GitHub API
- Editor image and mermaid rendering fixes

## v0.1.0 - 2026-03-30

### Added
- Initial release with core editor functionality
- GitHub integration with PAT authentication
- PR diff viewer with rendered comparison
- Inline commenting system
- Light and dark mode themes
- File tree sidebar navigation
`,
  },
];

export const pullRequests: PullRequest[] = [
  {
    id: "pr-1",
    number: 42,
    title: "Update getting started guide with new installation steps",
    author: "joe.barnett",
    status: "open",
    createdAt: "2026-03-30T14:30:00Z",
    baseBranch: "main",
    headBranch: "docs/update-getting-started",
    description: "Updates the getting started guide with clearer installation instructions and adds a troubleshooting section.",
    files: [
      {
        path: "docs/getting-started.md",
        status: "modified",
        baseContent: `# Getting Started

Welcome to the **mardoc.app** — a collaborative markdown workspace backed by GitHub.

![Architecture overview](data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCI+PHJlY3Qgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0IiBmaWxsPSIjMDBmIi8+PC9zdmc+)

## Installation

To get started, clone the repository and install dependencies:

\`\`\`bash
git clone https://github.com/your-org/markdoc-editor.git
cd markdoc-editor
npm install
npm run dev
\`\`\`

## Quick Start

1. Open the sidebar to browse your repository files
2. Click on any markdown file to open it in the editor
3. Edit using the WYSIWYG toolbar or write raw markdown
4. Changes are automatically synced to GitHub

## Features

- **WYSIWYG Editing**: Write markdown with a rich text editor
- **GitHub Sync**: All files are backed by a GitHub repository
- **PR Reviews**: Review pull requests with rendered diff views
- **Inline Comments**: Comment on specific sections of documents
- **Dark Mode**: Toggle between light and dark themes

## Architecture

The application uses a modern React stack with Next.js for server-side rendering and TipTap for the editor component. The GitHub integration uses Octokit to interact with the GitHub API.

> **Note**: This is a prototype with mock data. GitHub integration will be added in a future release.`,
        headContent: `# Getting Started

Welcome to the **mardoc.app** — a collaborative markdown workspace backed by GitHub.

![Architecture overview](data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCI+PHJlY3Qgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0IiBmaWxsPSIjMDBmIi8+PC9zdmc+)

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** v18 or higher
- **npm** v9 or higher (or yarn/pnpm)
- A **GitHub account** with a personal access token

## Installation

To get started, clone the repository and install dependencies:

\`\`\`bash
git clone https://github.com/your-org/markdoc-editor.git
cd markdoc-editor
npm install
\`\`\`

Then configure your environment:

\`\`\`bash
cp .env.example .env.local
# Edit .env.local with your GitHub token
\`\`\`

Start the development server:

\`\`\`bash
npm run dev
\`\`\`

## Quick Start

1. Open the sidebar to browse your repository files
2. Click on any markdown file to open it in the editor
3. Edit using the WYSIWYG toolbar or write raw markdown
4. Changes are automatically synced to GitHub
5. Use the PR view to review changes before merging

## Features

- **WYSIWYG Editing**: Write markdown with a rich text editor
- **GitHub Sync**: All files are backed by a GitHub repository
- **PR Reviews**: Review pull requests with rendered diff views
- **Inline Comments**: Comment on specific sections of documents
- **Dark Mode**: Toggle between light and dark themes
- **Keyboard Shortcuts**: Fast editing with familiar shortcuts

## Troubleshooting

### Common Issues

**Port already in use**: If port 3000 is taken, use \`npm run dev -- -p 3001\`.

**GitHub token errors**: Ensure your token has \`repo\` scope permissions.

**Build failures**: Try deleting \`node_modules\` and \`.next\`, then run \`npm install\` again.

## Architecture

The application uses a modern React stack with Next.js for server-side rendering and TipTap for the editor component. The GitHub integration uses Octokit to interact with the GitHub API.

> **Note**: This is a prototype with mock data. Full GitHub integration coming in v0.2.0.`,
      },
    ],
    comments: [
      {
        id: "c1",
        author: "sarah.chen",
        avatarColor: "#e76f51",
        body: "Great addition! The prerequisites section is really helpful for newcomers.",
        createdAt: "2026-03-30T15:00:00Z",
        blockIndex: 1,
        resolved: false,
        replies: [
          {
            id: "c1-r1",
            author: "joe.barnett",
            avatarColor: "#264653",
            body: "Thanks! I wanted to make sure the onboarding experience is smooth.",
            createdAt: "2026-03-30T15:30:00Z",
          },
        ],
      },
      {
        id: "c2",
        author: "alex.kim",
        avatarColor: "#2a9d8f",
        body: "Should we mention that Docker is also an option? We have a docker-compose setup.",
        createdAt: "2026-03-30T16:30:00Z",
        blockIndex: 3,
        resolved: false,
        replies: [],
      },
    ],
  },
  {
    id: "pr-2",
    number: 43,
    title: "Add API rate limiting documentation",
    author: "sarah.chen",
    status: "open",
    createdAt: "2026-03-29T09:00:00Z",
    baseBranch: "main",
    headBranch: "docs/api-rate-limits",
    description: "Adds documentation about API rate limiting behavior and best practices.",
    files: [
      {
        path: "docs/api-reference.md",
        status: "modified",
        baseContent: `# API Reference

This document covers the core APIs available in the mardoc.app.

## Editor API

### \`useEditor()\`

Returns the TipTap editor instance with all configured extensions.

\`\`\`typescript
const editor = useEditor({
  extensions: [StarterKit, Placeholder],
  content: initialContent,
});
\`\`\`

### \`useDocument(path: string)\`

Fetches and manages a document from the GitHub repository.

\`\`\`typescript
const { content, save, loading } = useDocument("docs/readme.md");
\`\`\`

## GitHub API

### Authentication

All API calls require a valid GitHub token. Configure your token in the settings panel or via environment variables.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | \`/api/files\` | List repository files |
| GET | \`/api/files/:path\` | Get file content |
| PUT | \`/api/files/:path\` | Update file content |
| POST | \`/api/pr\` | Create pull request |
| GET | \`/api/pr/:id\` | Get PR details |

## Webhooks

The editor supports GitHub webhooks for real-time synchronization. Configure your webhook URL in the repository settings.

---

*Last updated: March 2026*`,
        headContent: `# API Reference

This document covers the core APIs available in the mardoc.app.

## Editor API

### \`useEditor()\`

Returns the TipTap editor instance with all configured extensions.

\`\`\`typescript
const editor = useEditor({
  extensions: [StarterKit, Placeholder],
  content: initialContent,
});
\`\`\`

### \`useDocument(path: string)\`

Fetches and manages a document from the GitHub repository.

\`\`\`typescript
const { content, save, loading } = useDocument("docs/readme.md");
\`\`\`

## GitHub API

### Authentication

All API calls require a valid GitHub token. Configure your token in the settings panel or via environment variables.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | \`/api/files\` | List repository files |
| GET | \`/api/files/:path\` | Get file content |
| PUT | \`/api/files/:path\` | Update file content |
| POST | \`/api/pr\` | Create pull request |
| GET | \`/api/pr/:id\` | Get PR details |

### Rate Limiting

The API enforces rate limits to ensure fair usage:

- **Authenticated requests**: 5,000 per hour
- **Unauthenticated requests**: 60 per hour
- **Search API**: 30 requests per minute

When you exceed the rate limit, the API returns a \`429 Too Many Requests\` response with a \`Retry-After\` header.

\`\`\`typescript
// Example: handling rate limits
try {
  const response = await api.getFiles();
} catch (error) {
  if (error.status === 429) {
    const retryAfter = error.headers["retry-after"];
    console.log(\`Rate limited. Retry after \${retryAfter}s\`);
  }
}
\`\`\`

## Webhooks

The editor supports GitHub webhooks for real-time synchronization. Configure your webhook URL in the repository settings.

---

*Last updated: March 2026*`,
      },
    ],
    comments: [
      {
        id: "c3",
        author: "joe.barnett",
        avatarColor: "#264653",
        body: "We should also document the GraphQL API rate limits — they use a point system instead of simple request counts.",
        createdAt: "2026-03-29T10:15:00Z",
        blockIndex: 5,
        resolved: false,
        replies: [],
      },
    ],
  },
  {
    id: "pr-3",
    number: 38,
    title: "Reorganize changelog format",
    author: "alex.kim",
    status: "merged",
    createdAt: "2026-03-25T11:00:00Z",
    baseBranch: "main",
    headBranch: "chore/changelog-format",
    description: "Reorganizes the changelog to follow Keep a Changelog format.",
    files: [
      {
        path: "CHANGELOG.md",
        status: "modified",
        baseContent: `# Changelog

## v0.1.0

- Initial release
- Added editor
- Added dark mode`,
        headContent: `# Changelog

## v0.1.0 - 2026-03-31

### Added
- Initial release with core editor functionality
- GitHub mock integration
- PR diff viewer with rendered comparison
- Inline commenting system
- Light and dark mode themes
- File tree sidebar navigation

### Known Issues
- GitHub API integration is mocked (coming in v0.2.0)
- Real-time collaboration not yet supported`,
      },
    ],
    comments: [],
  },
  {
    id: "pr-4",
    number: 37,
    title: "Add architecture overview as HTML document",
    author: "joe.barnett",
    status: "open",
    createdAt: "2026-04-05T09:00:00Z",
    baseBranch: "main",
    headBranch: "docs/html-architecture",
    description: "Adds a rich HTML architecture overview with mermaid diagrams, styled cards, and visual layout — demonstrating MarDoc's new HTML rendering support.",
    files: [
      {
        path: "docs/architecture-overview.html",
        status: "modified",
        baseContent: MOCK_HTML_DOC,
        headContent: MOCK_HTML_DOC_V2,
      },
    ],
    comments: [],
  },
];

// Helper to find a file in the tree
export function findFile(files: RepoFile[], path: string): RepoFile | null {
  for (const file of files) {
    if (file.path === path) return file;
    if (file.children) {
      const found = findFile(file.children, path);
      if (found) return found;
    }
  }
  return null;
}

// Helper to flatten file tree
export function flattenFiles(files: RepoFile[]): RepoFile[] {
  const result: RepoFile[] = [];
  for (const file of files) {
    if (file.type === "file") result.push(file);
    if (file.children) result.push(...flattenFiles(file.children));
  }
  return result;
}
