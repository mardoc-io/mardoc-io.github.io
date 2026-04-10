import { describe, it, expect } from "vitest";
import { buildSuggestionBody, pickSafeFence, parseSuggestionBody } from "@/lib/suggestion-body";

describe("pickSafeFence", () => {
  it("returns three backticks for content with no backticks", () => {
    expect(pickSafeFence("plain text")).toBe("```");
  });

  it("returns three backticks for content with one or two backticks", () => {
    expect(pickSafeFence("use `foo` here")).toBe("```");
    expect(pickSafeFence("use ``foo`` here")).toBe("```");
  });

  it("returns four backticks when content has a run of three", () => {
    expect(pickSafeFence("```json\n{}\n```")).toBe("````");
  });

  it("returns five backticks when content has a run of four", () => {
    expect(pickSafeFence("````escaped````")).toBe("`````");
  });

  it("handles non-adjacent runs independently and uses the longest", () => {
    expect(pickSafeFence("`` then later ```` end")).toBe("`````");
  });

  it("handles backticks at the start and end of content", () => {
    expect(pickSafeFence("```\nbody\n```")).toBe("````");
  });

  it("handles content with backticks on every line", () => {
    const content = "`a`\n`b`\n`c`";
    expect(pickSafeFence(content)).toBe("```");
  });

  it("handles very long runs of backticks", () => {
    const content = "`".repeat(10);
    expect(pickSafeFence(content)).toBe("`".repeat(11));
  });
});

describe("buildSuggestionBody", () => {
  it("uses a standard triple-backtick fence for plain content", () => {
    expect(buildSuggestionBody("# Heading")).toBe("```suggestion\n# Heading\n```");
  });

  it("uses a quadruple-backtick fence for content containing ```json blocks", () => {
    const content = "## This is another section\n\n```json\n{\n  \"what\": \"yes json code here\"\n}\n```";
    const result = buildSuggestionBody(content);

    // The outer fence must be longer than the inner one.
    expect(result.startsWith("````suggestion\n")).toBe(true);
    expect(result.endsWith("\n````")).toBe(true);
    // The inner json fence must survive verbatim.
    expect(result).toContain("```json\n");
    expect(result).toContain("\n```\n");
  });

  it("REGRESSION: the exact content from the bug report renders as a valid single suggestion", () => {
    // This is the exact shape that broke GitHub's parser and made the
    // suggestion unapplicable in the user's PR. The outer fence must not
    // collide with the inner one.
    const content = [
      "## This is another section",
      "",
      "```json",
      "{",
      "  \"what\": \"yes json code here\"",
      "}",
      "```",
    ].join("\n");
    const body = buildSuggestionBody(content);

    // Parse it the way GitHub would: find the first fence, find a
    // matching closer with the same length. Everything between must equal
    // the original content.
    const firstFenceMatch = body.match(/^(`{3,})suggestion\n/);
    expect(firstFenceMatch).not.toBeNull();
    const fence = firstFenceMatch![1];
    const openerLength = fence.length + "suggestion\n".length;

    // The closing fence must be exactly the same length, on its own line,
    // and must NOT appear anywhere within the content body.
    const inner = body.slice(openerLength, body.length - fence.length - 1);
    expect(inner).toBe(content);
    expect(body.endsWith(`\n${fence}`)).toBe(true);
  });

  it("round-trips content containing four backticks", () => {
    const content = "Escape four: ````not a code block````";
    const body = buildSuggestionBody(content);
    // Outer fence must be at least five to beat the inner four.
    expect(body.startsWith("`````suggestion\n")).toBe(true);
    expect(body.endsWith("\n`````")).toBe(true);
  });

  it("handles an empty suggestion body", () => {
    expect(buildSuggestionBody("")).toBe("```suggestion\n\n```");
  });

  it("handles single-line suggestions", () => {
    expect(buildSuggestionBody("replacement")).toBe("```suggestion\nreplacement\n```");
  });

  // ─── Round-trip parse: the fence actually closes where we expect ───────

  it("the opening and closing fences are the only three-or-more backtick runs at a line start", () => {
    const content = "foo\n```js\nconst x = 1;\n```\nbar";
    const body = buildSuggestionBody(content);

    // Split on lines and count which ones ARE a fence line (made only of
    // backticks). There should be exactly 2 in the outer fence, matching
    // the opener and closer — the inner ```js and ``` should NOT match
    // because their fence is shorter than the outer fence.
    const lines = body.split("\n");
    const outerFenceLength = body.match(/^(`+)suggestion/)![1].length;
    const outerFenceLines = lines.filter(
      (l) => l.length >= outerFenceLength && /^`+$/.test(l) && l.length === outerFenceLength
    );
    expect(outerFenceLines).toHaveLength(1); // closing fence only; opener has "suggestion"
  });
});

// ─── parseSuggestionBody ────────────────────────────────────────────────

describe("parseSuggestionBody", () => {
  it("extracts content from a standard triple-fence suggestion", () => {
    expect(parseSuggestionBody("```suggestion\nnew text\n```")).toBe("new text");
  });

  it("extracts content from a quadruple-fence suggestion with nested ```", () => {
    const body = "````suggestion\n## Title\n\n```json\n{}\n```\n````";
    expect(parseSuggestionBody(body)).toBe("## Title\n\n```json\n{}\n```");
  });

  it("extracts empty content", () => {
    expect(parseSuggestionBody("```suggestion\n\n```")).toBe("");
  });

  it("returns null for non-suggestion bodies", () => {
    expect(parseSuggestionBody("just a comment")).toBeNull();
    expect(parseSuggestionBody("```js\nconst x = 1;\n```")).toBeNull();
    expect(parseSuggestionBody("")).toBeNull();
  });

  it("returns null for a suggestion missing its closing fence", () => {
    expect(parseSuggestionBody("```suggestion\noops no closer")).toBeNull();
  });

  it("round-trips through buildSuggestionBody for plain content", () => {
    const inputs = ["a", "multi\nline", "with `backticks`", "# Heading\n\nBody"];
    for (const input of inputs) {
      const body = buildSuggestionBody(input);
      expect(parseSuggestionBody(body)).toBe(input);
    }
  });

  it("round-trips through buildSuggestionBody for content with nested fences", () => {
    const cases = [
      "```json\n{}\n```",
      "```\njust backticks\n```",
      "mixed ```js\ncode\n``` with prose",
      "````four````",
      "# Section\n\n```ts\nconst x: number = 1;\n```\n\nFootnote",
    ];
    for (const content of cases) {
      const body = buildSuggestionBody(content);
      expect(parseSuggestionBody(body)).toBe(content);
    }
  });

  it("REGRESSION: the user's exact bug content round-trips intact", () => {
    const content = [
      "## This is another section",
      "",
      "```json",
      "{",
      "  \"what\": \"yes json code here\"",
      "}",
      "```",
    ].join("\n");
    const body = buildSuggestionBody(content);
    expect(parseSuggestionBody(body)).toBe(content);
  });
});
