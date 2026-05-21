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
  return {
    ...createBaseAnnotation("highlight", input),
    range: requireNonEmptyString(input.range, "range"),
    quote: requireNonEmptyString(input.quote, "quote"),
    color: typeof input.color === "string" && input.color.trim()
      ? input.color.trim()
      : "yellow"
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
