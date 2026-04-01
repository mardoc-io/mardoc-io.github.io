"use client";

import { Octokit } from "@octokit/rest";
import { RepoFile, PullRequest, PRFile, PRComment } from "@/types";

let octokitInstance: Octokit | null = null;

export function initOctokit(token: string) {
  octokitInstance = new Octokit({ auth: token });
  return octokitInstance;
}

export function getOctokit(): Octokit | null {
  return octokitInstance;
}

function parseOwnerRepo(repo: string): { owner: string; repo: string } {
  // Accepts "owner/repo" or full GitHub URLs
  const cleaned = repo
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/\/$/, "")
    .replace(/\.git$/, "");
  const [owner, repoName] = cleaned.split("/");
  return { owner, repo: repoName };
}

// ─── Repository Files ──────────────────────────────────────────────────────

export async function fetchRepoTree(
  repoFullName: string,
  branch: string = "main"
): Promise<RepoFile[]> {
  const octokit = getOctokit();
  if (!octokit) throw new Error("Not authenticated");

  const { owner, repo } = parseOwnerRepo(repoFullName);

  try {
    // Get the full tree recursively
    const { data } = await octokit.git.getTree({
      owner,
      repo,
      tree_sha: branch,
      recursive: "1",
    });

    // Build a tree structure from flat list
    const fileMap = new Map<string, RepoFile>();
    const roots: RepoFile[] = [];

    // Sort so directories come before files
    const sortedItems = data.tree
      .filter((item) => item.type === "blob" || item.type === "tree")
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === "tree" ? -1 : 1;
        return (a.path || "").localeCompare(b.path || "");
      });

    for (const item of sortedItems) {
      const path = item.path || "";
      const parts = path.split("/");
      const name = parts[parts.length - 1];

      // Only show markdown files and their parent directories
      const isMarkdown = name.endsWith(".md") || name.endsWith(".mdx");
      const isDir = item.type === "tree";

      const file: RepoFile = {
        id: item.sha || path,
        name,
        path,
        type: isDir ? "folder" : "file",
        children: isDir ? [] : undefined,
      };

      fileMap.set(path, file);

      if (parts.length === 1) {
        // Root-level item
        if (isDir || isMarkdown) {
          roots.push(file);
        }
      } else {
        // Nested item — find parent
        const parentPath = parts.slice(0, -1).join("/");
        const parent = fileMap.get(parentPath);
        if (parent && parent.children && (isDir || isMarkdown)) {
          parent.children.push(file);
        }
      }
    }

    // Remove empty directories
    const pruneEmptyDirs = (files: RepoFile[]): RepoFile[] => {
      return files.filter((f) => {
        if (f.type === "folder" && f.children) {
          f.children = pruneEmptyDirs(f.children);
          return f.children.length > 0;
        }
        return true;
      });
    };

    return pruneEmptyDirs(roots);
  } catch (error: any) {
    console.error("Failed to fetch repo tree:", error);
    throw error;
  }
}

export async function fetchFileContent(
  repoFullName: string,
  path: string,
  ref?: string
): Promise<string> {
  const octokit = getOctokit();
  if (!octokit) throw new Error("Not authenticated");

  const { owner, repo } = parseOwnerRepo(repoFullName);

  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });

    if ("content" in data && data.encoding === "base64") {
      // Properly decode base64 → UTF-8 (atob only handles Latin-1, mangling multi-byte chars)
      const binaryStr = atob(data.content);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      return new TextDecoder("utf-8").decode(bytes);
    }

    throw new Error("Unexpected response format");
  } catch (error: any) {
    throw error;
  }
}

// ─── Pull Requests ─────────────────────────────────────────────────────────

