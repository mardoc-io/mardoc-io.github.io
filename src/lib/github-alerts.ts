/**
 * GitHub Alerts post-processor for Showdown HTML output.
 *
 * GitHub renders blockquotes with a `> [!TYPE]` marker as semantic
 * callouts (NOTE / TIP / IMPORTANT / WARNING / CAUTION). Showdown has no
 * native support, so it emits the marker as literal text inside an
 * ordinary <blockquote><p>. This transformer finds those blockquotes and
 * rewrites them to <div class="markdown-alert markdown-alert-<type>"> with
 * a title <p> at the top, which our CSS can then style.
 *
 * Pure function, no DOM. Tested in github-alerts.test.ts (22 tests).
 */

const ALERT_TYPES = [
  "note",
  "tip",
  "important",
  "warning",
  "caution",
] as const;

const ALERT_RE = new RegExp(
  "<blockquote>\\s*<p>\\s*\\[!(" +
    ALERT_TYPES.join("|") +
    ")\\]([\\s\\S]*?)</blockquote>",
  "gi"
);

export function transformGitHubAlerts(html: string): string {
  if (!html) return html;
  return html.replace(ALERT_RE, (_, rawType: string, inner: string) => {
    const type = rawType.toLowerCase();
    const title = type.charAt(0).toUpperCase() + type.slice(1);

    // `inner` is the text between `]` and `</blockquote>`. The showdown
    // <p> that wraps [!TYPE] is still open — we need to either close it
    // (if the marker was the only content in that paragraph) or wrap the
    // trailing content in a fresh <p>.
    const trimmed = inner.trim();

    // Case 1: `[!TYPE]</p>...` — the first paragraph contained only the
    // marker. Strip the dangling </p> and use whatever remains as the
    // body. If nothing remains, it's a title-only alert.
    if (trimmed.startsWith("</p>")) {
      const rest = trimmed.slice("</p>".length).trim();
      if (!rest) {
        return `<div class="markdown-alert markdown-alert-${type}"><p class="markdown-alert-title">${title}</p></div>`;
      }
      return `<div class="markdown-alert markdown-alert-${type}"><p class="markdown-alert-title">${title}</p>${rest}</div>`;
    }

    // Case 2: the marker had body text after it on the same paragraph.
    // Wrap the captured content (which already ends with </p>) in a new
    // <p> so the document structure stays valid.
    return `<div class="markdown-alert markdown-alert-${type}"><p class="markdown-alert-title">${title}</p><p>${trimmed}</div>`;
  });
}
