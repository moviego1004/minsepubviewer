// PDF reading positions and highlight ranges are stored as strings in the same
// book record fields EPUB uses (lastLocation, bookmark.location, highlight.range).
// Coordinates are PDF user-space points, so they survive zoom and rotation.

const LOCATION_PREFIX = "pdf:";
const RANGE_PREFIX = "pdf-range:";
const ZOOM_PRESETS = new Set(["auto", "page-width", "page-fit", "page-actual"]);

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round(value) {
  return Math.round(finiteNumber(value) * 100) / 100;
}

export function normalizePdfZoom(value, fallback = "page-width") {
  if (ZOOM_PRESETS.has(value)) return value;
  const scale = Number(value);
  return Number.isFinite(scale) && scale >= 0.1 && scale <= 10 ? round(scale) : fallback;
}

export function isPdfLocation(value) {
  return typeof value === "string" && value.startsWith(LOCATION_PREFIX);
}

export function createPdfDocumentId(fingerprint) {
  const value = String(fingerprint || "").trim().toLowerCase().replace(/[^0-9a-z]/g, "");
  if (!value) throw new TypeError("PDF fingerprint is required");
  return `pdf-${value}`;
}

export function formatPdfLocation({ pageNumber, zoom, left, top, rotation } = {}) {
  const page = Math.max(1, Math.trunc(finiteNumber(pageNumber, 1)));
  const params = new URLSearchParams({ page: String(page), zoom: String(normalizePdfZoom(zoom)) });
  if (Number.isFinite(Number(left))) params.set("left", String(round(left)));
  if (Number.isFinite(Number(top))) params.set("top", String(round(top)));
  const turn = ((Math.trunc(finiteNumber(rotation)) % 360) + 360) % 360;
  if (turn % 90 === 0 && turn) params.set("rotation", String(turn));
  return `${LOCATION_PREFIX}${params}`;
}

export function parsePdfLocation(value) {
  if (!isPdfLocation(value)) return null;
  const params = new URLSearchParams(value.slice(LOCATION_PREFIX.length));
  const pageNumber = Math.trunc(Number(params.get("page")));
  if (!Number.isFinite(pageNumber) || pageNumber < 1) return null;
  const optional = (name) => (params.has(name) && Number.isFinite(Number(params.get(name))) ? Number(params.get(name)) : null);
  const rotation = optional("rotation") ?? 0;
  return {
    pageNumber,
    zoom: normalizePdfZoom(params.get("zoom")),
    left: optional("left"),
    top: optional("top"),
    rotation: rotation % 90 === 0 ? ((rotation % 360) + 360) % 360 : 0
  };
}

export function isPdfRange(value) {
  return typeof value === "string" && value.startsWith(RANGE_PREFIX);
}

function normalizeRect(rect) {
  if (!Array.isArray(rect) || rect.length !== 4) return null;
  const [x1, y1, x2, y2] = rect.map((item) => Number(item));
  if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
  const normalized = [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)].map(round);
  return normalized[2] - normalized[0] > 0 && normalized[3] - normalized[1] > 0 ? normalized : null;
}

// Selection rectangles on one text line are merged so a highlight is drawn as one band.
export function mergePdfRects(rects) {
  const sorted = rects.map(normalizeRect).filter(Boolean).sort((a, b) => b[3] - a[3] || a[0] - b[0]);
  const merged = [];
  for (const rect of sorted) {
    const last = merged[merged.length - 1];
    const sameLine = last && Math.abs(last[1] - rect[1]) <= 2 && Math.abs(last[3] - rect[3]) <= 2;
    if (sameLine && rect[0] <= last[2] + 2) {
      last[0] = Math.min(last[0], rect[0]);
      last[1] = Math.min(last[1], rect[1]);
      last[2] = Math.max(last[2], rect[2]);
      last[3] = Math.max(last[3], rect[3]);
    } else {
      merged.push([...rect]);
    }
  }
  return merged;
}

export function formatPdfRange(pages) {
  const normalized = (Array.isArray(pages) ? pages : [])
    .map(({ pageNumber, rects }) => ({
      pageNumber: Math.trunc(Number(pageNumber)),
      rects: mergePdfRects(Array.isArray(rects) ? rects : [])
    }))
    .filter(({ pageNumber, rects }) => pageNumber >= 1 && rects.length)
    .sort((a, b) => a.pageNumber - b.pageNumber);
  if (!normalized.length) throw new TypeError("PDF range needs at least one rectangle");
  return `${RANGE_PREFIX}${JSON.stringify(normalized.map(({ pageNumber, rects }) => ({ p: pageNumber, r: rects })))}`;
}

export function parsePdfRange(value) {
  if (!isPdfRange(value)) return [];
  try {
    const parsed = JSON.parse(value.slice(RANGE_PREFIX.length));
    return (Array.isArray(parsed) ? parsed : [])
      .map((entry) => ({
        pageNumber: Math.trunc(Number(entry?.p)),
        rects: (Array.isArray(entry?.r) ? entry.r : []).map(normalizeRect).filter(Boolean)
      }))
      .filter(({ pageNumber, rects }) => pageNumber >= 1 && rects.length);
  } catch {
    return [];
  }
}

export function getPdfRangeFirstPage(value) {
  return parsePdfRange(value)[0]?.pageNumber || null;
}
