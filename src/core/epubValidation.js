export const DEFAULT_MAX_EPUB_BYTES = 250 * 1024 * 1024;

const EPUB_MIME_TYPES = new Set([
  "application/epub+zip",
  "application/x-epub+zip"
]);

function getFileName(file = {}) {
  return typeof file.name === "string" ? file.name.trim() : "";
}

function getFileType(file = {}) {
  return typeof file.type === "string" ? file.type.trim().toLowerCase() : "";
}

function getFileSize(file = {}) {
  return typeof file.size === "number" && Number.isFinite(file.size)
    ? file.size
    : null;
}

function hasEpubExtension(file = {}) {
  return /\.epub$/i.test(getFileName(file));
}

function hasEpubMimeType(file = {}) {
  const type = getFileType(file);

  return !type || EPUB_MIME_TYPES.has(type);
}

function startsWithZipSignature(bytes) {
  return bytes?.[0] === 0x50 && bytes?.[1] === 0x4b;
}

export function getEpubOpenProblem(file, bytes, options = {}) {
  if (!file) {
    return {
      code: "missing-file",
      message: "No EPUB file was selected."
    };
  }

  const size = getFileSize(file);
  const maxBytes = typeof options.maxBytes === "number" && Number.isFinite(options.maxBytes)
    ? options.maxBytes
    : DEFAULT_MAX_EPUB_BYTES;

  if (!hasEpubExtension(file) || !hasEpubMimeType(file)) {
    return {
      code: "unsupported-file",
      message: "Choose a valid .epub file."
    };
  }

  if (size === 0 || bytes?.byteLength === 0) {
    return {
      code: "empty-file",
      message: "This EPUB file is empty."
    };
  }

  if (size !== null && size > maxBytes) {
    return {
      code: "file-too-large",
      message: "This EPUB is very large and may use too much memory. Try a smaller file for now."
    };
  }

  if (bytes && bytes.byteLength >= 2 && !startsWithZipSignature(bytes)) {
    return {
      code: "invalid-zip",
      message: "This file does not look like a valid EPUB package."
    };
  }

  return null;
}

export function assertOpenableEpub(file, bytes, options = {}) {
  const problem = getEpubOpenProblem(file, bytes, options);

  if (problem) {
    const error = new Error(problem.message);
    error.code = problem.code;
    throw error;
  }
}

export function describeEpubOpenFailure(error) {
  const code = typeof error?.code === "string" ? error.code : "";
  const name = typeof error?.name === "string" ? error.name : "";
  const message = typeof error?.message === "string" ? error.message : String(error || "");
  const searchable = `${code} ${name} ${message}`.toLowerCase();

  if (code === "file-too-large" || /memory|allocation|quota|out of memory/.test(searchable)) {
    return {
      code: "memory-heavy",
      message: "This EPUB appears to be too large or memory-heavy to open reliably right now."
    };
  }

  if (
    code === "invalid-zip" ||
    /invalid zip|can't find end of central directory|corrupt|compressed data|zip/i.test(searchable)
  ) {
    return {
      code: "corrupt-epub",
      message: "This EPUB package appears to be corrupt or incomplete."
    };
  }

  if (
    code === "unsupported-file" ||
    /unsupported|not supported|mimetype|container\.xml|opf|manifest/.test(searchable)
  ) {
    return {
      code: "unsupported-epub",
      message: "This EPUB uses a structure the viewer does not support yet."
    };
  }

  if (/password|encrypted|drm|rights/.test(searchable)) {
    return {
      code: "protected-epub",
      message: "This EPUB appears to be protected or encrypted, so it cannot be opened here."
    };
  }

  return {
    code: code || "open-failed",
    message: "Could not open this EPUB. Try another file, or check the app log for details."
  };
}
