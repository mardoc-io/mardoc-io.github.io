/**
 * Pure search helpers for the rich-view find/replace TipTap extension.
 *
 * A ProseMirror document uses an opaque position numbering system:
 * blocks contribute 2 positions for open/close tokens, text contributes
 * 1 per character. Rather than test against a real PM instance, the
 * extension walks the doc with `doc.descendants` and produces a list of
 * TextRun { text, docPos } — contiguous text segments with their
 * starting doc position. The helper below takes those runs plus a
 * query and returns match ranges in doc-position space.
 *
 * Matches never cross a run boundary. This is correct for two
 * reasons:
 *   1. Runs within the same block are split only by mark boundaries
 *      (bold / italic / link / code), and we don't want a search to
 *      match across a formatting boundary because the replace would
 *      get tangled with marks.
 *   2. Runs in different blocks are separated by block open/close
 *      tokens in doc position space, so cross-block matches would be
 *      wrong anyway.
 *
 * Tested in tiptap-search.test.ts.
 */

import { findAll, type FindOptions } from "@/lib/find-replace";

export interface TextRun {
  text: string;
  docPos: number;
}

export interface DocMatch {
  from: number;
  to: number;
}

/**
 * Find every occurrence of `query` inside the text runs of a
 * ProseMirror doc and return doc-position ranges.
 *
 * Each run is searched independently — matches do not cross run
 * boundaries. Results are returned sorted by ascending `from`.
 */
export function findMatchesInRuns(
  runs: TextRun[],
  query: string,
  options: FindOptions
): DocMatch[] {
  if (!query || runs.length === 0) return [];

  const matches: DocMatch[] = [];
  for (const run of runs) {
    const found = findAll(run.text, query, options);
    for (const m of found) {
      matches.push({
        from: run.docPos + m.start,
        to: run.docPos + m.end,
      });
    }
  }
  matches.sort((a, b) => a.from - b.from);
  return matches;
}
