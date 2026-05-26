import { createBookRecord } from "./books.js";

export function createLibraryState(input = {}) {
  const books = Array.isArray(input.books)
    ? input.books.map((book) => createBookRecord(book))
    : [];

  return {
    version: 1,
    activeBookId: typeof input.activeBookId === "string" ? input.activeBookId : "",
    books
  };
}

export function getBookRecord(library, bookId) {
  if (typeof bookId !== "string" || !bookId.trim()) {
    return null;
  }

  return library.books.find((book) => book.bookId === bookId.trim()) || null;
}

export function upsertBookRecord(library, book) {
  const normalizedBook = createBookRecord(book);
  const existingIndex = library.books.findIndex(
    (item) => item.bookId === normalizedBook.bookId
  );
  const books = [...library.books];

  if (existingIndex >= 0) {
    books[existingIndex] = {
      ...books[existingIndex],
      ...normalizedBook,
      createdAt: books[existingIndex].createdAt,
      updatedAt: normalizedBook.updatedAt || new Date().toISOString()
    };
  } else {
    books.push(normalizedBook);
  }

  return {
    ...library,
    activeBookId: normalizedBook.bookId,
    books
  };
}

export function serializeLibraryState(library) {
  return JSON.stringify(createLibraryState(library));
}

export function parseLibraryState(serialized) {
  if (typeof serialized !== "string" || !serialized.trim()) {
    return createLibraryState();
  }

  try {
    return createLibraryState(JSON.parse(serialized));
  } catch {
    return createLibraryState();
  }
}

function canParseLibraryState(serialized) {
  if (typeof serialized !== "string" || !serialized.trim()) {
    return false;
  }

  try {
    JSON.parse(serialized);
    return true;
  } catch {
    return false;
  }
}

export function parseLibraryStateWithRecovery(serialized, backupSerialized) {
  const hasPrimary = canParseLibraryState(serialized);
  const primary = hasPrimary ? parseLibraryState(serialized) : createLibraryState();

  if (hasPrimary) {
    return {
      library: primary,
      recovered: false,
      source: "primary"
    };
  }

  const backup = parseLibraryState(backupSerialized);

  if (backup.books.length || backup.activeBookId) {
    return {
      library: backup,
      recovered: true,
      source: "backup"
    };
  }

  return {
    library: primary,
    recovered: false,
    source: "empty"
  };
}
