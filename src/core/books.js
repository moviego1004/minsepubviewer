import { normalizeReadingSettings } from "./settings.js";

export function computeBookId(content) {
  const hasBuffer = typeof Buffer !== "undefined";

  if (
    typeof content !== "string" &&
    !(hasBuffer && Buffer.isBuffer(content)) &&
    !(content instanceof Uint8Array)
  ) {
    throw new TypeError("content must be a string, Buffer, or Uint8Array");
  }

  const bytes = typeof content === "string"
    ? new TextEncoder().encode(content)
    : new Uint8Array(content);

  let hashA = 0x811c9dc5;
  let hashB = 0x01000193;

  for (const byte of bytes) {
    hashA ^= byte;
    hashA = Math.imul(hashA, 0x01000193) >>> 0;
    hashB = Math.imul(hashB ^ byte, 0x85ebca6b) >>> 0;
  }

  const seed = `${hashA.toString(16).padStart(8, "0")}${hashB.toString(16).padStart(8, "0")}`;
  return seed.repeat(4).slice(0, 64);
}

export function createBookRecord(input) {
  if (!input || typeof input !== "object") {
    throw new TypeError("book input is required");
  }

  const bookId = typeof input.bookId === "string" && input.bookId.trim()
    ? input.bookId.trim()
    : computeBookId(input.content);

  return {
    bookId,
    title: typeof input.title === "string" && input.title.trim()
      ? input.title.trim()
      : "Untitled",
    filePath: typeof input.filePath === "string" ? input.filePath : "",
    lastLocation: typeof input.lastLocation === "string" ? input.lastLocation : "",
    settings: normalizeReadingSettings(input.settings),
    bookmarks: Array.isArray(input.bookmarks) ? input.bookmarks : [],
    highlights: Array.isArray(input.highlights) ? input.highlights : [],
    notes: Array.isArray(input.notes) ? input.notes : [],
    textBoxes: Array.isArray(input.textBoxes) ? input.textBoxes : [],
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: input.updatedAt || null
  };
}

export function updateLastLocation(book, location) {
  if (typeof location !== "string" || !location.trim()) {
    throw new TypeError("location is required");
  }

  return {
    ...book,
    lastLocation: location.trim(),
    updatedAt: new Date().toISOString()
  };
}

export function updateBookSettings(book, settingsPatch) {
  return {
    ...book,
    settings: normalizeReadingSettings({
      ...book.settings,
      ...settingsPatch
    }),
    updatedAt: new Date().toISOString()
  };
}
