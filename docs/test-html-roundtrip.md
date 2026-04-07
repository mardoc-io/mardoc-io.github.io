# HTML in Markdown — Round-Trip Test Document

This file contains every HTML element type that MarDoc should preserve through the edit/save cycle. Open it in MarDoc, make a small edit, and verify the HTML survives.

---

## Standard Markdown (baseline)

**Bold text**, _italic text_, ~~strikethrough text~~, `inline code`.

> A blockquote with **bold** inside.

- Unordered item 1
- Unordered item 2

1. Ordered item 1
2. Ordered item 2

- [x] Completed task
- [ ] Incomplete task

| Column A | Column B | Column C |
|----------|----------|----------|
| Value 1  | Value 2  | Value 3  |

[A link](https://example.com) and ![an image](https://via.placeholder.com/100x30?text=image)

```javascript
const greeting = "Hello, world!";
console.log(greeting);
```

---

## Details / Summary

<details>
<summary>Click to expand this section</summary>

This content is hidden until the user clicks the summary. It should survive the round-trip intact, including the `<details>` and `<summary>` tags.

- Nested list inside details
- With multiple items

</details>

<details>
<summary>Another collapsible section</summary>

With a code block inside:

```python
def hello():
    print("Hello from inside details!")
```

</details>

---

## Div with Attributes

<div class="warning">

**Warning:** This div has a `class` attribute that should be preserved.

</div>

<div style="border-left: 3px solid orange; padding-left: 12px;">

This div has inline styles for a callout effect.

</div>

<div id="important-section">

This div has an `id` attribute for anchor linking.

</div>

---

## Span with Attributes

Regular text with <span style="color: red;">red text</span> and <span style="background-color: yellow;">highlighted text</span> inline.

---

## Superscript and Subscript

Einstein's equation: E = mc<sup>2</sup>

Water molecule: H<sub>2</sub>O

Footnote reference<sup>[1]</sup>

---

## Keyboard Input

Press <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd> to open the command palette.

Use <kbd>Cmd</kbd> + <kbd>S</kbd> to save.

---

## Abbreviations

The <abbr title="World Health Organization">WHO</abbr> was founded in 1948.

Use <abbr title="HyperText Markup Language">HTML</abbr> and <abbr title="Cascading Style Sheets">CSS</abbr> for styling.

---

## Mark (Highlight)

This sentence has <mark>highlighted text</mark> that should be preserved.

Search results: The <mark>query term</mark> appears in this paragraph.

---

## Media Elements

<video src="demo.mp4" controls width="400">
Your browser does not support video.
</video>

<audio src="podcast.mp3" controls>
Your browser does not support audio.
</audio>

---

## Definition Lists

<dl>
<dt>MarDoc</dt>
<dd>A browser-based markdown editor with GitHub PR review integration.</dd>

<dt>Turndown</dt>
<dd>A library that converts HTML to markdown.</dd>

<dt>Showdown</dt>
<dd>A library that converts markdown to HTML.</dd>
</dl>

---

## Picture Element (Dark/Light Mode Images)

<picture>
<source media="(prefers-color-scheme: dark)" srcset="https://via.placeholder.com/200x50/333/fff?text=Dark+Mode">
<img src="https://via.placeholder.com/200x50/fff/333?text=Light+Mode" alt="Theme-aware image">
</picture>

---

## Nested Div Structure

<div class="outer" style="border: 1px solid gray; padding: 8px;">
<div class="inner" style="background: #f0f0f0; padding: 8px;">

Nested content inside two divs with attributes.

</div>
</div>

---

## Still Broken (Known Limitations)

### HTML Comments

<!-- This comment will be stripped by Showdown before Turndown sees it -->

If you see nothing between "HTML Comments" and this paragraph, the comment was stripped (expected).

### Table with colspan

<table>
<tr><td colspan="2">This spans two columns</td></tr>
<tr><td>A</td><td>B</td></tr>
</table>

The `colspan` attribute will be lost — Turndown converts HTML tables to markdown tables.
