export const THEMES = Object.freeze(["light", "dark", "sepia"]);
export const VIEW_MODES = Object.freeze(["paginated", "continuous"]);
export const FONT_FAMILIES = Object.freeze([
  "original",
  "system",
  "kopub-batang",
  "kopub-dotum",
  "noto-serif-kr",
  "noto-sans-kr",
  "nanum-myeongjo",
  "nanum-gothic"
]);

export const DEFAULT_READING_SETTINGS = Object.freeze({
  fontFamily: "original",
  fontSize: 18,
  lineHeight: 1.6,
  margin: 24,
  theme: "light",
  viewMode: "paginated",
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

const FONT_FAMILY_ALIASES = Object.freeze({
  serif: "noto-serif-kr",
  "sans-serif": "noto-sans-kr",
  monospace: "system"
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

  const fontFamily = typeof merged.fontFamily === "string"
    ? merged.fontFamily.trim()
    : "";
  const normalizedFontFamily = FONT_FAMILY_ALIASES[fontFamily] || fontFamily;

  normalized.fontFamily = FONT_FAMILIES.includes(normalizedFontFamily)
    ? normalizedFontFamily
    : DEFAULT_READING_SETTINGS.fontFamily;

  normalized.theme = THEMES.includes(merged.theme)
    ? merged.theme
    : DEFAULT_READING_SETTINGS.theme;

  normalized.viewMode = VIEW_MODES.includes(merged.viewMode)
    ? merged.viewMode
    : DEFAULT_READING_SETTINGS.viewMode;

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

