import { describe, it, expect } from "vitest";
import { parseHash, buildFileHash, buildPRHash, buildRepoHash } from "@/lib/hash-router";

describe("parseHash", () => {
  // ─── Basic routes ───────────────────────────────────────────────────

  it("returns none for empty hash", () => {
    expect(parseHash("")).toEqual({ type: "none" });
    expect(parseHash("#")).toEqual({ type: "none" });
    expect(parseHash("#/")).toEqual({ type: "none" });
  });

  it("returns none for single segment", () => {
    expect(parseHash("#/owner")).toEqual({ type: "none" });
  });

  it("parses repo route", () => {
    expect(parseHash("#/acme/widgets")).toEqual({
      type: "repo",
      owner: "acme",
      repo: "widgets",
      repoFullName: "acme/widgets",
    });
  });

  it("parses file route", () => {
    expect(parseHash("#/acme/widgets/blob/main/docs/readme.md")).toEqual({
      type: "file",
      owner: "acme",
      repo: "widgets",
      repoFullName: "acme/widgets",
      branch: "main",
      filePath: "docs/readme.md",
    });
  });

  it("parses PR route", () => {
    expect(parseHash("#/acme/widgets/pull/42")).toEqual({
      type: "pr",
      owner: "acme",
      repo: "widgets",
      repoFullName: "acme/widgets",
      prNumber: 42,
    });
  });

  it("parses PR file route", () => {
    expect(parseHash("#/acme/widgets/pull/42/files/3")).toEqual({
      type: "pr",
      owner: "acme",
      repo: "widgets",
      repoFullName: "acme/widgets",
      prNumber: 42,
      prFileIdx: 3,
    });
  });

  // ─── URL decoding ──────────────────────────────────────────────────

  it("decodes URL-encoded file paths", () => {
    const route = parseHash("#/acme/widgets/blob/main/docs/my%20file.md");
    expect(route.filePath).toBe("docs/my file.md");
  });

  it("decodes URL-encoded branch names", () => {
    const route = parseHash("#/acme/widgets/blob/feature%2Fnew-thing/readme.md");
    expect(route.branch).toBe("feature/new-thing");
  });

  it("decodes unicode in file paths", () => {
    const route = parseHash("#/acme/widgets/blob/main/docs/%E4%B8%AD%E6%96%87.md");
    expect(route.filePath).toBe("docs/中文.md");
  });

  it("handles already-decoded paths (no double decoding)", () => {
    const route = parseHash("#/acme/widgets/blob/main/docs/normal-file.md");
    expect(route.filePath).toBe("docs/normal-file.md");
  });

  // ─── Malformed routes ──────────────────────────────────────────────

  it("falls back to repo for non-numeric PR number", () => {
    const route = parseHash("#/acme/widgets/pull/abc");
    expect(route.type).toBe("repo");
  });

  it("falls back to repo for non-numeric file index", () => {
    const route = parseHash("#/acme/widgets/pull/42/files/abc");
    // Non-numeric fileIdx fails the isNaN check, falls through to PR route
    expect(route.type).toBe("pr");
    expect(route.prNumber).toBe(42);
    expect(route.prFileIdx).toBeUndefined();
  });
});

describe("buildFileHash", () => {
  it("builds a file hash", () => {
    expect(buildFileHash("acme/widgets", "main", "docs/readme.md"))
      .toBe("#/acme/widgets/blob/main/docs/readme.md");
  });
});

describe("buildPRHash", () => {
  it("builds a PR hash without file index", () => {
    expect(buildPRHash("acme/widgets", 42)).toBe("#/acme/widgets/pull/42");
  });

  it("builds a PR hash with file index", () => {
    expect(buildPRHash("acme/widgets", 42, 3)).toBe("#/acme/widgets/pull/42/files/3");
  });

  it("omits file index when 0", () => {
    expect(buildPRHash("acme/widgets", 42, 0)).toBe("#/acme/widgets/pull/42");
  });
});

describe("buildRepoHash", () => {
  it("builds a repo hash", () => {
    expect(buildRepoHash("acme/widgets")).toBe("#/acme/widgets");
  });
});
