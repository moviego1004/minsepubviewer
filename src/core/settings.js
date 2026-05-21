export const THEMES = Object.freeze(["light", "dark", "sepia"]);

export const DEFAULT_READING_SETTINGS = Object.freeze({
  fontFamily: "system",
  fontSize: 18,
  lineHeight: 1.6,
  margin: 24,
  theme: "light",
  zoom: 1,
  textOnly: false,
  hideCoverInTextOnly: false,
  keepCaptionsInTextOnly: true
});

const NUMBER_LIMITS = Object.freeze({
  fontSize: [10, 42],
  lineHeight: [1.1, 2.4],
  margin: [0, 96],
  zoom: [0.6, 2.5]
});

function clampNumber(value, min, max, fallback) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}

export function normalizeReadingSettings(input = {}) {
  const merged = {
    ...DEFAULT_READING_SETTINGS,
    ...input
  };

  const normalized = { ...merged };

  for (const [key, [min, max]] of Object.entries(NUMBER_LIMITS)) {
    normalized[key] = clampNumber(
      merged[key],
      min,
      max,
      DEFAULT_READING_SETTINGS[key]
    );
  }

  normalized.fontFamily =
    typeof merged.fontFamily === "string" && merged.fontFamily.trim()
      ? merged.fontFamily.trim()
      : DEFAULT_READING_SETTINGS.fontFamily;

  normalized.theme = THEMES.includes(merged.theme)
    ? merged.theme
    : DEFAULT_READING_SETTINGS.theme;

  normalized.textOnly = Boolean(merged.textOnly);
  normalized.hideCoverInTextOnly = Boolean(merged.hideCoverInTextOnly);
  normalized.keepCaptionsInTextOnly = Boolean(merged.keepCaptionsInTextOnly);

  return normalized;
}

export function mergeReadingSettings(current, patch) {
  return normalizeReadingSettings({
    ...normalizeReadingSettings(current),
    ...patch
  });
}

