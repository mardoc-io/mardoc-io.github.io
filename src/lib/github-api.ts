"use client";

import { Octokit } from "@octokit/rest";
import { RepoFile, PullRequest, PRFile, PRComment } from "@/types";
import { isDocumentFile } from "@/lib/file-types";
import { utf8ToBase64, base64ToUtf8 } from "@/lib/base64-utf8";
import { isLineResolutionError, runInlineFallback } from "@/lib/review-fallback";
import {
  updateFromHeaders,
  isRateLimitError,
  markRateLimited,
  extractResetFromError,
  isTransientError,
} from "@/lib/rate-limit";
import { computeBackoff } from "@/lib/fetch-retry";
import { requestEmbedImage } from "@/lib/embed-image-bridge";
import { resolvePath, classifyLink } from "@/lib/link-handler";

let octokitInstance: Octokit | null = null;

export function initOctokit(token: string) {
  octokitInstance = new Octokit({ auth: token });

  // Track rate-limit headers on every response so the circuit
  // breaker can proactively pause before we get a hard 403.
  octokitInstance.hook.after("request", (response) => {
    const headers = (response as any)?.headers;
    if (headers) updateFromHeaders(headers);
  });

  // Wrap every request so that:
  //   1. rate-limit errors mark the circuit breaker
  //   2. transient errors (5xx, network) retry with backoff
  octokitInstance.hook.wrap("request", async (request, options) => {
    const MAX_ATTEMPTS = 3;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await request(options);
      } catch (err) {
        lastErr = err;
        if (isRateLimitError(err)) {
          markRateLimited(extractResetFromError(err));
          throw err;
        }
        if (attempt === MAX_ATTEMPTS || !isTransientError(err)) throw err;
        const delay = computeBackoff(attempt, 500, 4000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw lastErr;
  });

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

// ─── Repository Metadata ──────────────────────────────────────────────────

export async function fetchDefaultBranch(repoFullName: string): Promise<string> {
  const octokit = getOctokit();
  if (!octokit) throw new Error("Not authenticated");

  const { owner, repo } = parseOwnerRepo(repoFullName);
  const { data } = await octokit.repos.get({ owner, repo });
  return data.default_branch;
}

export async function fetchBranches(
  repoFullName: string
): Promise<{ name: string; isDefault: boolean }[]> {
  const octokit = getOctokit();
  if (!octokit) throw new Error("Not authenticated");

  const { owner, repo } = parseOwnerRepo(repoFullName);

  // Fetch default branch and branch list in parallel
  const [repoData, branchPages] = await Promise.all([
    octokit.repos.get({ owner, repo }),
    octokit.paginate(octokit.repos.listBranches, {
      owner,
      repo,
      per_page: 100,
    }),
  ]);

  const defaultBranch = repoData.data.default_branch;

  return branchPages
    .map((b) => ({
      name: b.name,
      isDefault: b.name === defaultBranch,
    }))
    .sort((a, b) => {
      // Default branch first, then alphabetical
      if (a.isDefault) return -1;
      if (b.isDefault) return 1;
      return a.name.localeCompare(b.name);
    });
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

      // Only show document files and their parent directories
      const isMarkdown = isDocumentFile(name);
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
      return base64ToUtf8(data.content);
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

/**
 * Fetch markdown file counts for a batch of PRs via a single GraphQL query.
 * Returns a map of PR number → count of .md/.mdx files changed.
 *
 * Owner and repo are passed as GraphQL variables — NOT string-interpolated
 * into the query — so a malicious repo name can't inject query fragments.
 * The per-PR aliases and numbers are still interpolated because GraphQL
 * field names can't be parameterized, but PR numbers are from GitHub's
 * own API state and are validated as integers (the TypeScript type guards
 * this at the callsite).
 */
export async function fetchPRMarkdownCounts(
  repoFullName: string,
  prNumbers: number[]
): Promise<Map<number, number>> {
  const octokit = getOctokit();
  if (!octokit || prNumbers.length === 0) return new Map();

  const { owner, repo } = parseOwnerRepo(repoFullName);

  // Validate that every PR number is a safe integer — the only piece
  // that still gets interpolated into the query. Anything else is a bug.
  const safeNumbers = prNumbers.filter(
    (n) => Number.isInteger(n) && n > 0 && n < Number.MAX_SAFE_INTEGER
  );
  if (safeNumbers.length === 0) return new Map();

  const fragments = safeNumbers.map(
    (num, i) => `pr${i}: pullRequest(number: ${num}) { number files(first: 100) { nodes { path } } }`
  ).join("\n    ");

  const query = `query($owner: String!, $repo: String!) {
    repository(owner: $owner, name: $repo) {
      ${fragments}
    }
  }`;

  try {
    const result: any = await (octokit as any).graphql(query, { owner, repo });
    const counts = new Map<number, number>();

    for (let i = 0; i < safeNumbers.length; i++) {
      const prData = result.repository[`pr${i}`];
      if (prData?.files?.nodes) {
        const mdCount = prData.files.nodes.filter(
          (f: any) => isDocumentFile(f.path)
        ).length;
        counts.set(prData.number, mdCount);
      }
    }

    return counts;
  } catch (err) {
    console.error("Failed to fetch PR markdown counts:", err);
    return new Map();
  }
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

  // Filter to document files only (markdown + HTML)
  const mdFiles = files.filter(
    (f) => isDocumentFile(f.filename)
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

  // Build a color map per author for consistency
  const authorColors = new Map<string, string>();
  const getColor = (author: string) => {
    if (!authorColors.has(author)) {
      authorColors.set(author, colors[authorColors.size % colors.length]);
    }
    return authorColors.get(author)!;
  };

  // Separate top-level review comments from replies using in_reply_to_id
  const topLevel: typeof reviewComments.data = [];
  const replyMap = new Map<number, typeof reviewComments.data>();

  for (const c of reviewComments.data) {
    const parentId = (c as any).in_reply_to_id;
    if (parentId) {
      if (!replyMap.has(parentId)) replyMap.set(parentId, []);
      replyMap.get(parentId)!.push(c);
    } else {
      topLevel.push(c);
    }
  }

  // Fetch thread resolution status via GraphQL
  const threadResolution = await fetchThreadResolution(owner, repo, prNumber);

  const allComments: PRComment[] = [
    ...topLevel.map((c) => {
      const thread = threadResolution.get(c.id);
      return {
        id: `rc-${c.id}`,
        githubId: c.id,
        threadId: thread?.threadId,
        author: c.user?.login || "unknown",
        avatarColor: getColor(c.user?.login || "unknown"),
        body: c.body,
        createdAt: c.created_at,
        blockIndex: c.line || c.original_line || 0,
        resolved: thread?.isResolved ?? false,
        replies: (replyMap.get(c.id) || []).map((r) => ({
          id: `rc-${r.id}`,
          author: r.user?.login || "unknown",
          avatarColor: getColor(r.user?.login || "unknown"),
          body: r.body,
          createdAt: r.created_at,
        })),
      };
    }),
    ...issueComments.data.map((c) => ({
      id: `ic-${c.id}`,
      githubId: c.id,
      author: c.user?.login || "unknown",
      avatarColor: getColor(c.user?.login || "unknown"),
      body: c.body || "",
      createdAt: c.created_at,
      resolved: false,
      replies: [],
    })),
  ];

  return allComments;
}

/**
 * Fetch review thread resolution status via GraphQL.
 * Returns a map of comment database ID → { threadId, isResolved }.
 */
async function fetchThreadResolution(
  owner: string,
  repo: string,
  prNumber: number
): Promise<Map<number, { threadId: string; isResolved: boolean }>> {
  const octokit = getOctokit();
  if (!octokit) return new Map();

  try {
    const result: any = await (octokit as any).graphql(`
      query($owner: String!, $repo: String!, $prNumber: Int!) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $prNumber) {
            reviewThreads(first: 100) {
              nodes {
                id
                isResolved
                comments(first: 1) {
                  nodes {
                    databaseId
                  }
                }
              }
            }
          }
        }
      }
    `, { owner, repo, prNumber });

    const map = new Map<number, { threadId: string; isResolved: boolean }>();
    const threads = result.repository?.pullRequest?.reviewThreads?.nodes || [];
    for (const thread of threads) {
      const firstCommentId = thread.comments?.nodes?.[0]?.databaseId;
      if (firstCommentId) {
        map.set(firstCommentId, {
          threadId: thread.id,
          isResolved: thread.isResolved,
        });
      }
    }
    return map;
  } catch {
    // GraphQL may fail if token doesn't have sufficient scope — fall back gracefully
    return new Map();
  }
}

/**
 * Resolve or unresolve a review thread via GraphQL.
 */
export async function resolveReviewThread(
  threadId: string,
  resolve: boolean
): Promise<void> {
  const octokit = getOctokit();
  if (!octokit) throw new Error("Not authenticated");

  const mutation = resolve
    ? `mutation($threadId: ID!) { resolveReviewThread(input: { threadId: $threadId }) { thread { id isResolved } } }`
    : `mutation($threadId: ID!) { unresolveReviewThread(input: { threadId: $threadId }) { thread { id isResolved } } }`;

  await (octokit as any).graphql(mutation, { threadId });
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
 * A pending inline comment queued for submission as part of a batched review.
 * Maps 1:1 to the shape GitHub's pulls.createReview accepts in its `comments[]`.
 */
export interface PendingInlineComment {
  path: string;
  body: string;
  line: number;
  startLine?: number;
  side?: "LEFT" | "RIGHT";
}

export type ReviewEvent = "APPROVE" | "REQUEST_CHANGES" | "COMMENT";

/**
 * Submit a PR review. If `comments` is provided, they are batched into the
 * review as inline comments (a single notification to the author instead of N).
 * Pass `event` = APPROVE / REQUEST_CHANGES / COMMENT.
 *
 * Note: REQUEST_CHANGES requires a non-empty body per GitHub API rules.
 */
export async function submitReview(
  repoFullName: string,
  prNumber: number,
  event: ReviewEvent,
  body?: string,
  comments?: PendingInlineComment[]
): Promise<void> {
  const octokit = getOctokit();
  if (!octokit) throw new Error("Not authenticated");

  const { owner, repo } = parseOwnerRepo(repoFullName);

  const { data: prData } = await octokit.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });
  const commitId = prData.head.sha;

  const reviewComments = (comments || []).map((c) => {
    const entry: Record<string, any> = {
      path: c.path,
      body: c.body,
      line: c.line,
      side: c.side || "RIGHT",
    };
    if (c.startLine && c.startLine !== c.line) {
      entry.start_line = c.startLine;
      entry.start_side = c.side || "RIGHT";
    }
    return entry;
  });

  await octokit.pulls.createReview({
    owner,
    repo,
    pull_number: prNumber,
    commit_id: commitId,
    event,
    body: body || undefined,
    comments: reviewComments.length > 0 ? (reviewComments as any) : undefined,
  });
}

/**
 * Submit a review with graceful fallback for out-of-hunk comments.
 *
 * GitHub's pulls.createReview requires every inline comment's `line` to sit
 * inside a diff hunk on that file. A single unresolvable line rejects the
 * whole review ("Unprocessable Entity: Line could not be resolved").
 *
 * We try the batched path first. On a 422 that looks like a line-resolution
 * error, fall back to posting each comment individually:
 *   1. createInlineComment for each — succeeds for in-hunk lines.
 *   2. On per-comment failure, post it as a general PR issue comment with the
 *      file + line context baked into the body so the feedback isn't lost.
 *   3. Finally submit the review event (APPROVE / REQUEST_CHANGES) with no
 *      comments. For COMMENT the individual comments are the review.
 *
 * Returns the count of comments that had to fall back to general PR comments,
 * so the caller can surface a warning.
 */
export async function submitReviewBatched(
  repoFullName: string,
  prNumber: number,
  event: ReviewEvent,
  body: string | undefined,
  comments: PendingInlineComment[]
): Promise<{ unresolvedCount: number }> {
  try {
    await submitReview(repoFullName, prNumber, event, body, comments);
    return { unresolvedCount: 0 };
  } catch (err) {
    if (!isLineResolutionError(err)) {
      throw err;
    }
  }

  const { unresolvedCount } = await runInlineFallback(comments, {
    postInlineComment: (c) =>
      createInlineComment(
        repoFullName,
        prNumber,
        c.body,
        c.path,
        c.line,
        c.startLine,
        c.side || "RIGHT"
      ),
    postIssueComment: (text) => createPRComment(repoFullName, prNumber, text),
  });

  if (event !== "COMMENT") {
    // Record the approval / change-request state even though the comments
    // were posted outside the review envelope.
    await submitReview(repoFullName, prNumber, event, body, []);
  }

  return { unresolvedCount };
}

/**
 * Apply a suggestion by committing the replacement text to the PR branch.
 * Fetches the file at the head branch, replaces the specified lines, and commits.
 */
export async function applySuggestion(
  repoFullName: string,
  headBranch: string,
  filePath: string,
  startLine: number,
  endLine: number,
  replacementText: string
): Promise<void> {
  const octokit = getOctokit();
  if (!octokit) throw new Error("Not authenticated");

  const { owner, repo } = parseOwnerRepo(repoFullName);

  // Get current file content + SHA from the PR head branch
  const { data } = await octokit.repos.getContent({
    owner,
    repo,
    path: filePath,
    ref: headBranch,
  });

  if (!("content" in data) || !("sha" in data)) {
    throw new Error("Unexpected response format");
  }

  const currentContent = base64ToUtf8(data.content);

  // Replace the specified lines with the suggestion text
  const lines = currentContent.split("\n");
  const before = lines.slice(0, startLine - 1);
  const after = lines.slice(endLine);
  const newContent = [...before, replacementText, ...after].join("\n");

  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: filePath,
    message: "Apply suggestion from review",
    content: utf8ToBase64(newContent),
    sha: data.sha,
    branch: headBranch,
  });
}

/**
 * Reply to an existing review comment on a PR.
 * Uses the pull request review comment reply endpoint.
 */
export async function replyToReviewComment(
  repoFullName: string,
  prNumber: number,
  commentId: number,
  body: string
): Promise<{ id: number; author: string; createdAt: string }> {
  const octokit = getOctokit();
  if (!octokit) throw new Error("Not authenticated");

  const { owner, repo } = parseOwnerRepo(repoFullName);

  const { data } = await octokit.pulls.createReplyForReviewComment({
    owner,
    repo,
    pull_number: prNumber,
    comment_id: commentId,
    body,
  });

  return {
    id: data.id,
    author: data.user?.login || "unknown",
    createdAt: data.created_at,
  };
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

  // Get the file content and create a trivial change (append a space)
  const content = await fetchFileContent(repoFullName, filePath, defaultBranch);
  const updatedContent = content + " ";

  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: filePath,
    message: `review: ${title}`,
    content: utf8ToBase64(updatedContent),
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

/**
 * Create a new file in a repo by committing it on a new branch and opening a PR.
 */
export async function createFileAsPR(
  repoFullName: string,
  filePath: string,
  content: string,
  title: string,
  description?: string
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
  const slug = filePath.replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-").slice(0, 40);
  const branchName = `new-file/${slug}-${Date.now()}`;
  await octokit.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branchName}`,
    sha: ref.object.sha,
  });

  // Commit the new file
  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: filePath,
    message: `docs: add ${filePath}`,
    content: utf8ToBase64(content),
    branch: branchName,
  });

  // Create the PR
  const { data: pr } = await octokit.pulls.create({
    owner,
    repo,
    title,
    body: description || `Add new file \`${filePath}\``,
    head: branchName,
    base: defaultBranch,
  });

  return { number: pr.number, url: pr.html_url };
}

