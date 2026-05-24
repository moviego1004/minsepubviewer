function requireNonEmptyString(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${name} is required`);
  }

  return value.trim();
}

function createId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `ann-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const HIGHLIGHT_STYLES = new Set(["yellow", "orange", "green", "pink", "blue", "underline"]);

function createBaseAnnotation(type, input) {
  return {
    id: input.id || createId(),
    type,
    bookId: requireNonEmptyString(input.bookId, "bookId"),
    location: requireNonEmptyString(input.location, "location"),
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: input.updatedAt || null
  };
}

export function createBookmark(input) {
  return {
    ...createBaseAnnotation("bookmark", input),
    label: typeof input.label === "string" ? input.label.trim() : ""
  };
}

export function createHighlight(input) {
  const color = typeof input.color === "string" && input.color.trim()
    ? input.color.trim()
    : "yellow";

  return {
    ...createBaseAnnotation("highlight", input),
    range: requireNonEmptyString(input.range, "range"),
    quote: requireNonEmptyString(input.quote, "quote"),
    color: HIGHLIGHT_STYLES.has(color) ? color : "yellow"
  };
}

export function createTextNote(input) {
  return {
    ...createBaseAnnotation("note", input),
    range: requireNonEmptyString(input.range, "range"),
    quote: typeof input.quote === "string" ? input.quote.trim() : "",
    body: requireNonEmptyString(input.body, "body")
  };
}

export function updateTextNoteBody(note, body) {
  if (!note || note.type !== "note") {
    throw new TypeError("note is required");
  }

  return {
    ...note,
    body: requireNonEmptyString(body, "body"),
    updatedAt: new Date().toISOString()
  };
}

export function createAnnotationExport(book) {
  if (!book || typeof book !== "object") {
    throw new TypeError("book is required");
  }

  const highlights = Array.isArray(book.highlights) ? book.highlights : [];
  const notes = Array.isArray(book.notes) ? book.notes : [];

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    book: {
      bookId: typeof book.bookId === "string" ? book.bookId : "",
      title: typeof book.title === "string" ? book.title : "Untitled",
      filePath: typeof book.filePath === "string" ? book.filePath : ""
    },
    highlights: highlights.map((highlight) => ({
      id: highlight.id,
      location: highlight.location,
      range: highlight.range,
      quote: highlight.quote,
      color: highlight.color,
      createdAt: highlight.createdAt
    })),
    notes: notes.map((note) => ({
      id: note.id,
      location: note.location,
      range: note.range,
      quote: note.quote,
      body: note.body,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt
    }))
  };
}
