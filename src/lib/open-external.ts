/**
 * Open an external URL. In VS Code WebView, posts a message to the
 * extension host. In a normal browser, uses window.open.
 */
export function openExternal(href: string, isEmbedded: boolean): void {
  if (isEmbedded) {
    // VS Code WebView blocks window.open — ask the extension to open it
    window.parent.postMessage({ type: "open-external", url: href }, "*");
  } else {
    window.open(href, "_blank", "noopener,noreferrer");
  }
}