export async function fetchPullRequests(
  repoFullName: string,
  state: "open" | "closed" | "all" = "open"
): Promise<PullRequest[]> {
  const octokit = getOctokit();
  if (!octokit) throw new Error("Not authenticated");

  const { owner, repo } = parseOwnerRepo(repoFullName);

  const { data } = await octokit.pulls.list({
    owner,
    repo,
    state,
    sort: "updated",
    direction: "desc",
    per_page: 20,
  });

  return data.map((pr) => ({
    id: `pr-${pr.number}`,
    number: pr.number,
    title: pr.title,
    author: pr.user?.login || "unknown",
    status: pr.merged_at ? "merged" : pr.state === "closed" ? "closed" : "open",
    createdAt: pr.created_at,
    baseBranch: pr.base.ref,
    headBranch: pr.head.ref,
    description: pr.body || "",
    files: [], // loaded separately
    comments: [], // loaded separately
  }));
}

export async function fetchPRFiles(
  repoFullName: string,
  prNumber: number
): Promise<PRFile[]> {
  const octokit = getOctokit();
  if (!octokit) throw new Error("Not authenticated");

  const { owner, repo } = parseOwnerRepo(repoFullName);

  const { data: files } = await octokit.pulls.listFiles({
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100,
  });

  // Filter to markdown files only
  const mdFiles = files.filter(
    (f) => f.filename.endsWith(".md") || f.filename.endsWith(".mdx")
  );

  const prDetail = await octokit.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  const baseBranch = prDetail.data.base.ref;
  const headBranch = prDetail.data.head.ref;

  const result: PRFile[] = [];

  for (const file of mdFiles) {
    let baseContent = "";
    let headContent = "";

    if (file.status !== "added") {
      try {
        baseContent = await fetchFileContent(repoFullName, file.filename, baseBranch);
      } catch {
        baseContent = "";
      }
    }

    if (file.status !== "removed") {
      try {
        headContent = await fetchFileContent(repoFullName, file.filename, headBranch);
      } catch {
        headContent = "";
      }
    }

    result.push({
      path: file.filename,
      baseContent,
      headContent,
      status: file.status === "added"
        ? "added"
        : file.status === "removed"
        ? "deleted"
        : "modified",
    });
  }

  return result;
}

export async function fetchPRComments(
  repoFullName: string,
  prNumber: number
): Promise<PRComment[]> {
  const octokit = getOctokit();
  if (!octokit) throw new Error("Not authenticated");

  const { owner, repo } = parseOwnerRepo(repoFullName);

  // Get both review comments and issue comments
  const [reviewComments, issueComments] = await Promise.all([
    octokit.pulls.listReviewComments({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
    }),
    octokit.issues.listComments({
      owner,
      repo,
      issue_number: prNumber,
      per_page: 100,
    }),
  ]);

  const colors = ["#e76f51", "#2a9d8f", "#264653", "#e9c46a", "#f4a261"];

  const allComments: PRComment[] = [
    ...reviewComments.data.map((c, i) => ({
      id: `rc-${c.id}`,
      author: c.user?.login || "unknown",
      avatarColor: colors[i % colors.length],
      body: c.body,
      createdAt: c.created_at,
      blockIndex: c.line || c.original_line || 0,
      resolved: false,
    })),
    ...issueComments.data.map((c, i) => ({
      id: `ic-${c.id}`,
      author: c.user?.login || "unknown",
      avatarColor: colors[(i + 2) % colors.length],
      body: c.body || "",
      createdAt: c.created_at,
      resolved: false,
    })),
  ];

  return allComments;
}

export async function createPRComment(
  repoFullName: string,
  prNumber: number,
  body: string
): Promise<void> {
  const octokit = getOctokit();
  if (!octokit) throw new Error("Not authenticated");

  const { owner, repo } = parseOwnerRepo(repoFullName);

  await octokit.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body,
  });
}

/**
 * Create a proper inline review comment on a PR, tied to a specific file and line range.
 * Maps to GitHub's "pull request review comment" which appears inline on the diff.
 * Supports single-line and multi-line comments via start_line + line.
 */
