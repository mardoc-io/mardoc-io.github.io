import { describe, it, expect, vi, beforeEach } from "vitest";
import { openExternal } from "@/lib/open-external";

describe("openExternal", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uses window.open in browser mode", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    openExternal("https://example.com", false);
    expect(openSpy).toHaveBeenCalledWith("https://example.com", "_blank", "noopener,noreferrer");
  });

  it("posts message to parent in embed mode", () => {
    const postSpy = vi.spyOn(window.parent, "postMessage").mockImplementation(() => {});
    openExternal("https://example.com", true);
    expect(postSpy).toHaveBeenCalledWith(
      { type: "open-external", url: "https://example.com" },
      "*"
    );
  });

  it("does not use window.open in embed mode", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    vi.spyOn(window.parent, "postMessage").mockImplementation(() => {});
    openExternal("https://example.com", true);
    expect(openSpy).not.toHaveBeenCalled();
  });
});
