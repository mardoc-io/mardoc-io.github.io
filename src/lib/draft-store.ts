/**
 * Local draft store for unsaved editor content.
 *
 * MarDoc is backend-free, so a page refresh mid-edit would normally lose work.
 * We persist dirty editor content to localStorage keyed by {repo, branch, path}
 * and offer to restore it when the same file is reopened.
 *
 * This is intentionally dumb: it stores markdown strings and a timestamp,
 * nothing else. There's no schema version field yet — if the shape changes,
 * bump STORAGE_PREFIX.
 */

const STORAGE_PREFIX = "mardoc:draft:v1:";

export interface Draft {
  markdown: string;
  savedAt: number; // epoch millis
}

function keyFor(repoFullName: string | undefined, branch: string | undefined, filePath: string): string {
  // Local-only files (unauthenticated) get a single synthetic scope so drafts
  // still survive refresh in demo / local-file mode.
  const repo = repoFullName || "__local__";
  const br = branch || "__nobranch__";
  return `${STORAGE_PREFIX}${repo}:${br}:${filePath}`;
}

function safeStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function saveDraft(
  repoFullName: string | undefined,
  branch: string | undefined,
  filePath: string,
  markdown: string
): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    const payload: Draft = { markdown, savedAt: Date.now() };
    storage.setItem(keyFor(repoFullName, branch, filePath), JSON.stringify(payload));
  } catch {
    // Quota exceeded or private mode — silently skip. Losing draft persistence
    // is strictly better than blowing up the editor.
  }
}

export function loadDraft(
  repoFullName: string | undefined,
  branch: string | undefined,
  filePath: string
): Draft | null {
  const storage = safeStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(keyFor(repoFullName, branch, filePath));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Draft;
    if (typeof parsed?.markdown !== "string" || typeof parsed?.savedAt !== "number") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearDraft(
  repoFullName: string | undefined,
  branch: string | undefined,
  filePath: string
): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.removeItem(keyFor(repoFullName, branch, filePath));
  } catch {
    // ignore
  }
}

/**
 * Format a saved-at timestamp as a short relative string ("2m ago", "yesterday").
 * Used in the restore prompt.
 */
export function formatRelativeSavedAt(savedAt: number): string {
  const delta = Date.now() - savedAt;
  const sec = Math.floor(delta / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(savedAt).toLocaleDateString();
}
