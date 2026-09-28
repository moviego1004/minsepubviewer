// Coordinates are relative to the visible reader, not a multi-column iframe.
export function getTouchNavigation({ start, end, duration, height, selected = false, interactive = false, multitouch = false, continuous = false }) {
  if (!start || !end || selected || interactive || multitouch || continuous || height <= 0) return null;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.max(Math.abs(dx), Math.abs(dy));
  if (duration < 0 || duration > 800) return null;
  if (distance >= 48) {
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
