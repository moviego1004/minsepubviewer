import ko from "../locales/ko.js";
import en from "../locales/en.js";

export const SUPPORTED_LOCALES = Object.freeze(["ko", "en"]);
export const LANGUAGE_PREFERENCES = Object.freeze(["system", ...SUPPORTED_LOCALES]);
export const FALLBACK_LOCALE = "en";
export const MESSAGES = Object.freeze({ ko, en });

// Native code and core modules report stable keys such as "native.pickerBusy";
// the UI turns them into the active language.
const MESSAGE_KEY_PATTERN = /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9-]+)+$/;

export function normalizeLanguagePreference(value) {
  return LANGUAGE_PREFERENCES.includes(value) ? value : "system";
}

export function matchSupportedLocale(tag) {
  const base = String(tag || "").toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_LOCALES.includes(base) ? base : null;
}

export function resolveLocale(preference, systemLocales = []) {
  const normalized = normalizeLanguagePreference(preference);
  if (normalized !== "system") return normalized;
  for (const tag of Array.isArray(systemLocales) ? systemLocales : [systemLocales]) {
    const locale = matchSupportedLocale(tag);
    if (locale) return locale;
  }
  return FALLBACK_LOCALE;
}

export function hasMessage(key, locale = FALLBACK_LOCALE) {
  return typeof MESSAGES[locale]?.[key] === "string" || typeof MESSAGES[FALLBACK_LOCALE][key] === "string";
}

export function translate(locale, key, params = {}) {
  const template = MESSAGES[locale]?.[key] ?? MESSAGES[FALLBACK_LOCALE][key] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name) => (
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
  ));
}

export function createTranslator(locale) {
  return (key, params) => translate(locale, key, params);
}

export function isMessageKey(value, locale = FALLBACK_LOCALE) {
  return typeof value === "string" && MESSAGE_KEY_PATTERN.test(value) && hasMessage(value, locale);
}

export function translateErrorMessage(locale, error) {
  const message = typeof error?.message === "string" ? error.message : String(error ?? "");
  return isMessageKey(message, locale) ? translate(locale, message) : message;
}