/**
 * Commit a new file directly to an existing PR branch.
 */
export async function commitFileToPRBranch(
  repoFullName: string,
  branch: string,
  filePath: string,
  content: string,
  message: string
): Promise<void> {
  const octokit = getOctokit();
  if (!octokit) throw new Error("Not authenticated");

  const { owner, repo } = parseOwnerRepo(repoFullName);

  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: filePath,
    message,
    content: utf8ToBase64(content),
    branch,
  });
}

/**
 * Commit a pre-encoded base64 file (typically a binary asset like an
 * image) to a branch. Used by the paste / drag-drop image upload flow
 * in the editor — the caller is responsible for reading the file's
 * ArrayBuffer and running it through arrayBufferToBase64 from
 * @/lib/image-upload before calling this.
 */
export async function commitBase64FileToBranch(
  repoFullName: string,
  branch: string,
  filePath: string,
  base64Content: string,
  message: string
): Promise<void> {
  const octokit = getOctokit();
  if (!octokit) throw new Error("Not authenticated");

  const { owner, repo } = parseOwnerRepo(repoFullName);

  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: filePath,
    message,
    content: base64Content,
    branch,
  });
}

// ─── Image URL Rewriting ──────────────────────────────────────────────────

/**
 * Rewrite relative image `src` attributes in rendered HTML to point at
 * raw.githubusercontent.com so images from the repo render correctly.
 */
