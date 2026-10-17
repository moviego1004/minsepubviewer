export const MOBILE_EPUB_MAX_BYTES = 512 * 1024 * 1024;
export const MOBILE_MARKDOWN_MAX_BYTES = 16 * 1024 * 1024;
export const MOBILE_PDF_MAX_BYTES = 512 * 1024 * 1024;
export const MOBILE_DOCUMENT_MAX_BYTES = 64 * 1024 * 1024;

// Errors carry message keys; the reader translates them.
// Never send a whole EPUB or PDF as base64 through the native bridge; PDF.js reads the app copy by URL.
export async function hydrateMobileFile(descriptor, convertFileSrc, fetchFile = fetch) {
  if (!descriptor || descriptor.cancelled) return null;
  const kind = descriptor.kind;
  const limit = { epub: MOBILE_EPUB_MAX_BYTES, pdf: MOBILE_PDF_MAX_BYTES, document: MOBILE_DOCUMENT_MAX_BYTES, markdown: MOBILE_MARKDOWN_MAX_BYTES }[kind];
  if (!limit) throw new Error("native.unsupportedKind");
  if (!descriptor.path || !Number.isFinite(descriptor.size) || descriptor.size < 0 || descriptor.size > limit) {
    throw new Error("native.invalidDescriptor");
  }
  if (kind === "epub" && descriptor.rootPath && /^[0-9a-f]{64}$/.test(descriptor.bookId || "")) {
    return { kind, file: { ...descriptor, epubUrl: convertFileSrc(descriptor.rootPath), type: "application/epub+zip" } };
  }
  if (kind === "pdf") {
    return { kind, file: { ...descriptor, pdfUrl: convertFileSrc(descriptor.path), type: "application/pdf" } };
  }
  const response = await fetchFile(convertFileSrc(descriptor.path));
  if (!response.ok) throw new Error("native.readImportedFailed");
  if (kind === "epub" || kind === "document") {
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > limit) throw new Error(`native.${kind}TooLarge`);
    const type = kind === "epub" ? "application/epub+zip" : "application/octet-stream";
    return { kind, file: { ...descriptor, size: bytes.byteLength, bytes, type } };
  }
  const content = await response.text();
  if (new TextEncoder().encode(content).length > limit) throw new Error("native.markdownTooLarge");
  return { kind, document: { ...descriptor, content, viewMode: "view" } };
}
