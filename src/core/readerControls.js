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

