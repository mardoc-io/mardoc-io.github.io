import { RepoFile } from "@/types";

/**
 * Resolve a relative link path against the current file's directory.
 * e.g. resolvePath("docs/guide/intro.md", "../architecture.md") => "docs/architecture.md"
 */
export function resolvePath(currentFilePath: string, href: string): string {
  // Strip leading ./ if present
  const cleanHref = href.replace(/^\.\//, "");

  // Get the directory of the current file
  const parts = currentFilePath.split("/");
  parts.pop(); // remove filename
  const dirParts = [...parts];

  // Process each segment of the href
  for (const segment of cleanHref.split("/")) {
    if (segment === "..") {
      dirParts.pop();
    } else if (segment !== ".") {
      dirParts.push(segment);
    }
  }

  return dirParts.join("/");
}

/**
 * Find a file in the repo tree by path (recursive).
 */
export function findFileByPath(files: RepoFile[], path: string): RepoFile | null {
  for (const file of files) {
    if (file.path === path) return file;
    if (file.children) {
      const found = findFileByPath(file.children, path);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Classify a link href as anchor, relative, or external.
 */
export type LinkType = "anchor" | "relative" | "external";

export function classifyLink(href: string): LinkType {
  if (href.startsWith("#")) return "anchor";
  if (href.startsWith("http://") || href.startsWith("https://") || href.startsWith("mailto:")) return "external";
  return "relative";
}
