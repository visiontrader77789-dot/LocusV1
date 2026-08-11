import { describe, expect, it } from "vitest";
import { newBlock } from "@/lib/core/types";
import type { InlineSpan } from "@/lib/core/rich";
import {
  concatBlocks,
  isTodoPrefix,
  matchBareMarker,
  matchDeferredBullet,
  matchMarkdown,
  mergeSpans,
  normalizeSpans,
  richHtml,
} from "@/lib/core/rich";

describe("matchMarkdown", () => {
  it("converts completed markers", () => {
    expect(matchMarkdown("# ")).toEqual({ type: "heading1", content: "" });
    expect(matchMarkdown("## ")).toEqual({ type: "heading2", content: "" });
    expect(matchMarkdown("### ")).toEqual({ type: "heading3", content: "" });
    expect(matchMarkdown("> ")).toEqual({ type: "quote", content: "" });
    expect(matchMarkdown("1. ")).toEqual({ type: "numberedList", content: "" });
    expect(matchMarkdown("10. ")).toEqual({ type: "numberedList", content: "" });
    expect(matchMarkdown("```")).toEqual({ type: "code", content: "" });
  });

  it("converts checklist markers to todoList", () => {
    expect(matchMarkdown("- [ ] ")).toEqual({ type: "todoList", checked: false, content: "" });
    expect(matchMarkdown("- [x] ")).toEqual({ type: "todoList", checked: true, content: "" });
  });

  it("ignores unfinished or extended content", () => {
    expect(matchMarkdown("#")).toBeNull();
    expect(matchMarkdown("# x")).toBeNull();
    expect(matchMarkdown("> hi")).toBeNull();
    expect(matchMarkdown("1")).toBeNull();
    expect(matchMarkdown("1.5 ")).toBeNull();
    expect(matchMarkdown("- ")).toBeNull();
    expect(matchMarkdown("- [ ]")).toBeNull();
    expect(matchMarkdown("```x")).toBeNull();
  });
});

describe("matchDeferredBullet", () => {
  it("defers until a non-checkbox character follows '- '", () => {
    expect(matchDeferredBullet("- ")).toBeNull();
    expect(matchDeferredBullet("- [")).toBeNull();
    expect(matchDeferredBullet("- [ ] ")).toBeNull();
    expect(matchDeferredBullet("- [x")).toBeNull();
    expect(matchDeferredBullet("- item")).toEqual({ type: "bulletList", content: "item" });
    expect(matchDeferredBullet("- a")).toEqual({ type: "bulletList", content: "a" });
  });
});

describe("isTodoPrefix", () => {
  it("recognises partial checklist markers", () => {
    expect(isTodoPrefix("-")).toBe(true);
    expect(isTodoPrefix("- [")).toBe(true);
    expect(isTodoPrefix("- [ ]")).toBe(true);
    expect(isTodoPrefix("- [x")).toBe(true);
    expect(isTodoPrefix("- [x]")).toBe(true);
    expect(isTodoPrefix("- hi")).toBe(false);
    expect(isTodoPrefix("")).toBe(false);
  });
});

describe("matchBareMarker", () => {
  it("converts a bare '- ' and '```' on blur/enter", () => {
    expect(matchBareMarker("- ")).toEqual({ type: "bulletList", content: "" });
    expect(matchBareMarker("```")).toEqual({ type: "code", content: "" });
    expect(matchBareMarker("# ")).toBeNull();
    expect(matchBareMarker("- item")).toBeNull();
  });
});

describe("normalizeSpans", () => {
  it("clamps to content length and drops empty spans", () => {
    const spans: InlineSpan[] = [{ from: 2, to: 10, bold: true }, { from: 4, to: 4, italic: true }];
    expect(normalizeSpans(spans, 5)).toEqual([{ from: 2, to: 5, bold: true }]);
  });

  it("merges adjacent spans with identical marks", () => {
    const spans: InlineSpan[] = [
      { from: 0, to: 3, bold: true },
      { from: 3, to: 6, bold: true },
    ];
    expect(normalizeSpans(spans, 6)).toEqual([{ from: 0, to: 6, bold: true }]);
  });

  it("keeps distinct marks separate", () => {
    const spans: InlineSpan[] = [
      { from: 0, to: 2, bold: true },
      { from: 2, to: 4, italic: true },
    ];
    expect(normalizeSpans(spans, 4)).toEqual([
      { from: 0, to: 2, bold: true },
      { from: 2, to: 4, italic: true },
    ]);
  });
});

describe("mergeSpans", () => {
  it("merges overlapping identical spans", () => {
    const spans: InlineSpan[] = [
      { from: 0, to: 5, bold: true },
      { from: 3, to: 8, bold: true },
    ];
    expect(mergeSpans(spans)).toEqual([{ from: 0, to: 8, bold: true }]);
  });
});

describe("concatBlocks", () => {
  it("concatenates text and shifts the second block's spans", () => {
    const a = newBlock("p1", "paragraph", "Hello");
    a.rich = [{ from: 0, to: 5, bold: true }];
    const b = newBlock("p1", "paragraph", " world");
    b.rich = [{ from: 1, to: 6, italic: true }];
    const merged = concatBlocks(a, b);
    expect(merged.content).toBe("Hello world");
    expect(merged.rich).toEqual([
      { from: 0, to: 5, bold: true },
      { from: 6, to: 11, italic: true },
    ]);
  });
});

describe("richHtml", () => {
  it("escapes plain text", () => {
    expect(richHtml("a < b & c > d", [], false)).toBe("a &lt; b &amp; c &gt; d");
  });

  it("renders inline marks", () => {
    const html = richHtml("Hello", [{ from: 0, to: 2, bold: true }], false);
    expect(html).toBe('<b>He</b>llo');
  });

  it("wraps wiki links as chips when chips is on", () => {
    const html = richHtml("see [[Home]] now", [], true);
    expect(html).toContain('class="link-chip"');
    expect(html).toContain('data-link="Home"');
  });

  it("keeps wiki links as plain text when chips is off", () => {
    expect(richHtml("see [[Home]] now", [], false)).toBe("see [[Home]] now");
  });

  it("does not chip wiki links covered by a rich link span", () => {
    const html = richHtml("[[Home]]", [{ from: 0, to: 8, link: "https://example.com" }], true);
    expect(html).toContain('data-external="true"');
    expect(html).not.toContain("link-chip");
  });

  it("renders highlight marks as <mark>", () => {
    const html = richHtml("Hello world", [
      { from: 0, to: 5, highlight: "yellow" },
      { from: 6, to: 11, highlight: "blue" },
    ]);
    expect(html).toContain('<mark class="hl-yellow">Hello</mark>');
    expect(html).toContain('<mark class="hl-blue">world</mark>');
  });

  it("renders inline math as KaTeX when chips are on", () => {
    const html = richHtml("E = $mc^2$!", [], true);
    expect(html).toContain('class="math-inline"');
    expect(html).toContain('data-math="mc^2"');
    expect(html).not.toContain("$mc^2$");
  });

  it("keeps inline math as plain text when chips are off", () => {
    expect(richHtml("E = $mc^2$!", [], false)).toBe("E = $mc^2$!");
  });
});
