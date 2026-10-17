import {
  hasMessage,
  normalizeLanguagePreference,
  resolveLocale,
  translate,
  translateErrorMessage
} from "../src/core/i18n.js";

const PREFERENCE_KEY = "minsepubviewer.language";
const ATTRIBUTE_BINDINGS = [
  ["i18nTitle", "title"],
  ["i18nAriaLabel", "aria-label"],
  ["i18nPlaceholder", "placeholder"]
];

let storage = null;
let preference = "system";
let locale = resolveLocale(preference, getSystemLocales());
const listeners = new Set();

function getSystemLocales() {
  const languages = globalThis.navigator?.languages;
  return languages?.length ? languages : [globalThis.navigator?.language || ""];
}

export function initI18n(store) {
  storage = store || null;
  try {
    preference = normalizeLanguagePreference(storage?.getItem(PREFERENCE_KEY));
  } catch {
    preference = "system";
  }
  locale = resolveLocale(preference, getSystemLocales());
  applyTranslations();
  return locale;
}

export function t(key, params) {
  return translate(locale, key, params);
}

// For keys built from codes (for example "epub.problem.<code>") that may not exist.
export function tOptional(key, fallback, params) {
  return hasMessage(key, locale) ? translate(locale, key, params) : fallback;
}

export function getLocale() {
  return locale;
}

export function getLanguagePreference() {
  return preference;
}

export function setLanguagePreference(value) {
  preference = normalizeLanguagePreference(value);
  try {
    storage?.setItem(PREFERENCE_KEY, preference);
  } catch {
    // The language still changes for this session.
  }
  locale = resolveLocale(preference, getSystemLocales());
  applyTranslations();
  for (const listener of listeners) listener(locale);
}

export function onLanguageChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Native and core errors may carry a message key instead of text.
export function errorText(error) {
  return translateErrorMessage(locale, error) || t("common.unknownError");
}

// Elements created in code keep their key so a language change updates them too.
export function setText(element, key) {
  element.dataset.i18n = key;
  element.textContent = t(key);
  return element;
}

export function setAttributeText(element, attribute, key) {
  const binding = ATTRIBUTE_BINDINGS.find(([, name]) => name === attribute);
  if (binding) element.dataset[binding[0]] = key;
  element.setAttribute(attribute, t(key));
  return element;
}

export function applyTranslations(root = globalThis.document) {
  if (!root?.querySelectorAll) return;
  if (root.documentElement) {
    root.documentElement.lang = locale;
    root.title = t("app.name");
  }
  for (const element of root.querySelectorAll("[data-i18n]")) {
    element.textContent = t(element.dataset.i18n);
  }
  for (const [dataKey, attribute] of ATTRIBUTE_BINDINGS) {
    const selector = `[data-${dataKey.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}]`;
    for (const element of root.querySelectorAll(selector)) {
      element.setAttribute(attribute, t(element.dataset[dataKey]));
    }
  }
}
