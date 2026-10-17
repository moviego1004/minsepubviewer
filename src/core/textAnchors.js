// Converted documents (DOCX, HWP, HWPX) have no stable structure across readers, so
// positions are stored as a scroll ratio and highlights as character offsets into the
// document text. Conversion is deterministic, so the offsets stay valid between sessions.

const LOCATION_PREFIX = "doc:";
const RANGE_PREFIX = "doc-range:";

function clampRatio(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : 0;
}

export function isDocLocation(value) {
  return typeof value === "string" && value.startsWith(LOCATION_PREFIX);
}

export function formatDocLocation(ratio) {
  return `${LOCATION_PREFIX}scroll=${Math.round(clampRatio(ratio) * 100000) / 100000}`;
}

export function parseDocLocation(value) {
  if (!isDocLocation(value)) return null;
  const params = new URLSearchParams(value.slice(LOCATION_PREFIX.length));
  return params.has("scroll") && Number.isFinite(Number(params.get("scroll")))
    ? { ratio: clampRatio(params.get("scroll")) }
    : null;
}

export function isDocRange(value) {
  return typeof value === "string" && value.startsWith(RANGE_PREFIX);
}

export function formatDocRange({ start, end }) {
  const from = Math.trunc(Number(start));
  const to = Math.trunc(Number(end));
  if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to <= from) {
    throw new TypeError("A document range needs 0 <= start < end");
  }
  return `${RANGE_PREFIX}${from}-${to}`;
}

export function parseDocRange(value) {
  if (!isDocRange(value)) return null;
  const match = /^(\d+)-(\d+)$/.exec(value.slice(RANGE_PREFIX.length));
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  return end > start ? { start, end } : null;
}

// Splits [start, end) over consecutive text nodes of the given lengths.
export function segmentsForRange(lengths, start, end) {
  const segments = [];
  let offset = 0;
  lengths.forEach((length, index) => {
    const nodeStart = offset;
    const nodeEnd = offset + length;
    offset = nodeEnd;
    const from = Math.max(start, nodeStart);
    const to = Math.min(end, nodeEnd);
    if (to > from) segments.push({ index, from: from - nodeStart, to: to - nodeStart });
  });
  return segments;
}

// Page-like steps over a scrolling document: one page is one viewport height.
export function getScrollPageState({ scrollTop, scrollHeight, clientHeight }) {
  const height = Math.max(1, clientHeight);
  const maxScroll = Math.max(0, scrollHeight - height);
  const pageCount = Math.max(1, Math.ceil(scrollHeight / height));
  const atEnd = scrollTop >= maxScroll - 1;
  // Page steps overlap slightly (see DocumentReader.next), so the page number is rounded.
  const page = maxScroll <= 0 ? 1 : atEnd ? pageCount : Math.min(pageCount, Math.round(scrollTop / height) + 1);
  return {
    page,
    pageCount,
    ratio: maxScroll <= 0 ? 0 : clampRatio(scrollTop / maxScroll),
    atStart: scrollTop <= 1,
    atEnd
  };
}

export function findTextMatches(text, query, { limit = 200, context = 30 } = {}) {
  const needle = String(query || "").trim().toLocaleLowerCase();
  const haystack = String(text || "");
  if (!needle) return [];
  const lower = haystack.toLocaleLowerCase();
  const matches = [];
  let cursor = 0;
  while (matches.length < limit) {
    const start = lower.indexOf(needle, cursor);
    if (start < 0) break;
    const end = start + needle.length;
    const before = haystack.slice(Math.max(0, start - context), start).replace(/\s+/g, " ");
    const after = haystack.slice(end, end + context).replace(/\s+/g, " ");
    matches.push({ index: matches.length, start, end, excerpt: `${start > context ? "…" : ""}${before}${haystack.slice(start, end)}${after}${end + context < haystack.length ? "…" : ""}` });
    cursor = end;
  }
  return matches;
}
