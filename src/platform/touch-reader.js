import { setAttributeText, setText } from "../../web/i18n.js";
import { getTouchNavigation, isCenterTap } from "../core/touchNavigation.js";

const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_DISTANCE = 40;

export function installReaderTouch(target, { viewport, frame = null, enabled, paginated = () => true, navigate, center = () => {}, pinch: zoom = null, onError = console.error }) {
  // zoom: { begin(center), move(ratio, center), end(ratio) } receives the two-finger gesture as it happens;
  // ratio is the finger distance relative to the start, center is in top-level client coordinates.
  if (!target || target.__minseTouchNavigation) return;
  target.__minseTouchNavigation = true;
  const owner = target.nodeType === 9 ? target : target.ownerDocument;
  const selected = () => Boolean(owner.defaultView?.getSelection()?.toString().trim());
  const interactive = (element) => Boolean(element?.closest?.("a,button,input,textarea,select,video,audio,[contenteditable='true']"));
  const point = (event) => {
    const view = viewport.getBoundingClientRect();
    const offset = frame?.getBoundingClientRect() || { left: 0, top: 0 };
    return { x: event.clientX + offset.left - view.left, y: event.clientY + offset.top - view.top };
  };
  let gesture = null;
  let pinch = null;
  const distance = touches => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
  const midpoint = (touches) => {
    const offset = frame?.getBoundingClientRect() || { left: 0, top: 0 };
    return { x: (touches[0].clientX + touches[1].clientX) / 2 + offset.left, y: (touches[0].clientY + touches[1].clientY) / 2 + offset.top };
  };
  const finishPinch = () => {
    const ratio = pinch.ratio;
    pinch = null;
    void Promise.resolve(zoom.end(ratio)).catch(onError);
  };
  let ignoreClickUntil = 0;
  // Full screen is toggled by a double tap in the middle, so a single tap there (for example to
  // start a highlight) does nothing.
  let lastCenterTap = null;
  const centerTap = (at) => {
    const now = performance.now();
    if (lastCenterTap && now - lastCenterTap.time < DOUBLE_TAP_MS && Math.hypot(at.x - lastCenterTap.x, at.y - lastCenterTap.y) < DOUBLE_TAP_DISTANCE) {
      lastCenterTap = null;
      center();
      return true;
    }
    lastCenterTap = { ...at, time: now };
    return false;
  };
  const go = (direction) => { if (direction) void Promise.resolve(navigate(direction)).catch(onError); };
  target.addEventListener("touchstart", (event) => {
    if (enabled() && zoom && event.touches.length === 2) {
      gesture = null;
      if (pinch) finishPinch();
      pinch = { distance: Math.max(1, distance(event.touches)), ratio: 1 };
      zoom.begin(midpoint(event.touches));
      if (event.cancelable) event.preventDefault();
      return;
    }
    if (pinch) return;
    gesture = enabled() && event.touches.length === 1 && !selected() && !interactive(event.target)
      ? { start: point(event.touches[0]), time: performance.now() } : null;
  }, { passive: false });
  target.addEventListener("touchmove", (event) => {
    if (pinch) {
      if (event.cancelable) event.preventDefault();
      if (event.touches.length === 2) {
        pinch.ratio = distance(event.touches) / pinch.distance;
        zoom.move(pinch.ratio, midpoint(event.touches));
      }
      return;
    }
    if (!gesture || !enabled() || !paginated()) return;
    if (event.touches.length !== 1 || selected()) { gesture = null; return; }
    const next = point(event.touches[0]);
    if (Math.max(Math.abs(next.x - gesture.start.x), Math.abs(next.y - gesture.start.y)) > 12 && event.cancelable) event.preventDefault();
  }, { passive: false });
  target.addEventListener("touchend", (event) => {
    ignoreClickUntil = performance.now() + 700;
    if (pinch) {
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      if (!event.touches.length) finishPinch();
      return;
    }
    const started = gesture;
    gesture = null;
    if (!started || !enabled() || event.touches.length || !event.changedTouches.length) return;
    const tap = { ...started, end: point(event.changedTouches[0]), duration: performance.now() - started.time,
      height: viewport.clientHeight, continuous: !paginated(), selected: selected(), interactive: interactive(event.target) };
    const direction = getTouchNavigation(tap);
    if (direction) { lastCenterTap = null; if (event.cancelable) event.preventDefault(); event.stopPropagation(); go(direction); }
    else if (isCenterTap(tap) && centerTap(tap.end) && event.cancelable) event.preventDefault();
  }, { passive: false, capture: true });
  target.addEventListener("touchcancel", () => { gesture = null; if (pinch) finishPinch(); ignoreClickUntil = performance.now() + 700; }, { passive: true });
  target.addEventListener("click", (event) => {
    if (performance.now() < ignoreClickUntil || !enabled() || event.defaultPrevented) return;
    const end = point(event);
    const direction = getTouchNavigation({ start: end, end, duration: 0, height: viewport.clientHeight, continuous: !paginated(),
      selected: selected(), interactive: interactive(event.target) });
    if (direction) { lastCenterTap = null; event.preventDefault(); event.stopPropagation(); go(direction); }
    else if (isCenterTap({ start: end, end, duration: 0, height: viewport.clientHeight, selected: selected(), interactive: interactive(event.target) })) centerTap(end);
  }, true);
}

export function createMobileNavigation({ app, previous, next, bookmark }) {
  const bar = document.createElement("nav");
  bar.className = "mobile-reader-navigation";
  setAttributeText(bar, "aria-label", "mobile.pageNavigation");
  const button = (id, text, action) => {
    const control = document.createElement("button");
    control.id = id;
    control.type = "button";
    setText(control, text);
    control.addEventListener("click", () => void Promise.resolve(action()).catch(console.error));
    return control;
  };
  const label = document.createElement("span");
  label.id = "mobilePageLabel";
  label.setAttribute("aria-live", "polite");
  const prev = button("mobilePrevButton", "mobile.previous", previous);
  const mark = button("mobileBookmarkButton", "mobile.bookmark", bookmark);
  const following = button("mobileNextButton", "mobile.next", next);
  bar.append(prev, label, mark, following);
  app.append(bar);
  return { bar, label, prev, mark, next: following };
}
