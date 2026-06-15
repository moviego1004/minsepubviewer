const SKIP_TAGS = new Set(["script", "style", "svg", "math", "nav"]);
const BLOCK_TAGS = new Set([
  "article",
  "aside",
  "body",
  "div",
  "figure",
  "footer",
  "header",
  "main",
  "section"
]);

function collapseInlineWhitespace(text) {
  return String(text || "").replace(/\s+/g, " ");
}

export function normalizeMarkdown(text) {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function createMarkdownFileName(bookTitle) {
  const base = String(bookTitle || "book")
    .replace(/[^\p{L}\p{N}-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "book";

  return `${base}.md`;
}

function getElementChildrenMarkdown(node, context = {}) {
  return Array.from(node?.childNodes || [])
    .map((child) => nodeToMarkdown(child, context))
    .join("");
}

function getInlineMarkdown(node, context = {}) {
  return normalizeMarkdown(getElementChildrenMarkdown(node, context)).replace(/\n+/g, " ");
}

function listItemToMarkdown(node, context = {}) {
  const marker = context.listType === "ol"
    ? `${context.listIndex || 1}.`
    : "-";
  const body = normalizeMarkdown(getElementChildrenMarkdown(node, context))
    .split("\n")
    .map((line, index) => index === 0 ? line : `  ${line}`)
    .join("\n");

  return body ? `${marker} ${body}\n` : "";
}

function nodeToMarkdown(node, context = {}) {
  if (!node) {
    return "";
  }

  if (node.nodeType === 3) {
    return collapseInlineWhitespace(node.textContent);
  }

  if (node.nodeType !== 1) {
    return "";
  }

  const tag = String(node.tagName || node.nodeName || "").toLowerCase();

  if (SKIP_TAGS.has(tag)) {
    return "";
  }

  if (/^h[1-6]$/.test(tag)) {
    const level = Number(tag.slice(1));
    const text = getInlineMarkdown(node, context);
    return text ? `\n\n${"#".repeat(level)} ${text}\n\n` : "";
  }

  if (tag === "p") {
    const text = getInlineMarkdown(node, context);
    return text ? `\n\n${text}\n\n` : "";
  }

  if (tag === "br") {
    return "\n";
  }

  if (tag === "strong" || tag === "b") {
    const text = getInlineMarkdown(node, context);
    return text ? `**${text}**` : "";
  }

  if (tag === "em" || tag === "i") {
    const text = getInlineMarkdown(node, context);
    return text ? `*${text}*` : "";
  }

  if (tag === "code") {
    const text = collapseInlineWhitespace(node.textContent).trim();
    return text ? `\`${text.replace(/`/g, "\\`")}\`` : "";
  }

  if (tag === "pre") {
    const text = String(node.textContent || "").replace(/\n+$/g, "");
    return text ? `\n\n\`\`\`\n${text}\n\`\`\`\n\n` : "";
  }

  if (tag === "a") {
    const text = getInlineMarkdown(node, context);
    const href = node.getAttribute?.("href");
    return text && href ? `[${text}](${href})` : text;
  }

  if (tag === "img") {
    const alt = collapseInlineWhitespace(node.getAttribute?.("alt") || "").trim();
    const src = node.getAttribute?.("src") || "";
    return alt || src ? `![${alt}](${src})` : "";
  }

  if (tag === "blockquote") {
    const text = normalizeMarkdown(getElementChildrenMarkdown(node, context));
    return text
      ? `\n\n${text.split("\n").map((line) => `> ${line}`).join("\n")}\n\n`
      : "";
  }

  if (tag === "ul" || tag === "ol") {
    const items = Array.from(node.children || []).filter((child) => (
      String(child.tagName || "").toLowerCase() === "li"
    ));
    const text = items.map((item, index) => listItemToMarkdown(item, {
      ...context,
      listType: tag,
      listIndex: index + 1
    })).join("");
    return text ? `\n\n${text}\n` : "";
  }

  if (tag === "li") {
    return listItemToMarkdown(node, context);
  }

  if (tag === "tr") {
    const cells = Array.from(node.children || []).filter((child) => (
      ["td", "th"].includes(String(child.tagName || "").toLowerCase())
    ));
    return cells.length
      ? `| ${cells.map((cell) => getInlineMarkdown(cell, context)).join(" | ")} |\n`
      : "";
  }

  if (tag === "table") {
    const rows = Array.from(node.querySelectorAll?.("tr") || []);
    const text = rows.map((row) => nodeToMarkdown(row, context)).join("");
    return text ? `\n\n${text}\n` : "";
  }

  const text = getElementChildrenMarkdown(node, context);
  return BLOCK_TAGS.has(tag) ? `\n\n${text}\n\n` : text;
}

export function documentToMarkdown(document, options = {}) {
  const root = document?.body || document?.documentElement;
  const title = normalizeMarkdown(options.title || "");
  const body = normalizeMarkdown(nodeToMarkdown(root, {}));

  if (!title) {
    return body;
  }

  return normalizeMarkdown(`## ${title}\n\n${body}`);
}

export function createMarkdownDocument({ title, sections = [] } = {}) {
  const heading = normalizeMarkdown(title || "");
  const body = sections.map(normalizeMarkdown).filter(Boolean).join("\n\n---\n\n");

  return normalizeMarkdown(`${heading ? `# ${heading}\n\n` : ""}${body}\n`);
}
