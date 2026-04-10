import { PendingInlineComment } from "@/lib/github-api";

/**
 * Detects the specific GitHub error that means "one or more of the inline
 * comment lines is outside a diff hunk on that file".
 *
 * GitHub's pulls.createReview is atomic: if any comment's `line` doesn't
 * resolve to a position in the PR diff, the whole review is rejected with a
 * 422 referring to "could not be resolved" or "pull_request_review_thread.line".
 *
 * Extracted as a pure predicate so the fallback logic in
 * submitReviewBatched can be unit-tested without a real Octokit error.
 */
export function isLineResolutionError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const anyErr = err as Record<string, any>;
  const status = anyErr.status ?? anyErr.response?.status;
  if (status !== 422) return false;
  const message = String(anyErr.message || "").toLowerCase();
  return (
    message.includes("could not be resolved") ||
    message.includes("pull_request_review_thread.line")
  );
}

/**
 * Dependencies that the fallback loop needs to talk to GitHub. Injected so
 * tests can provide mocks without pulling in a real Octokit.
 */
export interface ReviewFallbackDeps {
  postInlineComment: (c: PendingInlineComment) => Promise<void>;
  postIssueComment: (body: string) => Promise<void>;
}

/**
 * Try each pending comment as an individual inline review comment. If the
 * inline post fails for a specific comment (its line doesn't resolve on this
 * specific file, or any other per-comment error), fall back to posting that
 * comment as a general PR issue comment with the file + line context baked
 * into the body so the feedback isn't lost.
 *
 * Returns the number of comments that ended up as issue comments instead of
 * inline review threads, so the caller can surface a warning.
 */
export async function runInlineFallback(
  comments: PendingInlineComment[],
  deps: ReviewFallbackDeps
): Promise<{ unresolvedCount: number }> {
  let unresolvedCount = 0;
  for (const c of comments) {
    try {
      await deps.postInlineComment(c);
    } catch {
      unresolvedCount++;
      const range =
        c.startLine && c.startLine !== c.line
          ? ` (L${c.startLine}-L${c.line})`
          : ` (L${c.line})`;
      const contextBody = `**${c.path}**${range}\n\n${c.body}`;
      try {
        await deps.postIssueComment(contextBody);
      } catch {
        // Give up silently on this one — at least the others posted.
      }
    }
  }
  return { unresolvedCount };
}
