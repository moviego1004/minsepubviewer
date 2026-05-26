export const DEFAULT_SEARCH_LIMIT = 50;

export function normalizeSearchQuery(query) {
  return typeof query === "string" ? query.replace(/\s+/gu, " ").trim() : "";
}

export function canSearch(query) {
  return normalizeSearchQuery(query).length >= 2;
}

export function limitSearchResults(results, limit = DEFAULT_SEARCH_LIMIT) {
  if (!Array.isArray(results)) {
    return [];
  }

  const safeLimit = typeof limit === "number" && Number.isFinite(limit)
    ? Math.max(0, limit)
    : DEFAULT_SEARCH_LIMIT;

  return results.slice(0, safeLimit);
}

export function createSearchResult(input = {}) {
  return {
    id: typeof input.id === "string" && input.id ? input.id : `${input.cfi || ""}-${input.index || 0}`,
    cfi: typeof input.cfi === "string" ? input.cfi : "",
    excerpt: typeof input.excerpt === "string" ? input.excerpt.replace(/\s+/gu, " ").trim() : "",
    href: typeof input.href === "string" ? input.href : "",
    label: typeof input.label === "string" && input.label.trim() ? input.label.trim() : "Search result",
    index: Number.isFinite(input.index) ? input.index : 0
  };
}

export function getSearchNavigationIndex(currentIndex, total, direction) {
  const count = Number(total) || 0;

  if (count <= 0) {
    return -1;
  }

  const current = Number.isInteger(currentIndex) && currentIndex >= 0 && currentIndex < count
    ? currentIndex
    : direction === "previous" ? 0 : -1;

  if (direction === "previous") {
    return (current - 1 + count) % count;
  }

  return (current + 1) % count;
}
