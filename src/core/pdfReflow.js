// Turns the text of a PDF (PDF.js getTextContent items) into HTML that flows to the screen width,
// like Polaris Office's PDF reflow mode. Items are grouped into lines by their baseline, lines into
// paragraphs by spacing, indentation and size, and larger lines become headings. Page numbers and
// running headers/footers repeated on most pages are dropped. Only text is kept: images, tables and
// multi-column order are not reconstructed, and scanned PDFs have no text at all.

const PAGE_NUMBER = /^\s*[-–—]?\s*(?:page\s*)?\d+\s*(?:\/\s*\d+)?\s*[-–—]?\s*$/i;
const LIST_START = /^\s*(?:[•●○■□◆◇▪‣∙·\-–*]|\(?\d{1,3}[.)]|\(?[a-zA-Z가-힣][.)]|[①-⑳])\s/;
const SENTENCE_END = /[.!?。．…"”'’):]$/;
const NO_SPACE_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function itemSize(item) {
  const [, , c = 0, d = 0] = item.transform || [];
  return Math.hypot(c, d) || Number(item.height) || 0;
}

// Text runs that share a baseline become one line, in content order.
function buildLines(items) {
  const lines = [];
  let line = null;
  for (const item of items) {
    const text = String(item.str ?? "");
    const [, , , , x = 0, y = 0] = item.transform || [];
    const size = itemSize(item);
    if (!text.trim()) {
      if (line && text) line.pendingSpace = true;
      if (line && item.hasEOL) line = null;
      continue;
    }
    if (!line || Math.abs(y - line.y) > Math.max(line.size, size) * 0.5) {
      line = { text: "", x, y, right: x, size, weights: new Map(), pendingSpace: false };
      lines.push(line);
    } else {
      const gap = x - line.right;
      if (line.pendingSpace || gap > Math.max(line.size, size) * 0.15) {
        if (!/\s$/.test(line.text) && !/^\s/.test(text)) line.text += " ";
      }
    }
    line.text += text;
    line.x = Math.min(line.x, x);
    line.right = Math.max(line.right, x + (Number(item.width) || 0));
    line.weights.set(size, (line.weights.get(size) || 0) + text.length);
    line.pendingSpace = false;
    if (item.hasEOL) line = null;
  }
  // A line's size is the font size most of its characters use.
  return lines.map(({ text, x, y, right, weights }) => ({
    text: text.replace(/\s+/g, " ").trim(), x, y, right,
    size: [...weights].reduce((best, entry) => (entry[1] > best[1] ? entry : best))[0]
  })).filter((entry) => entry.text);
}

function normalizedEdgeText(text) {
  return text.replace(/\d+/g, "#").replace(/\s+/g, " ").trim().toLowerCase();
}

// Lines at the very top or bottom of most pages (running titles, "page 3") are page furniture.
function repeatedEdges(pages) {
  const counts = new Map();
  for (const lines of pages) {
    const edges = new Set([lines[0], lines.at(-1)].filter(Boolean).map((line) => normalizedEdgeText(line.text)));
    for (const key of edges) counts.set(key, (counts.get(key) || 0) + 1);
  }
  const minimum = Math.max(3, Math.ceil(pages.length * 0.5));
  return new Set([...counts].filter(([, count]) => count >= minimum).map(([key]) => key));
}

// A page of one or two lines is all edge, so only bare page numbers are dropped from it.
function dropPageFurniture(lines, repeated) {
  return lines.filter((line, index) => {
    const edge = index === 0 || index === lines.length - 1;
    if (!edge || PAGE_NUMBER.test(line.text)) return !edge;
    return lines.length < 3 || !repeated.has(normalizedEdgeText(line.text));
  });
}

// The body size is the size used by the most characters.
function bodySize(pages) {
  const weights = new Map();
  for (const lines of pages) {
    for (const line of lines) {
      const key = Math.round(line.size * 2) / 2;
      weights.set(key, (weights.get(key) || 0) + line.text.length);
    }
  }
  let best = 0;
  let size = 0;
  for (const [key, weight] of weights) {
    if (weight > best) [best, size] = [weight, key];
  }
  return size || 10;
}

function joinLines(previous, next) {
  if (/[A-Za-z]-$/.test(previous) && /^[a-z]/.test(next)) return previous.slice(0, -1) + next;
  if (NO_SPACE_SCRIPT.test(previous.at(-1)) || NO_SPACE_SCRIPT.test(next[0])) return previous + next;
  return `${previous} ${next}`;
}

function buildBlocks(lines, body) {
  const left = Math.min(...lines.map((line) => line.x));
  const right = Math.max(...lines.map((line) => line.right));
  const blocks = [];
  let block = null;
  let previous = null;
  for (const line of lines) {
    const heading = line.size >= body * 1.2 && line.text.length <= 120;
    const startsNew = !block || !previous
      || heading !== block.heading
      || Math.abs(line.size - previous.size) > Math.max(previous.size, line.size) * 0.15
      || previous.y - line.y > Math.max(previous.size, line.size) * 1.9
      || line.y > previous.y + previous.size // moved up: a new column or text box
      || LIST_START.test(line.text)
      || (line.x > left + line.size * 0.9 && line.x > previous.x + line.size * 0.9)
      || (previous.right < right - previous.size * 4 && SENTENCE_END.test(previous.text));
    if (startsNew) {
      block = { heading, size: line.size, text: line.text };
      blocks.push(block);
    } else {
      block.text = joinLines(block.text, line.text);
    }
    previous = line;
  }
  return blocks;
}

function blockHtml(block, body) {
  const text = escapeHtml(block.text);
  if (!block.heading) return `<p>${text}</p>`;
  return block.size >= body * 1.6 ? `<h2>${text}</h2>` : `<h3>${text}</h3>`;
}

// pages: [{ items }] in page order (items from page.getTextContent()). Returns the HTML and the
// number of characters kept; zero means the PDF has no text layer (scanned).
export function reflowPdfPages(pages) {
  const pageLines = pages.map((page) => buildLines(page.items || []));
  const repeated = pages.length >= 3 ? repeatedEdges(pageLines) : new Set();
  const cleaned = pageLines.map((lines) => dropPageFurniture(lines, repeated));
  const body = bodySize(cleaned);
  let characters = 0;
  const html = cleaned.map((lines, index) => {
    characters += lines.reduce((sum, line) => sum + line.text.length, 0);
    const content = lines.length ? buildBlocks(lines, body).map((block) => blockHtml(block, body)).join("") : "";
    return `<section class="pdf-reflow-page" data-page="${index + 1}">${content}</section>`;
  }).join("");
  return { html: `<div class="pdf-reflow">${html}</div>`, characters };
}