export async function createInlineComment(
  repoFullName: string,
  prNumber: number,
  body: string,
  path: string,
  line: number,
  startLine?: number,
  side: "LEFT" | "RIGHT" = "RIGHT"
): Promise<void> {
  const octokit = getOctokit();
  if (!octokit) throw new Error("Not authenticated");

  const { owner, repo } = parseOwnerRepo(repoFullName);

  // Get the latest commit SHA on the PR head
  const { data: prData } = await octokit.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });
  const commitId = prData.head.sha;

  // Build params — only include start_line if it differs from line (multi-line comment)
  const params: Record<string, any> = {
    owner,
    repo,
    pull_number: prNumber,
    body,
    commit_id: commitId,
    path,
    line,
    side,
  };

  if (startLine && startLine !== line) {
    params.start_line = startLine;
    params.start_side = side;
  }

  await octokit.pulls.createReviewComment(params as any);
}

/**
 * Given markdown source content, map a selected text string to the line range it occupies
 * in the source markdown. Returns { startLine, endLine } (1-indexed).
 * Falls back to line 1 if the text can't be found.
 */
export function mapSelectionToLines(
  markdownContent: string,
  selectedText: string
): { startLine: number; endLine: number } {
  // Normalize whitespace for matching
  const normalizedSelected = selectedText.replace(/\s+/g, " ").trim();

  // Try exact match first
  const lines = markdownContent.split("\n");
  const fullText = markdownContent;
  const idx = fullText.indexOf(selectedText);

  if (idx !== -1) {
    // Count newlines before start and end of match
    const beforeStart = fullText.slice(0, idx);
    const beforeEnd = fullText.slice(0, idx + selectedText.length);
    const startLine = (beforeStart.match(/\n/g) || []).length + 1;
    const endLine = (beforeEnd.match(/\n/g) || []).length + 1;
    return { startLine, endLine };
  }

  // Fuzzy match: normalize both sides and try again
  const normalizedFull = fullText.replace(/\s+/g, " ");
  const fuzzyIdx = normalizedFull.indexOf(normalizedSelected);

  if (fuzzyIdx !== -1) {
    // Map the normalized position back to original line numbers
    // by counting characters consumed in the original text
    let origChars = 0;
    let normChars = 0;
    let startLine = 1;
    let endLine = 1;
    let foundStart = false;

    for (let i = 0; i < fullText.length && normChars <= fuzzyIdx + normalizedSelected.length; i++) {
      if (!foundStart && normChars >= fuzzyIdx) {
        startLine = (fullText.slice(0, i).match(/\n/g) || []).length + 1;
        foundStart = true;
      }
      if (normChars >= fuzzyIdx + normalizedSelected.length) {
        endLine = (fullText.slice(0, i).match(/\n/g) || []).length + 1;
        break;
      }
      if (/\s/.test(fullText[i])) {
        // consume all consecutive whitespace in original, it maps to one space in normalized
        while (i + 1 < fullText.length && /\s/.test(fullText[i + 1])) i++;
        normChars++;
      } else {
        normChars++;
      }
    }

    if (!foundStart) startLine = 1;
    if (endLine < startLine) endLine = startLine;
    return { startLine, endLine };
  }

  // Last resort: return line 1
  return { startLine: 1, endLine: 1 };
}

export async function createReviewPR(
  repoFullName: string,
  title: string,
  description: string,
  filePath: string
): Promise<{ number: number; url: string }> {
  const octokit = getOctokit();
  if (!octokit) throw new Error("Not authenticated");

  const { owner, repo } = parseOwnerRepo(repoFullName);

  // Get default branch
  const { data: repoData } = await octokit.repos.get({ owner, repo });
  const defaultBranch = repoData.default_branch;

  // Get the latest commit on default branch
  const { data: ref } = await octokit.git.getRef({
    owner,
    repo,
    ref: `heads/${defaultBranch}`,
  });

  // Create a new branch
  const branchName = `review/${Date.now()}`;
  await octokit.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branchName}`,
    sha: ref.object.sha,
  });

  // Get the file content and create a trivial update (add a trailing newline or comment)
  const content = await fetchFileContent(repoFullName, filePath, defaultBranch);
  const updatedContent = content.endsWith("\n") ? content + "\n" : content + "\n";

  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: filePath,
    message: `review: ${title}`,
    content: btoa(updatedContent),
    branch: branchName,
    sha: ((
      await octokit.repos.getContent({ owner, repo, path: filePath, ref: defaultBranch })
    ).data as any).sha as string,
  });

  // Create the PR
  const { data: pr } = await octokit.pulls.create({
    owner,
    repo,
    title: `[Review] ${title}`,
    body: description || `Review discussion for \`${filePath}\``,
    head: branchName,
    base: defaultBranch,
  });

  return { number: pr.number, url: pr.html_url };
}

