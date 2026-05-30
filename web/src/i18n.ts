import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import enTranslation from "./locales/en/translation.json";
import ruTranslation from "./locales/ru/translation.json";

export const SUPPORTED_LANGUAGES = ["en", "ru"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: "English",
  ru: "Русский",
};

// Persisted under this key in localStorage; auto-detected from navigator.language otherwise.
export const LANGUAGE_STORAGE_KEY = "teleton-lang";

export const resources = {
  en: { translation: enTranslation },
  ru: { translation: ruTranslation },
} as const;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
    // Only consider the primary subtag (e.g. "ru-RU" -> "ru").
    load: "languageOnly",
    nonExplicitSupportedLngs: true,
    interpolation: {
      // React already escapes values, so disable i18next's own escaping.
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ["localStorage"],
    },
  });

export default i18n;
