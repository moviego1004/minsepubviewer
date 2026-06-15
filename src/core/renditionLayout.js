export function getPublicationLayoutMode(epubBook) {
  const metadataLayout = epubBook?.package?.metadata?.layout || epubBook?.packaging?.metadata?.layout || "";
  const fixedLayout = epubBook?.displayOptions?.fixedLayout || "";

  return metadataLayout === "pre-paginated" || fixedLayout === "true"
    ? "pre-paginated"
    : "reflowable";
}

export function isPrePaginatedPublication(epubBook) {
  return getPublicationLayoutMode(epubBook) === "pre-paginated";
}

export function shouldApplyReaderReflowStyles(epubBook) {
  return !isPrePaginatedPublication(epubBook);
}
