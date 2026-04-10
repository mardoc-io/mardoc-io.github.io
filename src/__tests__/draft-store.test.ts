import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  saveDraft,
  loadDraft,
  clearDraft,
  formatRelativeSavedAt,
  reconcileDraft,
  resolveDraftOnLoad,
  type DraftScope,
} from "@/lib/draft-store";

const repoScope = (overrides: Partial<DraftScope> = {}): DraftScope => ({
  repoFullName: "owner/repo",
  branch: "main",
  filePath: "docs/notes.md",
  isNewFile: false,
  isLocalFile: false,
  ...overrides,
});

describe("draft-store", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // ─── Key scoping ────────────────────────────────────────────────────────

  it("saveDraft writes a versioned key to localStorage", () => {
    saveDraft("owner/repo", "main", "docs/notes.md", "# hello");
    const key = "mardoc:draft:v1:owner/repo:main:docs/notes.md";
    const raw = localStorage.getItem(key);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.markdown).toBe("# hello");
    expect(typeof parsed.savedAt).toBe("number");
  });

  it("keys with undefined repo fall back to __local__ scope", () => {
    saveDraft(undefined, undefined, "foo.md", "content");
    const key = "mardoc:draft:v1:__local__:__nobranch__:foo.md";
    expect(localStorage.getItem(key)).not.toBeNull();
  });

  it("different {repo, branch, path} combinations do not collide", () => {
    saveDraft("a/b", "main", "x.md", "one");
    saveDraft("a/b", "dev", "x.md", "two");
    saveDraft("a/b", "main", "y.md", "three");

    expect(loadDraft("a/b", "main", "x.md")?.markdown).toBe("one");
    expect(loadDraft("a/b", "dev", "x.md")?.markdown).toBe("two");
    expect(loadDraft("a/b", "main", "y.md")?.markdown).toBe("three");
  });

  // ─── Round-trip ─────────────────────────────────────────────────────────

  it("loadDraft returns the markdown and savedAt that were written", () => {
    const before = Date.now();
    saveDraft("o/r", "main", "p.md", "body");
    const after = Date.now();

    const draft = loadDraft("o/r", "main", "p.md");
    expect(draft).not.toBeNull();
    expect(draft!.markdown).toBe("body");
    expect(draft!.savedAt).toBeGreaterThanOrEqual(before);
    expect(draft!.savedAt).toBeLessThanOrEqual(after);
  });

  it("loadDraft returns null when no draft exists", () => {
    expect(loadDraft("o/r", "main", "nope.md")).toBeNull();
  });

  it("loadDraft returns null for malformed payloads", () => {
    const key = "mardoc:draft:v1:o/r:main:p.md";
    localStorage.setItem(key, "not-json");
    expect(loadDraft("o/r", "main", "p.md")).toBeNull();

    localStorage.setItem(key, JSON.stringify({ markdown: 42 }));
    expect(loadDraft("o/r", "main", "p.md")).toBeNull();

    localStorage.setItem(key, JSON.stringify({ savedAt: "never" }));
    expect(loadDraft("o/r", "main", "p.md")).toBeNull();
  });

  it("saveDraft overwrites the previous value for the same key", () => {
    saveDraft("o/r", "main", "p.md", "first");
    saveDraft("o/r", "main", "p.md", "second");
    expect(loadDraft("o/r", "main", "p.md")?.markdown).toBe("second");
  });

  it("clearDraft removes the stored draft", () => {
    saveDraft("o/r", "main", "p.md", "gone soon");
    clearDraft("o/r", "main", "p.md");
    expect(loadDraft("o/r", "main", "p.md")).toBeNull();
  });

  // ─── UTF-8 content ──────────────────────────────────────────────────────

  it("round-trips unicode content (emoji, em-dash, CJK)", () => {
    const md = "# 🚀 em—dash 中文\n- item\n";
    saveDraft("o/r", "main", "u.md", md);
    expect(loadDraft("o/r", "main", "u.md")?.markdown).toBe(md);
  });

  // ─── Failure modes ──────────────────────────────────────────────────────

  it("saveDraft is a no-op when localStorage throws (quota, private mode)", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    });
    expect(() => saveDraft("o/r", "main", "p.md", "body")).not.toThrow();
  });

  it("loadDraft returns null when localStorage throws", () => {
    localStorage.setItem("mardoc:draft:v1:o/r:main:p.md", JSON.stringify({ markdown: "ok", savedAt: Date.now() }));
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("access denied", "SecurityError");
    });
    expect(loadDraft("o/r", "main", "p.md")).toBeNull();
  });

  it("clearDraft is a no-op when localStorage throws", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("access denied", "SecurityError");
    });
    expect(() => clearDraft("o/r", "main", "p.md")).not.toThrow();
  });

  // ─── formatRelativeSavedAt ──────────────────────────────────────────────

  it("formatRelativeSavedAt returns 'just now' for recent writes", () => {
    expect(formatRelativeSavedAt(Date.now())).toBe("just now");
    expect(formatRelativeSavedAt(Date.now() - 10 * 1000)).toBe("just now");
  });

  it("formatRelativeSavedAt formats minutes, hours, days", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T12:00:00Z"));

    expect(formatRelativeSavedAt(Date.now() - 2 * 60 * 1000)).toBe("2m ago");
    expect(formatRelativeSavedAt(Date.now() - 3 * 60 * 60 * 1000)).toBe("3h ago");
    expect(formatRelativeSavedAt(Date.now() - 2 * 24 * 60 * 60 * 1000)).toBe("2d ago");
  });

  it("formatRelativeSavedAt falls back to a locale date string after a week", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T12:00:00Z"));
    const tenDaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000;
    const result = formatRelativeSavedAt(tenDaysAgo);
    // Just confirm it looks like a date, not "Nd ago"
    expect(result).not.toMatch(/ago$/);
    expect(result.length).toBeGreaterThan(0);
  });

  // ─── reconcileDraft (the core autosave decision) ───────────────────────

  describe("reconcileDraft", () => {
    it("saves a draft when current markdown differs from baseline", () => {
      const result = reconcileDraft(repoScope(), "original", "edited");
      expect(result.dirty).toBe(true);
      expect(loadDraft("owner/repo", "main", "docs/notes.md")?.markdown).toBe("edited");
    });

    it("clears the draft when the edit is undone back to baseline", () => {
      saveDraft("owner/repo", "main", "docs/notes.md", "edited");
      const result = reconcileDraft(repoScope(), "original", "original");
      expect(result.dirty).toBe(false);
      expect(loadDraft("owner/repo", "main", "docs/notes.md")).toBeNull();
    });

    it("does nothing for new files (returns dirty=false, no save)", () => {
      const scope = repoScope({ isNewFile: true, filePath: "__new__/untitled.md" });
      const result = reconcileDraft(scope, "", "some content");
      expect(result.dirty).toBe(false);
      expect(loadDraft(scope.repoFullName, scope.branch, scope.filePath)).toBeNull();
    });

    it("does nothing for local-only files", () => {
      const scope = repoScope({ isLocalFile: true, filePath: "__local__/foo.md" });
      const result = reconcileDraft(scope, "", "edited");
      expect(result.dirty).toBe(false);
      expect(loadDraft(scope.repoFullName, scope.branch, scope.filePath)).toBeNull();
    });

    it("does nothing when the baseline is null (editor still booting)", () => {
      const result = reconcileDraft(repoScope(), null, "edited");
      expect(result.dirty).toBe(false);
      expect(loadDraft("owner/repo", "main", "docs/notes.md")).toBeNull();
    });

    it("updates the draft on each keystroke with the latest content", () => {
      reconcileDraft(repoScope(), "base", "edit 1");
      reconcileDraft(repoScope(), "base", "edit 2");
      reconcileDraft(repoScope(), "base", "edit 3");
      expect(loadDraft("owner/repo", "main", "docs/notes.md")?.markdown).toBe("edit 3");
    });

    it("honors scope — two files in the same repo+branch get independent drafts", () => {
      reconcileDraft(repoScope({ filePath: "a.md" }), "base", "draft for a");
      reconcileDraft(repoScope({ filePath: "b.md" }), "base", "draft for b");
      expect(loadDraft("owner/repo", "main", "a.md")?.markdown).toBe("draft for a");
      expect(loadDraft("owner/repo", "main", "b.md")?.markdown).toBe("draft for b");
    });
  });

  // ─── resolveDraftOnLoad (the restore-banner decision) ──────────────────

  describe("resolveDraftOnLoad", () => {
    it("returns the draft when it differs from upstream baseline", () => {
      saveDraft("owner/repo", "main", "docs/notes.md", "edited");
      const draft = resolveDraftOnLoad(repoScope(), "upstream");
      expect(draft).not.toBeNull();
      expect(draft!.markdown).toBe("edited");
    });

    it("returns null and clears the stored draft when it matches upstream", () => {
      saveDraft("owner/repo", "main", "docs/notes.md", "same");
      const draft = resolveDraftOnLoad(repoScope(), "same");
      expect(draft).toBeNull();
      expect(loadDraft("owner/repo", "main", "docs/notes.md")).toBeNull();
    });

    it("returns null when no draft is stored", () => {
      const draft = resolveDraftOnLoad(repoScope(), "upstream");
      expect(draft).toBeNull();
    });

    it("returns null for new files regardless of stored state", () => {
      saveDraft("owner/repo", "main", "__new__/untitled.md", "anything");
      const scope = repoScope({ isNewFile: true, filePath: "__new__/untitled.md" });
      expect(resolveDraftOnLoad(scope, "upstream")).toBeNull();
    });

    it("returns null for local files regardless of stored state", () => {
      saveDraft("owner/repo", "main", "__local__/foo.md", "anything");
      const scope = repoScope({ isLocalFile: true, filePath: "__local__/foo.md" });
      expect(resolveDraftOnLoad(scope, "upstream")).toBeNull();
    });
  });
});