// Lookup map for image metadata — survives TipTap stripping data attributes
const imageMetaMap = new Map<string, { owner: string; repo: string; ref: string; path: string }>();

// Cache of raw.githubusercontent.com URL → data: URI for images already
// fetched via loadAuthenticatedImages. When rewriteImageUrls runs on a
// re-render (e.g. comment state change regenerates innerHTML), it emits
// the cached data URI so the HTML string is byte-identical to the prior
// render, React's dangerouslySetInnerHTML diff skips DOM replacement, and
// the browser doesn't re-decode the image. Without this cache, every
// comment state change flashed the image: raw URL → brief blank → refetch.
const imageDataUriCache = new Map<string, string>();

/** Test helper: reset caches so unit tests don't leak state between cases. */
export function __resetImageCachesForTests(): void {
  imageMetaMap.clear();
  imageDataUriCache.clear();
}

/** Test helper: preload the data URI cache to simulate a warm cache. */
export function __setImageDataUriForTests(rawUrl: string, dataUri: string): void {
  imageDataUriCache.set(rawUrl, dataUri);
}

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
      if (src.startsWith("/")) {
        // Absolute repo-root path
        resolvedPath = src.slice(1);
      } else {
        // All other paths (./foo, ../foo, foo) resolve relative to the file's directory
        const parts = [...fileDir.split("/").filter(Boolean), ...src.split("/")];
        const resolved: string[] = [];
        for (const p of parts) {
          if (p === ".." && resolved.length) resolved.pop();
          else if (p !== "." && p !== "") resolved.push(p);
        }
        resolvedPath = resolved.join("/");
      }

      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${resolvedPath}`;
      imageMetaMap.set(rawUrl, { owner, repo, ref, path: resolvedPath });
      // Use cached data URI on re-renders so the emitted HTML is stable;
      // data-gh-* attributes stay attached so the loader can still find
      // the image on a cache miss.
      const cachedUri = imageDataUriCache.get(rawUrl);
      const emittedSrc = cachedUri ?? rawUrl;
      return `${before}${emittedSrc}" data-gh-owner="${owner}" data-gh-repo="${repo}" data-gh-ref="${ref}" data-gh-path="${resolvedPath}${after}`;
    }
  );
}

/**
 * Fetch all repo images in a container via Octokit (works for private repos).
 * Uses data-gh-* attributes when available (DiffViewer), falls back to
 * imageMetaMap lookup by src URL (Editor/TipTap which strips data attributes).
 */
export async function loadAuthenticatedImages(
  container: HTMLElement
): Promise<void> {
  const octokit = getOctokit();
  if (!octokit) return;

  // Match images with data attributes OR raw.githubusercontent.com URLs.
  // Skip data: URIs — those are already loaded (either from a prior run
  // or from the cache in rewriteImageUrls). This is the per-DOM guard
  // that stops redundant octokit fetches on re-runs; the HTML-level
  // cache in rewriteImageUrls stops DOM replacement in the first place.
  const imgs = Array.from(
    container.querySelectorAll<HTMLImageElement>(
      'img[data-gh-path], img[src*="raw.githubusercontent.com"]'
    )
  ).filter((img) => !img.src.startsWith("data:"));
  if (imgs.length === 0) return;

  const mimeTypes: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    gif: "image/gif", svg: "image/svg+xml", webp: "image/webp",
    ico: "image/x-icon", bmp: "image/bmp",
  };

  const results = await Promise.allSettled(
    imgs.map(async (img) => {
      // Try data attributes first (preserved in dangerouslySetInnerHTML)
      let owner = img.dataset.ghOwner;
      let repo = img.dataset.ghRepo;
      let ref = img.dataset.ghRef;
      let path = img.dataset.ghPath;

      // Fall back to metadata map (for TipTap which strips data attributes)
      if (!path) {
        const meta = imageMetaMap.get(img.src);
        if (!meta) return;
        ({ owner, repo, ref, path } = meta);
      }

      if (!owner || !repo || !ref || !path) return;

      // Remember the raw URL for cache key — the img.src will be
      // mutated below, so capture it before the swap.
      const rawUrl = img.src;

      const { data } = await octokit.repos.getContent({
        owner, repo, path, ref,
      });

      if ("content" in data && data.encoding === "base64") {
        const ext = path.split(".").pop()?.toLowerCase() || "png";
        const mime = mimeTypes[ext] || "application/octet-stream";
        const dataUri = `data:${mime};base64,${data.content.replace(/\n/g, "")}`;
        // Preserve original src for round-trip back to markdown
        if (!img.getAttribute("data-original-src")) {
          img.setAttribute("data-original-src", img.src);
        }
        img.src = dataUri;
        // Only cache when the key is a raw.githubusercontent URL (it is
        // when we reached this branch via the data-gh-path selector).
        // Caching on a non-raw key would leak arbitrary srcs as cache
        // keys without a matching rewriter check.
        if (rawUrl.includes("raw.githubusercontent.com")) {
          imageDataUriCache.set(rawUrl, dataUri);
        }
      }
      return img;
    })
  );

  // Mark failed images with a broken-image class so CSS can show a
  // placeholder instead of a silent broken thumbnail. Uses a stable
  // class name that globals.css styles with an icon + hover tooltip.
  results.forEach((result, i) => {
    if (result.status === "rejected") {
      const img = imgs[i];
      img.classList.add("mardoc-image-failed");
      img.setAttribute("alt", img.getAttribute("alt") || "Failed to load image");
      img.setAttribute(
        "title",
        "This image could not be loaded. Your token may lack access to the source repository."
      );
    }
  });
}

/**
 * Load images referenced by relative paths when running inside the
 * VS Code webview embed. The browser has no filesystem access, so
 * relative paths like `./images/arch.png` normally render as broken
 * images. This function finds them, resolves against the current
 * file's directory, and asks the VS Code extension for the bytes
 * via the embed-image-bridge postMessage channel.
 *
 * Safe to call outside embed mode — it detects `window.parent ===
 * window` via the bridge and silently no-ops.
 *
 * Absolute URLs (https://, //cdn.../) and authenticated GitHub URLs
 * are skipped — those go through loadAuthenticatedImages or render
 * natively.
 */
export async function loadEmbedLocalImages(
  container: HTMLElement,
  currentFilePath: string
): Promise<void> {
  if (typeof window === "undefined" || window.parent === window) return;

  const IMAGE_MIME: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    gif: "image/gif", svg: "image/svg+xml", webp: "image/webp",
    bmp: "image/bmp",
  };

  // Candidates: any img whose current src doesn't point at an external
  // URL and wasn't already loaded. Skip already-loaded data: URIs.
  const allImgs = Array.from(
    container.querySelectorAll<HTMLImageElement>("img")
  );
  const candidates = allImgs.filter((img) => {
    const src = img.getAttribute("src") || "";
    if (!src) return false;
    if (src.startsWith("data:")) return false;
    if (src.startsWith("http://") || src.startsWith("https://")) return false;
    if (src.startsWith("//")) return false;
    // Skip anything that's already going through loadAuthenticatedImages
    if (img.dataset.ghPath) return false;
    return classifyLink(src) === "relative";
  });

  if (candidates.length === 0) return;

  const results = await Promise.allSettled(
    candidates.map(async (img) => {
      const src = img.getAttribute("src") || "";
      const resolved = resolvePath(currentFilePath, src);
      const { data, mimeType } = await requestEmbedImage(resolved);
      // Prefer the mimeType from the extension; fall back to the
      // file extension in case the extension doesn't set one.
      const ext = resolved.split(".").pop()?.toLowerCase() || "";
      const mime = mimeType || IMAGE_MIME[ext] || "application/octet-stream";
      if (!img.getAttribute("data-original-src")) {
        img.setAttribute("data-original-src", src);
      }
      img.src = `data:${mime};base64,${data.replace(/\n/g, "")}`;
    })
  );

  // Mark failures with the same placeholder class as
  // loadAuthenticatedImages so failed images show a consistent
  // broken-image state instead of an actual broken thumbnail.
  results.forEach((result, i) => {
    if (result.status === "rejected") {
      const img = candidates[i];
      img.classList.add("mardoc-image-failed");
      const origSrc = img.getAttribute("src") || "image";
      img.setAttribute(
        "alt",
        img.getAttribute("alt") || `Could not load ${origSrc}`
      );
      img.setAttribute(
        "title",
        `Local image not found: ${origSrc}. VS Code may not have permission to read the file.`
      );
    }
  });
}

// ─── User repos ────────────────────────────────────────────────────────────

export async function fetchUserRepos(): Promise<
  { fullName: string; description: string; isPrivate: boolean }[]
> {
  const octokit = getOctokit();
  if (!octokit) throw new Error("Not authenticated");

  const data = await octokit.paginate(octokit.repos.listForAuthenticatedUser, {
    sort: "full_name",
    direction: "asc",
    per_page: 100,
    type: "all",
  });

  return data
    .map((r) => ({
      fullName: r.full_name,
      description: r.description || "",
      isPrivate: r.private,
    }))
    .sort((a, b) =>
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
