# md2telehtml

Convert the Markdown an LLM writes into Telegram HTML, split into messages that fit.

```js
import {toTelegramHtml} from "md2telehtml";

for (const text of toTelegramHtml(answer)) {
  await bot.api.sendMessage(chatId, text, {parse_mode: "HTML"});
}
```

`toTelegramHtml(markdown, {limit = 4096})` returns an array of strings. Each one is valid Telegram HTML of at most `limit` characters, and an empty input gives an empty array.

## What it converts

| Markdown | Telegram |
| --- | --- |
| `**bold**`, `__bold__` | `<b>` |
| `*italic*`, `_italic_` | `<i>` |
| `~~strike~~` | `<s>` |
| `` `code` `` | `<code>` |
| fenced code block | `<pre>`, with `language-x` when given |
| table | `<pre>`, so the columns stay aligned |
| `# Heading` | a bold line |
| `[text](url)` | `<a>` |
| `-`, `*` or `+` list item | a line starting with `-` |

Everything else stays as escaped text. A marker without its pair, such as `**password: [masked]`, stays as it is, so the output never has an unclosed tag.

## How it splits

Parts break between paragraphs first, then between lines, then between sentences, and never in the middle of a sentence or a code block. A code block longer than one message breaks at a line, and each part closes and reopens its `<pre>`. Only a single sentence or code line longer than one message is cut inside, at a word or a character.

## License

MIT
