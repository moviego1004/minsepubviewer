function id(prefix) {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createMarkdownAnnotationState(input = {}) {
  const documents = input && typeof input.documents === "object" && input.documents ? input.documents : {};
  return { version: 1, documents };
}

export function parseMarkdownAnnotationState(serialized) {
  try {
    return createMarkdownAnnotationState(JSON.parse(serialized || "{}"));
  } catch {
    return createMarkdownAnnotationState();
  }
}

export function getMarkdownDocumentAnnotations(state, key) {
  const document = state.documents?.[key] || {};
  return {
    bookmarks: Array.isArray(document.bookmarks) ? document.bookmarks : [],
    highlights: Array.isArray(document.highlights) ? document.highlights : []
  };
}

export function lineRangeFromSource(content, quote, occurrence = 0) {
  const source = String(content || "");
  const selected = String(quote || "");
  if (!selected) return null;
  let index = -1;
  let cursor = 0;
  for (let count = 0; count <= occurrence; count += 1) {
    index = source.indexOf(selected, cursor);
    if (index < 0) return null;
    cursor = index + selected.length;
  }
  const startLine = source.slice(0, index).split("\n").length;
  const endLine = startLine + selected.split("\n").length - 1;
  return { startLine, endLine, startOffset: index, endOffset: index + selected.length };
}

export function createMarkdownBookmark(line, label = "") {
  const safeLine = Math.max(1, Math.trunc(Number(line) || 1));
  return { id: id("md-bookmark"), line: safeLine, label: label || `${safeLine}번 줄`, createdAt: new Date().toISOString() };
}

export function createMarkdownHighlight(input) {
  return {
    id: id("md-highlight"),
    startLine: Math.max(1, Math.trunc(Number(input.startLine) || 1)),
    endLine: Math.max(1, Math.trunc(Number(input.endLine) || Number(input.startLine) || 1)),
    quote: String(input.quote || ""),
    occurrence: Math.max(0, Math.trunc(Number(input.occurrence) || 0)),
    color: ["yellow", "orange", "underline"].includes(input.color) ? input.color : "yellow",
    createdAt: new Date().toISOString()
  };
}

export function updateMarkdownDocumentAnnotations(state, key, annotations) {
  return {
    ...state,
    documents: { ...state.documents, [key]: getMarkdownDocumentAnnotations({ documents: { [key]: annotations } }, key) }
  };
}
