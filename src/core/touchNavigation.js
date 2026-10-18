// Coordinates are relative to the visible reader, not a multi-column iframe.
// Top and bottom thirds turn pages (or scroll one screen) in every view mode. Swipes turn pages only
// when the content does not scroll itself (continuous: false). The middle third never turns pages:
// it stays free for selection and highlights; a double tap there toggles full screen (see isCenterTap).
export function getTouchNavigation({ start, end, duration, height, selected = false, interactive = false, multitouch = false, continuous = false }) {
  if (!start || !end || selected || interactive || multitouch || height <= 0) return null;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.max(Math.abs(dx), Math.abs(dy));
  if (duration < 0 || duration > 800) return null;
  if (distance >= 48) {
    if (continuous) return null;
    const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
    return delta < 0 ? "next" : "previous";
  }
  // Leave the middle for selection, links and image interaction; a long press
  // must never turn a page while Android is opening its selection handles.
  if (distance > 12 || duration > 350 || end.y < 0 || end.y > height) return null;
  if (end.y < height / 3) return "previous";
  if (end.y > height * 2 / 3) return "next";
  return null;
}

// A short, still tap in the middle third of the reader.
export function isCenterTap({ start, end, duration, height, selected = false, interactive = false }) {
  if (!start || !end || selected || interactive || height <= 0) return false;
  if (duration < 0 || duration > 350 || Math.hypot(end.x - start.x, end.y - start.y) > 12) return false;
  return end.y >= height / 3 && end.y <= height * 2 / 3;
}

// Where a scrolling element sits when a touch starts: which edges it already touches.
export function getScrollEdges({ scrollTop, scrollLeft, scrollHeight, scrollWidth, clientHeight, clientWidth }, slack = 2) {
  return {
    top: scrollTop <= slack,
    bottom: scrollTop >= scrollHeight - clientHeight - slack,
    left: scrollLeft <= slack,
    right: scrollLeft >= scrollWidth - clientWidth - slack
  };
}

// A page that is larger than the screen scrolls under the finger. A swipe that starts with the page
// already at its end and keeps pushing past it turns to the next page (and the reverse at the start).
export function getEdgeSwipe({ start, end, duration, edges, selected = false, interactive = false, multitouch = false }) {
  if (!start || !end || !edges || selected || interactive || multitouch || duration < 0 || duration > 800) return null;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 48) return null;
  if (Math.abs(dy) >= Math.abs(dx)) {
    if (dy < 0 && edges.bottom) return "next";
    if (dy > 0 && edges.top) return "previous";
    return null;
  }
  if (dx < 0 && edges.right) return "next";
  if (dx > 0 && edges.left) return "previous";
  return null;
}
