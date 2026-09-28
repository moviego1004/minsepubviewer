export const MOBILE_EPUB_MAX_BYTES = 512 * 1024 * 1024;
export const MOBILE_MARKDOWN_MAX_BYTES = 16 * 1024 * 1024;

// Never send a whole EPUB as base64 through the native bridge.
export async function hydrateMobileFile(descriptor, convertFileSrc, fetchFile = fetch) {
  if (!descriptor || descriptor.cancelled) return null;
  const kind = descriptor.kind;
  if (kind !== "epub" && kind !== "markdown") throw new Error("지원하지 않는 문서 형식입니다.");
  const limit = kind === "epub" ? MOBILE_EPUB_MAX_BYTES : MOBILE_MARKDOWN_MAX_BYTES;
  if (!descriptor.path || !Number.isFinite(descriptor.size) || descriptor.size < 0 || descriptor.size > limit) {
    throw new Error("문서 경로 또는 크기가 올바르지 않습니다.");
  }
  if (kind === "epub" && descriptor.rootPath && /^[0-9a-f]{64}$/.test(descriptor.bookId || "")) {
    return { kind, file: { ...descriptor, epubUrl: convertFileSrc(descriptor.rootPath), type: "application/epub+zip" } };
  }
  const response = await fetchFile(convertFileSrc(descriptor.path));
  if (!response.ok) throw new Error("가져온 문서를 읽지 못했습니다.");
  if (kind === "epub") {
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > limit) throw new Error("EPUB은 512MB 이하만 열 수 있습니다.");
    return { kind, file: { ...descriptor, size: bytes.byteLength, bytes, type: "application/epub+zip" } };
  }
  const content = await response.text();
  if (new TextEncoder().encode(content).length > limit) throw new Error("Markdown은 16MB 이하만 열 수 있습니다.");
  return { kind, document: { ...descriptor, content, viewMode: "view" } };
}
