/**
 * Staleness guard for concurrent async work.
 *
 * When a user navigates quickly — switching files, PRs, or repos —
 * in-flight async calls can finish out of order. Without a guard,
 * the second-to-last response overwrites the latest data, leaving
 * the UI showing stale content.
 *
 * This helper creates a generation counter. Each call to `begin()`
 * increments the counter and returns `isStillCurrent()`. After
 * awaiting async work, the caller checks `isStillCurrent()` — if
 * false, a newer call has started and the result should be dropped.
 *
 * Usage:
 *   const guard = createStalenessGuard();
 *   async function loadFile(path: string) {
 *     const isCurrent = guard.begin();
 *     const content = await fetchFileContent(path);
 *     if (!isCurrent()) return;      // stale, newer load started
 *     setFileContent(content);
 *   }
 *
 * This is lighter than AbortController: requests complete but
 * their results are discarded. For MarDoc's use case (dropping
 * stale UI state) that's the correct trade-off — we don't need
 * to save the network call, we need the UI to not flicker.
 */

export interface StalenessGuard {
  begin: () => () => boolean;
  invalidate: () => void;
}

export function createStalenessGuard(): StalenessGuard {
  let counter = 0;
  return {
    begin() {
      const my = ++counter;
      return () => my === counter;
    },
    invalidate() {
      counter++;
    },
  };
}
