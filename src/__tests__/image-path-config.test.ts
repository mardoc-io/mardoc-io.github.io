/**
 * Tests for the per-repo image upload path configuration.
 *
 * The user can set a different target folder per repo (e.g. some
 * projects use docs/images, some docs/assets, some src/assets). The
 * setting is persisted in localStorage keyed by repo full name, with
 * a sensible default.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  getImageUploadFolder,
  setImageUploadFolder,
  sanitizeImageFolder,
  DEFAULT_IMAGE_FOLDER,
} from "@/lib/image-path-config";

describe("DEFAULT_IMAGE_FOLDER", () => {
  it("is a reasonable default", () => {
    expect(DEFAULT_IMAGE_FOLDER).toBe("docs/images");
  });
});

describe("sanitizeImageFolder", () => {
  it("returns the trimmed folder unchanged for a well-formed input", () => {
    expect(sanitizeImageFolder("docs/images")).toBe("docs/images");
    expect(sanitizeImageFolder("docs/assets/img")).toBe("docs/assets/img");
  });

  it("strips leading and trailing slashes", () => {
    expect(sanitizeImageFolder("/docs/images")).toBe("docs/images");
    expect(sanitizeImageFolder("docs/images/")).toBe("docs/images");
    expect(sanitizeImageFolder("/docs/images/")).toBe("docs/images");
  });

  it("collapses consecutive slashes", () => {
    expect(sanitizeImageFolder("docs//images")).toBe("docs/images");
    expect(sanitizeImageFolder("docs///images")).toBe("docs/images");
  });

  it("trims surrounding whitespace", () => {
    expect(sanitizeImageFolder("  docs/images  ")).toBe("docs/images");
  });

  it("rejects path traversal and returns the default", () => {
    expect(sanitizeImageFolder("../docs/images")).toBe(DEFAULT_IMAGE_FOLDER);
    expect(sanitizeImageFolder("docs/../escape")).toBe(DEFAULT_IMAGE_FOLDER);
    expect(sanitizeImageFolder("docs/images/..")).toBe(DEFAULT_IMAGE_FOLDER);
  });

  it("rejects empty or whitespace-only input", () => {
    expect(sanitizeImageFolder("")).toBe(DEFAULT_IMAGE_FOLDER);
    expect(sanitizeImageFolder("   ")).toBe(DEFAULT_IMAGE_FOLDER);
    expect(sanitizeImageFolder("//")).toBe(DEFAULT_IMAGE_FOLDER);
  });

  it("rejects absolute-looking paths with protocols", () => {
    expect(sanitizeImageFolder("http://example.com/docs")).toBe(DEFAULT_IMAGE_FOLDER);
    expect(sanitizeImageFolder("file:///docs")).toBe(DEFAULT_IMAGE_FOLDER);
  });

  it("accepts a single-level folder", () => {
    expect(sanitizeImageFolder("assets")).toBe("assets");
  });

  it("accepts folder names with hyphens, underscores, and numbers", () => {
    expect(sanitizeImageFolder("docs/images-2024")).toBe("docs/images-2024");
    expect(sanitizeImageFolder("my_assets")).toBe("my_assets");
  });
});

describe("getImageUploadFolder / setImageUploadFolder", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns the default when no value is stored", () => {
    expect(getImageUploadFolder("owner/repo")).toBe(DEFAULT_IMAGE_FOLDER);
  });

  it("returns the default when the repo is undefined", () => {
    expect(getImageUploadFolder(undefined)).toBe(DEFAULT_IMAGE_FOLDER);
  });

  it("returns a stored value per repo", () => {
    setImageUploadFolder("owner/repo", "docs/assets");
    expect(getImageUploadFolder("owner/repo")).toBe("docs/assets");
  });

  it("keeps different repos independent", () => {
    setImageUploadFolder("owner/a", "docs/images");
    setImageUploadFolder("owner/b", "assets");
    expect(getImageUploadFolder("owner/a")).toBe("docs/images");
    expect(getImageUploadFolder("owner/b")).toBe("assets");
  });

  it("sanitizes on the way in", () => {
    setImageUploadFolder("owner/repo", "  /docs//assets/  ");
    expect(getImageUploadFolder("owner/repo")).toBe("docs/assets");
  });

  it("falls back to default if the stored value was tampered with", () => {
    // Someone edits localStorage directly — the read path still
    // sanitizes so we don't trust raw storage values.
    localStorage.setItem("mardoc:image-folder:owner/repo", "../../../etc");
    expect(getImageUploadFolder("owner/repo")).toBe(DEFAULT_IMAGE_FOLDER);
  });

  it("setting an empty string clears the stored value", () => {
    setImageUploadFolder("owner/repo", "docs/images");
    setImageUploadFolder("owner/repo", "");
    // After clearing, we're back to the default.
    expect(getImageUploadFolder("owner/repo")).toBe(DEFAULT_IMAGE_FOLDER);
  });
});
