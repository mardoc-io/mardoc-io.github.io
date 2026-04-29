export interface RepoFile {
  id: string;
  name: string;
  path: string;
  type: "file" | "folder";
  children?: RepoFile[];
  content?: string;
}

export interface PRCommentReply {
  id: string;
  author: string;
  avatarColor: string;
  body: string;
  createdAt: string;
}

export interface PRComment {
  id: string;
  githubId?: number; // numeric GitHub comment ID for API calls (replies, resolve)
  threadId?: string; // GraphQL node ID for the review thread (resolve/unresolve)
  path?: string; // file path this comment is attached to (from GitHub review comment)
  author: string;
  avatarColor: string;
  body: string;
  createdAt: string;
  blockIndex?: number; // which rendered block this comment is on
  startLine?: number; // start of the commented line range (1-indexed, from GitHub API)
  endLine?: number; // end of the commented line range (1-indexed, from GitHub API)
  selectedText?: string; // the text that was selected when the comment was created
  resolved: boolean;
  replies: PRCommentReply[];
  // Queued locally as part of a pending review — not yet posted to GitHub.
  // Cleared when the review is submitted or the comment is discarded.
  pending?: boolean;
  // Line range captured at queue time so the batched review knows where to
  // post. Only used when pending is true.
  pendingPath?: string;
  pendingStartLine?: number;
  pendingEndLine?: number;
}

export interface PullRequest {
  id: string;
  number: number;
  title: string;
  author: string;
  status: "open" | "merged" | "closed";
  createdAt: string;
  baseBranch: string;
  headBranch: string;
  files: PRFile[];
  comments: PRComment[];
  description: string;
  mdFileCount?: number;
}

export interface PRFile {
  path: string;
  baseContent: string;  // content on base branch
  headContent: string;  // content on PR branch
  status: "added" | "modified" | "deleted";
}

export interface PendingSuggestion {
  blockIndex: number;
  originalMarkdown: string;
  editedMarkdown: string;
  startLine: number;
  endLine: number;
}

export type ViewMode = "editor" | "pr-list" | "pr-diff" | "pr-review" | "html-viewer";
