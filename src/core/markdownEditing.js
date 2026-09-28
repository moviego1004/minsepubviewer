export const LARGE_MARKDOWN_CHARACTER_THRESHOLD = 100_000;
export const LARGE_MARKDOWN_LINE_THRESHOLD = 2_000;

export function shouldUsePlainTextMarkdownEditor(
  content,
  {
    characterThreshold = LARGE_MARKDOWN_CHARACTER_THRESHOLD,
    lineThreshold = LARGE_MARKDOWN_LINE_THRESHOLD
  } = {}
) {
  const source = typeof content === "string" ? content : "";

  if (source.length >= characterThreshold) {
    return true;
  }

  let lines = 1;
  for (let index = 0; index < source.length; index += 1) {
    if (source.charCodeAt(index) === 10 && ++lines >= lineThreshold) {
      return true;
    }
  }

  return false;
}

export function getTextOffsetFromMarkdownPosition(content, position) {
  const source = typeof content === "string" ? content : "";
  if (!Array.isArray(position)) return source.length;

  const targetLine = Math.max(1, Math.floor(Number(position[0]) || 1));
  const targetColumn = Math.max(1, Math.floor(Number(position[1]) || 1));
  let line = 1;
  let lineStart = 0;

  while (line < targetLine) {
    const newline = source.indexOf("\n", lineStart);
    if (newline < 0) return source.length;
    lineStart = newline + 1;
    line += 1;
  }

  const newline = source.indexOf("\n", lineStart);
  const lineEnd = newline < 0 ? source.length : newline;
  return Math.min(lineEnd, lineStart + targetColumn - 1);
}

export function insertTextAtMarkdownSelection(content, insertedText, startPosition, endPosition = startPosition) {
  const source = typeof content === "string" ? content : "";
  const text = typeof insertedText === "string" ? insertedText : "";
  const firstOffset = getTextOffsetFromMarkdownPosition(source, startPosition);
  const secondOffset = getTextOffsetFromMarkdownPosition(source, endPosition);
  const start = Math.min(firstOffset, secondOffset);
  const end = Math.max(firstOffset, secondOffset);
  const nextContent = `${source.slice(0, start)}${text}${source.slice(end)}`;
  const selection = start + text.length;

  return {
    content: nextContent,
    selectionStart: selection,
    selectionEnd: selection
  };
}

function normalizeTextSelection(content, selectionStart, selectionEnd) {
  const source = typeof content === "string" ? content : "";
  const first = Math.min(Math.max(0, Number(selectionStart) || 0), source.length);
  const second = Math.min(Math.max(0, Number(selectionEnd) || 0), source.length);

  return {
    source,
    start: Math.min(first, second),
    end: Math.max(first, second)
  };
}

export function wrapMarkdownTextSelection(
  content,
  selectionStart,
  selectionEnd,
  { before = "", after = before, placeholder = "텍스트" } = {}
) {
  const { source, start, end } = normalizeTextSelection(content, selectionStart, selectionEnd);
  const selected = source.slice(start, end) || placeholder;
  const replacement = `${before}${selected}${after}`;
  const contentAfter = `${source.slice(0, start)}${replacement}${source.slice(end)}`;
  const selectedStart = start + before.length;

  return {
    content: contentAfter,
    selectionStart: selectedStart,
    selectionEnd: selectedStart + selected.length
  };
}

export function prefixMarkdownSelectedLines(
  content,
  selectionStart,
  selectionEnd,
  prefix,
  { stripPattern = null } = {}
) {
  const { source, start, end } = normalizeTextSelection(content, selectionStart, selectionEnd);
  const lineStart = source.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const nextNewline = source.indexOf("\n", end);
  const lineEnd = nextNewline < 0 ? source.length : nextNewline;
  const lines = source.slice(lineStart, lineEnd).split("\n");
  const transformed = lines.map((line, index) => {
    const base = stripPattern ? line.replace(stripPattern, "") : line;
    const linePrefix = typeof prefix === "function" ? prefix(index, base) : prefix;
    return `${linePrefix}${base}`;
  }).join("\n");

  return {
    content: `${source.slice(0, lineStart)}${transformed}${source.slice(lineEnd)}`,
    selectionStart: lineStart,
    selectionEnd: lineStart + transformed.length
  };
}

export function findEmbeddedMarkdownImages(content, limit = 24) {
  const source = typeof content === "string" ? content : "";
  const images = [];
  const markdownPattern = /!\[([^\]]*)\]\((data:image\/[a-z0-9.+-]+;base64,[^)\s]+)\)/giu;
  const htmlPattern = /<img\b[^>]*\bsrc=["'](data:image\/[a-z0-9.+-]+;base64,[^"']+)["'][^>]*>/giu;

  for (const match of source.matchAll(markdownPattern)) {
    images.push({ alt: match[1] || "삽입 이미지", src: match[2] });
    if (images.length >= limit) return images;
  }

  for (const match of source.matchAll(htmlPattern)) {
    const alt = match[0].match(/\balt=["']([^"']*)["']/iu)?.[1] || "삽입 이미지";
    images.push({ alt, src: match[1] });
    if (images.length >= limit) break;
  }

  return images;
}
