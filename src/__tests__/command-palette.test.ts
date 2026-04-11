/**
 * Tests for the command-palette pure helpers — filtering, ranking, and
 * the predicate that decides whether Cmd+Shift+P should open the palette.
 *
 * Contract is defined here test-first. The palette UI is a thin shell over
 * these helpers and is covered by manual testing + typecheck, not by DOM
 * tests.
 */
import { describe, it, expect } from "vitest";
import {
  filterCommands,
  shouldOpenCommandPalette,
  type Command,
} from "@/lib/command-palette";

function cmd(overrides: Partial<Command>): Command {
  return {
    id: "test",
    label: "Test",
    handler: () => {},
    ...overrides,
  };
}

describe("filterCommands", () => {
  const sample: Command[] = [
    cmd({ id: "toggle-theme", label: "Toggle dark mode", category: "View", keywords: ["dark", "light", "theme"] }),
    cmd({ id: "settings", label: "Open Settings", category: "Preferences" }),
    cmd({ id: "new-file", label: "New file", category: "File", keywords: ["create"] }),
    cmd({ id: "help", label: "Keyboard shortcuts", category: "Help" }),
  ];

  it("returns all commands for empty or whitespace-only query", () => {
    expect(filterCommands(sample, "")).toHaveLength(4);
    expect(filterCommands(sample, "   ")).toHaveLength(4);
  });

  it("filters by label substring", () => {
    const matches = filterCommands(sample, "settings");
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe("settings");
  });

  it("is case-insensitive", () => {
    expect(filterCommands(sample, "SETTINGS")).toHaveLength(1);
    expect(filterCommands(sample, "SeTtInGs")).toHaveLength(1);
  });

  it("filters by category name", () => {
    const matches = filterCommands(sample, "view");
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe("toggle-theme");
  });

  it("filters by keyword list", () => {
    // "dark" appears in keywords for toggle-theme
    const matches = filterCommands(sample, "dark");
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe("toggle-theme");
  });

  it("filters by alternate keyword", () => {
    const matches = filterCommands(sample, "create");
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe("new-file");
  });

  it("matches a partial substring inside the label", () => {
    expect(filterCommands(sample, "board")).toHaveLength(1); // "Keyboard shortcuts"
  });

  it("returns empty when nothing matches", () => {
    expect(filterCommands(sample, "xyzzy")).toEqual([]);
  });

  // ─── Ranking ────────────────────────────────────────────────────────────

  it("ranks label-start matches above mid-label matches", () => {
    const cmds: Command[] = [
      cmd({ id: "a", label: "Export file" }),
      cmd({ id: "b", label: "Expand block" }),
      cmd({ id: "c", label: "Commit an express PR" }),
    ];
    // Query "exp" should prefer the commands where "exp" starts a word
    // ("Export" and "Expand") over mid-word matches ("express").
    const matches = filterCommands(cmds, "exp");
    expect(matches).toHaveLength(3);
    expect(matches[0].id).not.toBe("c"); // The mid-word match should sink
  });

  it("ranks exact label match highest", () => {
    const cmds: Command[] = [
      cmd({ id: "a", label: "New file" }),
      cmd({ id: "b", label: "Open a new file from URL" }),
    ];
    const matches = filterCommands(cmds, "new file");
    expect(matches[0].id).toBe("a"); // exact match wins
  });
});

// ─── shouldOpenCommandPalette ──────────────────────────────────────────

describe("shouldOpenCommandPalette", () => {
  function mockEvent(
    key: string,
    opts: { meta?: boolean; ctrl?: boolean; shift?: boolean; tag?: string; ce?: boolean } = {}
  ): any {
    return {
      key,
      metaKey: !!opts.meta,
      ctrlKey: !!opts.ctrl,
      shiftKey: !!opts.shift,
      target: { tagName: opts.tag, isContentEditable: !!opts.ce },
    };
  }

  it("opens on ⌘⇧P (macOS convention)", () => {
    expect(shouldOpenCommandPalette(mockEvent("P", { meta: true, shift: true }))).toBe(true);
  });

  it("opens on Ctrl+Shift+P (Windows/Linux convention)", () => {
    expect(shouldOpenCommandPalette(mockEvent("P", { ctrl: true, shift: true }))).toBe(true);
  });

  it("accepts lowercase `p` (some browsers report this)", () => {
    expect(shouldOpenCommandPalette(mockEvent("p", { meta: true, shift: true }))).toBe(true);
  });

  it("does NOT open without the Shift modifier", () => {
    // ⌘P is browser Print — we don't want to hijack it.
    expect(shouldOpenCommandPalette(mockEvent("P", { meta: true }))).toBe(false);
  });

  it("does NOT open without the Cmd or Ctrl modifier", () => {
    expect(shouldOpenCommandPalette(mockEvent("P", { shift: true }))).toBe(false);
  });

  it("does NOT open on a different key", () => {
    expect(shouldOpenCommandPalette(mockEvent("K", { meta: true, shift: true }))).toBe(false);
  });

  it("opens even when focus is in an input (modifier is explicit)", () => {
    // Unlike bare `?`, a three-key chord is unambiguous and safe to fire
    // regardless of focus.
    expect(
      shouldOpenCommandPalette(mockEvent("P", { meta: true, shift: true, tag: "INPUT" }))
    ).toBe(true);
    expect(
      shouldOpenCommandPalette(mockEvent("P", { meta: true, shift: true, tag: "TEXTAREA" }))
    ).toBe(true);
    expect(
      shouldOpenCommandPalette(mockEvent("P", { meta: true, shift: true, ce: true }))
    ).toBe(true);
  });
});
