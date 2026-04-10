import { PRComment } from "@/types";

/**
 * Merge a fresh comment list fetched from GitHub with the current local
 * PRDetail state, preserving any locally-queued pending comments.
 *
 * Rules:
 *   - Pending comments (c.pending === true) must survive the merge. They
 *     represent unsaved review work that hasn't been submitted yet.
 *   - Non-pending comments in the current state are considered stale — the
 *     fresh list is authoritative for anything that's been persisted to
 *     GitHub.
 *   - Dedupe by id: if an id appears in both fresh and prev, fresh wins.
 *     This prevents an optimistic local copy and its posted GitHub
 *     counterpart from rendering as two cards in the sidebar.
 *
 * This is extracted from PRDetail.tsx so the behavior can be tested without
 * mounting the full component.
 */
export function mergeFreshComments(
  prev: PRComment[],
  fresh: PRComment[]
): PRComment[] {
  const byId = new Map<string, PRComment>();
  for (const c of fresh) byId.set(c.id, c);
  for (const c of prev) {
    if (c.pending && !byId.has(c.id)) {
      byId.set(c.id, c);
    }
  }
  return Array.from(byId.values());
}
