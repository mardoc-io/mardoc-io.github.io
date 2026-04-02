/**
 * Lightweight hash-based router for GitHub Pages (no server-side routing).
 *
 * URL scheme (mirrors GitHub):
 *   /#/{owner}/{repo}/blob/{branch}/{path}       → file view
 *   /#/{owner}/{repo}/pull/{number}               → PR diff view
 *   /#/{owner}/{repo}/pull/{number}/files/{idx}   → specific file in PR
 *   /#/{owner}/{repo}                             → repo root
 */

export interface HashRoute {
  type: "file" | "pr" | "repo" | "none";
  owner?: string;
  repo?: string;
  repoFullName?: string;
  branch?: string;
  filePath?: string;
  prNumber?: number;
  prFileIdx?: number;
}

export function parseHash(hash: string): HashRoute {
  // Strip leading "#/" or "#"
  const path = hash.replace(/^#\/?/, "");
  if (!path) return { type: "none" };

  const parts = path.split("/");
  if (parts.length < 2) return { type: "none" };

  const owner = parts[0];
  const repo = parts[1];
  const repoFullName = `${owner}/${repo}`;

  // /{owner}/{repo}/blob/{branch}/{path...}
  if (parts[2] === "blob" && parts.length >= 5) {
    const branch = parts[3];
    const filePath = parts.slice(4).join("/");
    return { type: "file", owner, repo, repoFullName, branch, filePath };
  }

  // /{owner}/{repo}/pull/{number}/files/{idx}
  if (parts[2] === "pull" && parts[3] && parts[4] === "files" && parts[5]) {
    const prNumber = parseInt(parts[3], 10);
    const prFileIdx = parseInt(parts[5], 10);
    if (!isNaN(prNumber) && !isNaN(prFileIdx)) {
      return { type: "pr", owner, repo, repoFullName, prNumber, prFileIdx };
    }
  }

  // /{owner}/{repo}/pull/{number}
  if (parts[2] === "pull" && parts[3]) {
    const prNumber = parseInt(parts[3], 10);
    if (!isNaN(prNumber)) {
      return { type: "pr", owner, repo, repoFullName, prNumber };
    }
  }

  // /{owner}/{repo}
  return { type: "repo", owner, repo, repoFullName };
}

export function buildFileHash(repoFullName: string, branch: string, filePath: string): string {
  return `#/${repoFullName}/blob/${branch}/${filePath}`;
}

export function buildPRHash(repoFullName: string, prNumber: number, fileIdx?: number): string {
  const base = `#/${repoFullName}/pull/${prNumber}`;
  return fileIdx !== undefined && fileIdx > 0 ? `${base}/files/${fileIdx}` : base;
}

export function buildRepoHash(repoFullName: string): string {
  return `#/${repoFullName}`;
}
