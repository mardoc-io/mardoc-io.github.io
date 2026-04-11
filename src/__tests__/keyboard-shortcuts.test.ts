/**
 * Tests for the keyboard shortcut registry and cheatsheet helpers.
 *
 * The cheatsheet itself is a modal UI (opened with `?`), but all the
 * interesting behavior is in the pure functions that back it: the static
 * shortcut registry, grouping, filtering, and the predicate that decides
 * whether a `?` keypress should actually open the modal (we bail when the
 * user is typing in an input or editor so we don't steal their "?").
 *
 * Pure — no DOM mounting, no React.
 */
import { describe, it, expect } from "vitest";
import {
  ALL_SHORTCUTS,
  groupByCategory,
  filterShortcuts,
  shouldOpenCheatsheet,
  type Shortcut,
} from "@/lib/keyboard-shortcuts";

describe("ALL_SHORTCUTS registry", () => {
  it("is a non-empty list", () => {
    expect(ALL_SHORTCUTS.length).toBeGreaterThan(0);
  });

  it("every entry has keys, description, and category", () => {
    for (const s of ALL_SHORTCUTS) {
      expect(s.keys.length).toBeGreaterThan(0);
      expect(s.description.length).toBeGreaterThan(0);
      expect(s.category.length).toBeGreaterThan(0);
    }
  });

  it("includes the canonical editor formatting shortcuts", () => {
    const descriptions = ALL_SHORTCUTS.map((s) => s.description.toLowerCase());
    expect(descriptions.some((d) => d.includes("bold"))).toBe(true);
    expect(descriptions.some((d) => d.includes("italic"))).toBe(true);
    expect(descriptions.some((d) => d.includes("undo"))).toBe(true);
    expect(descriptions.some((d) => d.includes("redo"))).toBe(true);
  });

  it("includes the cheatsheet itself (`?` → open)", () => {
    const entry = ALL_SHORTCUTS.find((s) =>
      s.description.toLowerCase().includes("cheatsheet") ||
      s.description.toLowerCase().includes("shortcut")
    );
    expect(entry).toBeDefined();
    expect(entry!.keys).toContain("?");
  });
});

// ─── groupByCategory ───────────────────────────────────────────────────

describe("groupByCategory", () => {
  const sample: Shortcut[] = [
    { keys: ["⌘", "B"], description: "Bold", category: "Editor" },
    { keys: ["⌘", "I"], description: "Italic", category: "Editor" },
    { keys: ["j"], description: "Next file", category: "Review" },
    { keys: ["k"], description: "Previous file", category: "Review" },
  ];

  it("groups shortcuts by their category", () => {
    const grouped = groupByCategory(sample);
    expect(Object.keys(grouped).sort()).toEqual(["Editor", "Review"]);
    expect(grouped.Editor).toHaveLength(2);
    expect(grouped.Review).toHaveLength(2);
  });

  it("preserves the order of shortcuts within each category", () => {
    const grouped = groupByCategory(sample);
    expect(grouped.Editor.map((s) => s.description)).toEqual(["Bold", "Italic"]);
    expect(grouped.Review.map((s) => s.description)).toEqual(["Next file", "Previous file"]);
  });

  it("returns an empty object for empty input", () => {
    expect(groupByCategory([])).toEqual({});
  });
});

// ─── filterShortcuts ───────────────────────────────────────────────────

describe("filterShortcuts", () => {
  const sample: Shortcut[] = [
    { keys: ["⌘", "B"], description: "Bold", category: "Editor" },
    { keys: ["⌘", "I"], description: "Italic", category: "Editor" },
    { keys: ["⌘", "K"], description: "Insert link", category: "Editor" },
    { keys: ["?"], description: "Open keyboard cheatsheet", category: "Help" },
  ];

  it("returns all shortcuts for an empty query", () => {
    expect(filterShortcuts(sample, "")).toHaveLength(4);
    expect(filterShortcuts(sample, "   ")).toHaveLength(4);
  });

  it("filters by description substring", () => {
    expect(filterShortcuts(sample, "bold")).toHaveLength(1);
    expect(filterShortcuts(sample, "link")).toHaveLength(1);
  });

  it("is case-insensitive", () => {
    expect(filterShortcuts(sample, "BOLD")).toHaveLength(1);
    expect(filterShortcuts(sample, "Italic")).toHaveLength(1);
  });

  it("filters by key character", () => {
    // Searching for "K" should match the Insert link shortcut (⌘K).
    const matches = filterShortcuts(sample, "K");
    expect(matches.some((s) => s.description === "Insert link")).toBe(true);
  });

  it("filters by category name", () => {
    const matches = filterShortcuts(sample, "help");
    expect(matches).toHaveLength(1);
    expect(matches[0].description).toContain("cheatsheet");
  });

  it("returns empty when nothing matches", () => {
    expect(filterShortcuts(sample, "xyzzy")).toEqual([]);
  });

  it("matches a partial word in the middle of a description", () => {
    expect(filterShortcuts(sample, "heet")).toHaveLength(1);
  });
});

// ─── shouldOpenCheatsheet ─────────────────────────────────────────────

describe("shouldOpenCheatsheet", () => {
  function mockEvent(key: string, targetTag?: string, isContentEditable = false): any {
    const target: any = {
      tagName: targetTag,
      isContentEditable,
    };
    return { key, target };
  }

  it("opens when `?` is pressed on the body", () => {
    expect(shouldOpenCheatsheet(mockEvent("?", "BODY"))).toBe(true);
  });

  it("opens when `?` is pressed with no specific tag (document-level)", () => {
    expect(shouldOpenCheatsheet(mockEvent("?"))).toBe(true);
  });

  it("does NOT open for a non-question key", () => {
    expect(shouldOpenCheatsheet(mockEvent("a", "BODY"))).toBe(false);
    expect(shouldOpenCheatsheet(mockEvent("/", "BODY"))).toBe(false);
    expect(shouldOpenCheatsheet(mockEvent("Enter", "BODY"))).toBe(false);
  });

  it("does NOT open when typing in an <input>", () => {
    // Otherwise asking a question in a comment would accidentally open the
    // cheatsheet. The modal is a global UI concern — bail inside any text
    // entry surface.
    expect(shouldOpenCheatsheet(mockEvent("?", "INPUT"))).toBe(false);
  });

  it("does NOT open when typing in a <textarea>", () => {
    expect(shouldOpenCheatsheet(mockEvent("?", "TEXTAREA"))).toBe(false);
  });

  it("does NOT open when typing in a contenteditable element (TipTap)", () => {
    // The rich editor is contenteditable — pressing `?` there means
    // inserting a question mark into the document, not opening a modal.
    expect(shouldOpenCheatsheet(mockEvent("?", "DIV", true))).toBe(false);
  });

  it("does NOT open when typing in a <select>", () => {
    expect(shouldOpenCheatsheet(mockEvent("?", "SELECT"))).toBe(false);
  });
});
