// A private use character marks set-aside HTML; input never keeps one.
const MARK = String.fromCharCode(0xe000);
const MARKS = new RegExp(MARK, "g");
const KEPT = new RegExp(`${MARK}(\\d+)${MARK}`, "g");

const escapeHtml = (text) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const FENCE = /^\s*(`{3,}|~{3,})\s*([\w+#.-]*)/;
const TABLE = /^\s*\|.*\|\s*$/;
const HEADING = /^\s{0,3}#{1,6}\s+(.*?)[\s#]*$/;
const BULLET = /^(\s*)[-*+]\s+(.*)$/;
const SENTENCE_END = /(?<=[.!?…])\s+/;

const isBalanced = (html) => {
  const open = [];
  for (const [, close, name] of html.matchAll(/<(\/?)(\w+)[^>]*>/g)) {
    if (!close) open.push(name);
    else if (open.pop() !== name) return false;
  }
  return open.length === 0;
};

// Code spans and links are set aside first, so emphasis cannot reach into them.
const inline = (line) => {
  const kept = [];
  const keep = (html) => `${MARK}${kept.push(html) - 1}${MARK}`;
  const text = escapeHtml(
    line
      .replace(/(`+)(.+?)\1/g, (_, _ticks, code) =>
        keep(`<code>${escapeHtml(code)}</code>`),
      )
      .replace(
        /\[([^\]\n]+)\]\(((?:[^\s()]|\([^\s()]*\))+)\)/g,
        (_, label, url) =>
          keep(
            `<a href="${escapeHtml(url).replace(/"/g, "&quot;")}">${escapeHtml(label)}</a>`,
          ),
      ),
  );
  const restore = (html) => html.replace(KEPT, (_, i) => kept[Number(i)]);
  const styled = text
    .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, "<b>$1</b>")
    .replace(/(?<!\w)__(?=\S)(.+?)(?<=\S)__(?!\w)/g, "<b>$1</b>")
    .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, "<s>$1</s>")
    .replace(
      /(?<![*\w])\*(?=[^\s*])([^*]+?)(?<=[^\s*])\*(?![*\w])/g,
      "<i>$1</i>",
    )
    .replace(/(?<!\w)_(?=[^\s_])([^_]+?)(?<=[^\s_])_(?!\w)/g, "<i>$1</i>");
  // Crossed markers such as **a _b** c_ would nest wrongly; drop emphasis then.
  return restore(isBalanced(styled) ? styled : text);
};

const renderLine = (line) => {
  const heading = line.match(HEADING);
  if (heading) return `<b>${inline(heading[1].replace(/\*\*/g, ""))}</b>`;
  const bullet = line.match(BULLET);
  if (bullet) return `${bullet[1]}- ${inline(bullet[2])}`;
  return inline(line);
};

const parse = (markdown) => {
  const lines = markdown.split("\n");
  const blocks = [];
  let paragraph;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(FENCE);
    if (fence) {
      paragraph = undefined;
      const body = [];
      const closer = new RegExp(
        `^\\s*${fence[1][0]}{${fence[1].length},}\\s*$`,
      );
      while (++i < lines.length && !closer.test(lines[i])) body.push(lines[i]);
      blocks.push({kind: "code", lang: fence[2], lines: body});
    } else if (TABLE.test(line)) {
      paragraph = undefined;
      const body = [line];
      while (i + 1 < lines.length && TABLE.test(lines[i + 1])) {
        body.push(lines[++i]);
      }
      blocks.push({kind: "code", lang: "", lines: body});
    } else if (line.trim() === "") {
      paragraph = undefined;
    } else if (paragraph) {
      paragraph.lines.push(line);
    } else {
      paragraph = {kind: "text", lines: [line]};
      blocks.push(paragraph);
    }
  }
  return blocks;
};

// Escaped chunks of at most room characters, never splitting an entity or a
// surrogate pair.
const cutEscaped = (raw, room) => {
  const chunks = [];
  let chunk = "";
  for (const char of raw) {
    const html = escapeHtml(char);
    if (chunk && chunk.length + html.length > room) {
      chunks.push(chunk);
      chunk = "";
    }
    chunk += html;
  }
  if (chunk) chunks.push(chunk);
  return chunks;
};

const codePieces = ({lang, lines}, limit) => {
  if (lines.join("").trim() === "") return [];
  const open = lang
    ? `<pre><code class="language-${escapeHtml(lang)}">`
    : "<pre>";
  const close = lang ? "</code></pre>" : "</pre>";
  const room = limit - open.length - close.length;
  const pieces = [];
  let body = [];
  const flush = () => {
    if (body.length) {
      pieces.push({html: `${open}${body.join("\n")}${close}`, sep: "\n"});
    }
    body = [];
  };
  for (const line of lines) {
    for (const html of line === "" ? [""] : cutEscaped(line, room)) {
      if (body.length && [...body, html].join("\n").length > room) flush();
      body.push(html);
    }
  }
  flush();
  return pieces;
};

// shortcut: a sentence longer than a message loses its emphasis and links,
// upgrade if Claude ever writes such sentences on purpose.
const wordPieces = (sentence, limit) =>
  sentence
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((word) => cutEscaped(word, limit))
    .map((html) => ({html, sep: " "}));

const textPieces = ({lines}, limit) => {
  const rendered = lines.map(renderLine);
  const whole = rendered.join("\n");
  if (whole.length <= limit) return [{html: whole, sep: "\n"}];
  return lines.flatMap((line, i) => {
    if (rendered[i].length <= limit) return [{html: rendered[i], sep: "\n"}];
    const pieces = line.split(SENTENCE_END).flatMap((sentence, j) => {
      const html = j === 0 ? renderLine(sentence) : inline(sentence);
      return html.length <= limit
        ? [{html, sep: " "}]
        : wordPieces(sentence, limit);
    });
    return [{...pieces[0], sep: "\n"}, ...pieces.slice(1)];
  });
};

const pack = (pieces, limit) => {
  const parts = [];
  let part = "";
  for (const {html, sep} of pieces) {
    if (part && part.length + sep.length + html.length <= limit) {
      part += sep + html;
    } else {
      if (part) parts.push(part);
      part = html;
    }
  }
  if (part) parts.push(part);
  return parts;
};

export const toTelegramHtml = (markdown, {limit = 4096} = {}) => {
  if (!(limit >= 100)) throw new RangeError("limit must be at least 100");
  const text = String(markdown ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(MARKS, "");
  return pack(
    parse(text).flatMap((block, i) => {
      const own =
        block.kind === "code"
          ? codePieces(block, limit)
          : textPieces(block, limit);
      return own.map((piece, j) =>
        j === 0 && i > 0 ? {...piece, sep: "\n\n"} : piece,
      );
    }),
    limit,
  );
};
