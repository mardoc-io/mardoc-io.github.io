/** Shared file-type detection helpers. */

export function isMarkdownFile(name: string): boolean {
  return name.endsWith(".md") || name.endsWith(".mdx");
}

export function isHtmlFile(name: string): boolean {
  return name.endsWith(".html") || name.endsWith(".htm");
}

/** Returns true for any file type MarDoc can render (markdown or HTML). */
export function isDocumentFile(name: string): boolean {
  return isMarkdownFile(name) || isHtmlFile(name);
}
