import { setAttributeText, setText } from "../../web/i18n.js";
import { getTouchNavigation } from "../core/touchNavigation.js";

export function installReaderTouch(target, { viewport, frame = null, enabled, paginated = () => true, navigate, center = () => {}, fontSize, previewFont = () => {}, setFont, onError = console.error }) {
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
  let ignoreClickUntil = 0;
  const go = (direction) => { if (direction) void Promise.resolve(navigate(direction)).catch(onError); };
  target.addEventListener("touchstart", (event) => {
    if (enabled() && setFont && event.touches.length === 2) {
      gesture = null;
      const size = fontSize();
      pinch = { distance: Math.max(1, distance(event.touches)), size, next: size };
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
        pinch.next = Math.max(10, Math.min(42, Math.round(pinch.size * distance(event.touches) / pinch.distance)));
        previewFont(pinch.next);
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
      if (!event.touches.length) {
        const size = pinch.next;
        pinch = null;
        void Promise.resolve(setFont(size)).catch(onError);
      }
      return;
    }
    const started = gesture;
    gesture = null;
    if (!started || !enabled() || event.touches.length || !event.changedTouches.length) return;
    const direction = getTouchNavigation({ ...started, end: point(event.changedTouches[0]), duration: performance.now() - started.time,
      height: viewport.clientHeight, continuous: !paginated(), selected: selected(), interactive: interactive(event.target) });
    if (direction) { if (event.cancelable) event.preventDefault(); event.stopPropagation(); go(direction); }
    else if (!selected() && !interactive(event.target) && performance.now() - started.time < 350 && Math.hypot(point(event.changedTouches[0]).x - started.start.x, point(event.changedTouches[0]).y - started.start.y) < 12) center();
  }, { passive: false, capture: true });
  target.addEventListener("touchcancel", () => { gesture = null; pinch = null; ignoreClickUntil = performance.now() + 700; }, { passive: true });
  target.addEventListener("click", (event) => {
    if (performance.now() < ignoreClickUntil || !enabled() || event.defaultPrevented) return;
    const end = point(event);
    const direction = getTouchNavigation({ start: end, end, duration: 0, height: viewport.clientHeight, continuous: !paginated(),
      selected: selected(), interactive: interactive(event.target) });
    if (direction) { event.preventDefault(); event.stopPropagation(); go(direction); }
    else if (!selected() && !interactive(event.target)) center();
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
