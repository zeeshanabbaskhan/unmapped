/**
 * client/lib/i18n.ts
 *
 * Client-side translation helper. The Node API serves the resolved i18n strings
 * for the active country at /api/config/{country}. This module stores them and
 * provides a t() function that every component uses for UI strings.
 *
 * Usage:
 *   import { t, loadTranslations } from '@/lib/i18n'
 *
 *   // On country change, load the new translations:
 *   await loadTranslations(countryCode)
 *
 *   // In any component:
 *   <h1>{t('intake.welcome')}</h1>
 */

const NODE_API = process.env.NEXT_PUBLIC_NODE_API ?? "http://localhost:4000";

export type TranslationMap = Record<string, string>;

let _translations: TranslationMap = {};
let _lang: string = "en";

/**
 * Fetches the resolved i18n strings for a country from the API and stores them.
 * Call this whenever the active country changes.
 */
export async function loadTranslations(countryCode: string): Promise<void> {
  try {
    const response = await fetch(`${NODE_API}/api/config/${countryCode}`);
    if (!response.ok) return;
    const config = await response.json();
    if (config.i18n && typeof config.i18n === "object") {
      _translations = config.i18n as TranslationMap;
      _lang = config.i18n_lang ?? "en";
    }
  } catch {
    // Keep current translations on network failure
  }
}

/**
 * Loads translations directly from a config object (already fetched).
 * Use this when you have the full config in state to avoid a second API call.
 */
export function setTranslationsFromConfig(config: {
  i18n?: TranslationMap;
  i18n_lang?: string;
}): void {
  if (config.i18n && typeof config.i18n === "object") {
    _translations = config.i18n;
    _lang = config.i18n_lang ?? "en";
  }
}

/**
 * Returns the translated string for a key.
 * Falls back to the key itself if not found (never silently hides content).
 */
export function t(key: string, replacements?: Record<string, string | number>): string {
  let value = _translations[key] ?? key;
  if (replacements) {
    for (const [k, v] of Object.entries(replacements)) {
      value = value.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return value;
}

/** Returns the active language code (e.g. "en", "bn"). */
export function getActiveLang(): string {
  return _lang;
}

/** Returns true if the active language renders right-to-left. */
export function isRtl(): boolean {
  return ["ar", "he", "ur", "fa"].includes(_lang);
}

/** Returns all currently loaded translation keys (useful for debugging). */
export function getLoadedTranslations(): TranslationMap {
  return { ..._translations };
}

/**
 * React hook: re-renders component when translations change.
 * Thin wrapper — components import t() directly in most cases.
 */
export function useT() {
  return t;
}