// ─── Image URL Rewriting ──────────────────────────────────────────────────

/**
 * Rewrite relative image `src` attributes in rendered HTML to point at
 * raw.githubusercontent.com so images from the repo render correctly.
 */
export function rewriteImageUrls(
  html: string,
  repoFullName: string,
  ref: string,
  filePath: string
): string {
  const { owner, repo } = parseOwnerRepo(repoFullName);
  const fileDir = filePath.split("/").slice(0, -1).join("/");

  return html.replace(
    /(<img\s+[^>]*?src=")([^"]+)("[^>]*?>)/gi,
    (_match, before, src, after) => {
      if (/^(https?:\/\/|data:|#)/.test(src)) return _match;

      let resolvedPath: string;
      if (src.startsWith("./") || src.startsWith("../")) {
        // Resolve relative to the markdown file's directory
        const parts = [...fileDir.split("/"), ...src.split("/")];
        const resolved: string[] = [];
        for (const p of parts) {
          if (p === ".." && resolved.length) resolved.pop();
          else if (p !== "." && p !== "") resolved.push(p);
        }
        resolvedPath = resolved.join("/");
      } else {
        // Treat as repo-root-relative
        resolvedPath = src;
      }

      return `${before}https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${resolvedPath}${after}`;
    }
  );
}

// ─── User repos ────────────────────────────────────────────────────────────

export async function fetchUserRepos(): Promise<
  { fullName: string; description: string; isPrivate: boolean }[]
> {
  const octokit = getOctokit();
  if (!octokit) throw new Error("Not authenticated");

  // Paginate to get all repos (up to 200)
  const allRepos: { fullName: string; description: string; isPrivate: boolean }[] = [];
  let page = 1;
  const maxPages = 4; // 4 pages × 100 = up to 400 repos

  while (page <= maxPages) {
    const { data } = await octokit.repos.listForAuthenticatedUser({
      sort: "full_name",
      direction: "asc",
      per_page: 100,
      page,
      type: "all",
    });

    if (data.length === 0) break;

    allRepos.push(
      ...data.map((r) => ({
        fullName: r.full_name,
        description: r.description || "",
        isPrivate: r.private,
      }))
    );

    if (data.length < 100) break; // Last page
    page++;
  }

  // Sort alphabetically by full name (case-insensitive)
  return allRepos.sort((a, b) =>
    a.fullName.toLowerCase().localeCompare(b.fullName.toLowerCase())
  );
}

export async function fetchOrgRepos(
  org: string
): Promise<{ fullName: string; description: string; isPrivate: boolean }[]> {
  const octokit = getOctokit();
  if (!octokit) throw new Error("Not authenticated");

  const allRepos: { fullName: string; description: string; isPrivate: boolean }[] = [];
  let page = 1;

  while (page <= 4) {
    const { data } = await octokit.repos.listForOrg({
      org,
      sort: "full_name",
      direction: "asc",
      per_page: 100,
      page,
      type: "all",
    });

    if (data.length === 0) break;

    allRepos.push(
      ...data.map((r) => ({
        fullName: r.full_name,
        description: r.description || "",
        isPrivate: r.private,
      }))
    );

    if (data.length < 100) break;
    page++;
  }

  return allRepos.sort((a, b) =>
    a.fullName.toLowerCase().localeCompare(b.fullName.toLowerCase())
  );
}
