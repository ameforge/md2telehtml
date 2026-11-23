import assert from "node:assert/strict";
import {test} from "node:test";
import {toTelegramHtml} from "../src/index.js";

// Every part must fit and be valid HTML on its own, whatever the input.
const parts = (markdown, limit) => {
  const result = toTelegramHtml(markdown, limit ? {limit} : undefined);
  for (const part of result) {
    assert.ok(
      part.length <= (limit ?? 4096),
      `part over limit: ${part.length}`,
    );
    const open = [];
    for (const [, close, name] of part.matchAll(/<(\/?)(\w+)[^>]*>/g)) {
      if (!close) open.push(name);
      else assert.equal(open.pop(), name, `crossed tags in ${part}`);
    }
    assert.deepEqual(open, [], `unclosed tags in ${part}`);
    assert.doesNotMatch(
      part.replace(/<[^>]+>/g, ""),
      /[<>]|&(?!amp;|lt;|gt;|quot;)/,
    );
  }
  return result;
};

test("converts the Markdown Claude writes", () => {
  assert.deepEqual(
    parts(
      [
        "## **Plan**",
        "Use **bold**, *italic*, _also_, ~~gone~~ and `a < b`.",
        "- one",
        "* two",
        "See [docs](https://x.dev/Foo_(bar)?a=1&b=2).",
      ].join("\n"),
    ),
    [
      [
        "<b>Plan</b>",
        "Use <b>bold</b>, <i>italic</i>, <i>also</i>, <s>gone</s> and <code>a &lt; b</code>.",
        "- one",
        "- two",
        'See <a href="https://x.dev/Foo_(bar)?a=1&amp;b=2">docs</a>.',
      ].join("\n"),
    ],
  );
});

test("puts code blocks and tables in pre, escaped", () => {
  assert.deepEqual(
    parts(
      "Run:\n\n```js\nif (a < b && c) {}\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |",
    ),
    [
      'Run:\n\n<pre><code class="language-js">if (a &lt; b &amp;&amp; c) {}</code></pre>\n\n<pre>| a | b |\n|---|---|\n| 1 | 2 |</pre>',
    ],
  );
});

test("keeps text that looks like its own placeholders", () => {
  assert.deepEqual(parts("E000 0 `x`"), ["E000 0 <code>x</code>"]);
});

test("leaves unmatched or masked markers as text", () => {
  for (const markdown of [
    "**password: [masked]",
    "`token=[masked]",
    "snake_case_name and file_name.txt",
    "2 * 3 * 4",
    "**a _b** c_",
    "an unclosed fence\n```\ncode < here",
  ]) {
    const [html] = parts(markdown);
    assert.doesNotMatch(html, /<(b|i|code)>/, markdown);
  }
});

test("splits long text at paragraphs, then lines, then sentences", () => {
  const sentence = `${"word ".repeat(30).trim()}.`;
  const paragraph = Array(10).fill(sentence).join(" ");
  const result = parts(Array(8).fill(paragraph).join("\n\n"), 1000);
  assert.ok(result.length > 1);
  for (const part of result) assert.match(part, /\.$/);
  assert.equal(
    result.join(" ").replace(/\s+/g, " "),
    Array(80).fill(sentence).join(" "),
  );
});

test("splits a long code block at lines and reopens pre in each part", () => {
  const lines = Array.from({length: 300}, (_, i) => `line ${i} <x>`);
  const result = parts(`\`\`\`py\n${lines.join("\n")}\n\`\`\``, 1000);
  assert.ok(result.length > 1);
  for (const part of result) {
    assert.match(part, /^<pre><code class="language-py">line \d+ &lt;x&gt;/);
    assert.match(part, /line \d+ &lt;x&gt;<\/code><\/pre>$/);
  }
});

test("cuts a sentence or code line longer than a message", () => {
  assert.ok(parts(`${"a&b ".repeat(400)}`, 500).length > 1);
  assert.ok(parts(`\`\`\`\n${"<".repeat(2000)}\n\`\`\``, 500).length > 1);
});

test("returns nothing for empty input", () => {
  assert.deepEqual(parts(""), []);
  assert.deepEqual(parts(undefined), []);
  assert.deepEqual(parts("```\n```"), []);
});
