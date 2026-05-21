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

