import { mergeReadingSettings } from "./settings.js";

export function getWheelIntent(eventLike) {
  const deltaY = Number(eventLike?.deltaY) || 0;

  if (deltaY === 0) {
    return { type: "none" };
  }

  if (eventLike?.ctrlKey) {
    return {
      type: "zoom",
      direction: deltaY < 0 ? "in" : "out"
    };
  }

  return {
    type: "page",
    direction: deltaY > 0 ? "next" : "previous"
  };
}

export function applyZoomIntent(settings, intent, step = 0.1) {
  if (!intent || intent.type !== "zoom") {
    return mergeReadingSettings(settings, {});
  }

  const currentZoom = Number(settings?.zoom) || 1;
  const nextZoom = intent.direction === "in"
    ? currentZoom + step
    : currentZoom - step;

  return mergeReadingSettings(settings, { zoom: Number(nextZoom.toFixed(2)) });
}

export function getScrollBoundaryIntent(metrics, direction, threshold = 2) {
  const scrollTop = Number(metrics?.scrollTop) || 0;
  const scrollHeight = Number(metrics?.scrollHeight) || 0;
  const clientHeight = Number(metrics?.clientHeight) || 0;

  if (scrollHeight <= clientHeight + threshold) {
    return "page";
  }

  if (direction === "next") {
    return scrollTop + clientHeight >= scrollHeight - threshold ? "page" : "scroll";
  }

  if (direction === "previous") {
    return scrollTop <= threshold ? "page" : "scroll";
  }

  return "page";
}

export function getViewportPageState(metrics) {
  const scrollTop = Math.max(0, Number(metrics?.scrollTop) || 0);
  const clientHeight = Math.max(0, Number(metrics?.clientHeight) || 0);
  const scrollHeight = Math.max(clientHeight, Number(metrics?.scrollHeight) || 0);
  const pageCount = clientHeight > 0
    ? Math.max(1, Math.ceil(scrollHeight / clientHeight))
    : 1;
  const page = clientHeight > 0
    ? Math.min(pageCount, Math.round(scrollTop / clientHeight) + 1)
    : 1;

  return {
    page,
    pageCount,
    atStart: scrollTop <= 1,
    atEnd: scrollTop + clientHeight >= scrollHeight - 1
  };
}

export function getViewportPageTarget(metrics, direction) {
  const scrollTop = Math.max(0, Number(metrics?.scrollTop) || 0);
  const clientHeight = Math.max(0, Number(metrics?.clientHeight) || 0);
  const scrollHeight = Math.max(clientHeight, Number(metrics?.scrollHeight) || 0);
  const maxScrollTop = Math.max(0, scrollHeight - clientHeight);
  const delta = direction === "previous"
    ? -clientHeight
    : direction === "next"
      ? clientHeight
      : 0;

  return Math.min(maxScrollTop, Math.max(0, scrollTop + delta));
}

