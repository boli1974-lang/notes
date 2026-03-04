import { enMessages } from "@/lib/i18n/messages/en";
import { zhMessages } from "@/lib/i18n/messages/zh";

export const SUPPORTED_LOCALES = ["en", "zh"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const LOCALE_STORAGE_KEY = "notes-mvp.locale";

export const messagesByLocale = {
  en: enMessages,
  zh: zhMessages,
} as const;

export type Messages = typeof messagesByLocale.en;

export function isLocale(value: string): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale);
}

export function getMessages(locale: Locale): Messages {
  return messagesByLocale[locale];
}

export function getInitialLocale(): Locale {
  if (typeof window === "undefined") {
    return "en";
  }

  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  if (stored && isLocale(stored)) {
    return stored;
  }

  return window.navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function persistLocale(locale: Locale): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
}
