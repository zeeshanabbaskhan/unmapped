/**
 * services/node-api/lib/configLoader.js
 *
 * Resolves the complete country config by merging:
 *   1. Auto-generated base (data/processed/all_country_configs.generated.json)
 *   2. Manual overrides (config/countries/{CC}.json)
 *   3. Manual automation overrides (config/automation/{CC}.json)
 *   4. Manual opportunity overrides (config/opportunities/{CC}.json)
 *   5. i18n translation (config/i18n/{lang}.json)
 *
 * Manual overrides always win over generated values.
 * Arrays are replaced entirely (not merged element-by-element).
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../../..");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function readJsonIfExists(path) {
  return existsSync(path) ? readJson(path) : null;
}

/**
 * Deep merge: plain objects are merged recursively.
 * Arrays and primitives in `override` replace `base` entirely.
 */
function deepMerge(base, override) {
  if (override === null || override === undefined) return base;
  if (base === null || base === undefined) return override;
  if (Array.isArray(override) || typeof override !== "object") return override;
  if (Array.isArray(base)) return override;

  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    result[key] =
      value !== null && typeof value === "object" && !Array.isArray(value) && typeof result[key] === "object" && !Array.isArray(result[key])
        ? deepMerge(result[key], value)
        : value;
  }
  return result;
}

// ─── load all data once at module import ──────────────────────────────────────

const generatedConfigsPath = join(ROOT, "data", "processed", "all_country_configs.generated.json");
let generatedConfigs = {};

if (existsSync(generatedConfigsPath)) {
  generatedConfigs = readJson(generatedConfigsPath).countries ?? {};
} else {
  console.warn(
    "[configLoader] WARNING: data/processed/all_country_configs.generated.json not found.\n" +
    "  Run: node scripts/generate-country-configs.mjs\n" +
    "  Falling back to manual overrides only."
  );
}

// Manual country overrides: config/countries/{CC}.json
const manualCountryOverrides = {};
const countriesDir = join(ROOT, "config", "countries");
if (existsSync(countriesDir)) {
  for (const file of readdirSync(countriesDir).filter((f) => f.endsWith(".json"))) {
    try {
      const data = readJson(join(countriesDir, file));
      if (data.country_code) manualCountryOverrides[data.country_code] = data;
    } catch {}
  }
}

// Manual automation overrides: config/automation/{CC}.json
const automationOverrides = {};
const automationDir = join(ROOT, "config", "automation");
if (existsSync(automationDir)) {
  for (const file of readdirSync(automationDir).filter((f) => f.endsWith(".json"))) {
    const cc = file.replace(".json", "");
    try {
      automationOverrides[cc] = readJson(join(automationDir, file));
    } catch {}
  }
}

// Manual opportunity overrides: config/opportunities/{CC}.json
const opportunityOverrides = {};
const opportunitiesDir = join(ROOT, "config", "opportunities");
if (existsSync(opportunitiesDir)) {
  for (const file of readdirSync(opportunitiesDir).filter((f) => f.endsWith(".json"))) {
    const cc = file.replace(".json", "");
    try {
      opportunityOverrides[cc] = readJson(join(opportunitiesDir, file));
    } catch {}
  }
}

// i18n translations: config/i18n/{lang}.json
const translations = {};
const i18nDir = join(ROOT, "config", "i18n");
if (existsSync(i18nDir)) {
  for (const file of readdirSync(i18nDir).filter((f) => f.endsWith(".json"))) {
    const lang = file.replace(".json", "");
    try {
      translations[lang] = readJson(join(i18nDir, file));
    } catch {}
  }
}

// Fallback i18n: English
const EN_FALLBACK = translations.en ?? {};

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Returns the fully resolved config for a country, merging generated base
 * with all manual overrides. Country code can be ISO-2 or ISO-3.
 */
export function resolveConfig(rawCode = "GH") {
  const code = normalizeCode(rawCode);

  // 1. Start with auto-generated base
  let config = deepMerge({}, generatedConfigs[code] ?? {});

  // 2. Apply manual country override (education, language, ui, etc.)
  const countryOverride = manualCountryOverrides[code];
  if (countryOverride) {
    config = deepMerge(config, countryOverride);
    if (config.provenance) config.provenance.override_applied = true;
  }

  // 3. Apply manual automation override
  const autoOverride = automationOverrides[code];
  if (autoOverride) {
    config.automation = deepMerge(config.automation ?? {}, autoOverride);
  }

  // 4. Apply manual opportunity override
  const oppOverride = opportunityOverrides[code];
  if (oppOverride) {
    config.opportunities = deepMerge(config.opportunities ?? {}, oppOverride);
  }

  // 5. Attach i18n
  const langCode = resolveTranslationLang(config);
  config.i18n = translations[langCode] ?? EN_FALLBACK;
  config.i18n_lang = langCode;

  // 6. Ensure required fallbacks exist
  config.country_code ??= code;
  config.country_name ??= code;
  config.education_levels ??= defaultEducationLevels();
  config.priority_sectors ??= [];
  config.priority_isco_groups ??= [];

  return config;
}

/** Returns translation strings for a given key, with English fallback. */
export function getTranslations(langCode) {
  return translations[langCode] ?? EN_FALLBACK;
}

/** Returns list of all supported country codes (ISO-2) that have any config data. */
export function getAllCountryCodes() {
  const codes = new Set([
    ...Object.keys(generatedConfigs),
    ...Object.keys(manualCountryOverrides),
  ]);
  return [...codes].sort();
}

/** Returns a lean summary of every available country (for /api/countries). */
export function getAllCountrySummaries() {
  return getAllCountryCodes().map((code) => {
    const gen = generatedConfigs[code] ?? {};
    const manual = manualCountryOverrides[code] ?? {};
    return {
      country_code: code,
      iso3: gen.iso3 ?? manual.iso3 ?? null,
      country_name: manual.country_name ?? gen.country_name ?? code,
      default_city: manual.default_city ?? gen.default_city ?? "",
      currency: manual.currency ?? gen.currency ?? null,
      currency_symbol: manual.currency_symbol ?? gen.currency_symbol ?? null,
      region: gen.world_bank?.region ?? "",
      income_level: gen.world_bank?.income_level ?? null,
      income_level_id: gen.world_bank?.income_level_id ?? null,
      infrastructure_level: gen.digital_infrastructure?.infrastructure_level ?? null,
      has_manual_override: Boolean(manualCountryOverrides[code] || automationOverrides[code] || opportunityOverrides[code]),
    };
  });
}

export function getConfigLoaderStats() {
  return {
    generated_country_count: Object.keys(generatedConfigs).length,
    manual_country_overrides: Object.keys(manualCountryOverrides).length,
    automation_overrides: Object.keys(automationOverrides).length,
    opportunity_overrides: Object.keys(opportunityOverrides).length,
    i18n_languages: Object.keys(translations).length,
    generated_file_exists: existsSync(generatedConfigsPath),
  };
}

// ─── internal helpers ─────────────────────────────────────────────────────────

/** ISO-3 → ISO-2 lookup built from generated configs. */
const iso3ToIso2 = {};
for (const [iso2, cfg] of Object.entries(generatedConfigs)) {
  if (cfg.iso3) iso3ToIso2[cfg.iso3] = iso2;
}

function normalizeCode(raw) {
  if (!raw) return "GH";
  const upper = String(raw).toUpperCase().trim();
  if (upper.length === 2) return upper;
  if (upper.length === 3) return iso3ToIso2[upper] ?? upper.slice(0, 2);
  return "GH";
}

function resolveTranslationLang(config) {
  const primary = config.language?.primary ?? "en";
  // Map ISO-639-3 to 2-char for translation file lookup
  const map = {
    eng: "en", ben: "bn", fra: "fr", ara: "ar", hin: "hi",
    swa: "sw", por: "pt", spa: "es", rus: "ru", zho: "zh",
    jpn: "ja", kor: "ko", urd: "ur", tam: "ta",
  };
  const lang2 = map[primary] ?? primary.slice(0, 2);
  // Fall back to "en" if no translation file
  return translations[lang2] ? lang2 : "en";
}

function defaultEducationLevels() {
  return [
    { id: "none",            label: "No formal education",   isced: "0",   credential_tier: "none" },
    { id: "primary",         label: "Primary school",        isced: "1",   credential_tier: "primary" },
    { id: "lower_secondary", label: "Lower secondary",       isced: "2",   credential_tier: "lower_secondary" },
    { id: "upper_secondary", label: "Upper secondary",       isced: "3",   credential_tier: "secondary" },
    { id: "tvet",            label: "TVET / vocational",     isced: "3-4", credential_tier: "vocational" },
    { id: "tertiary",        label: "Tertiary / university", isced: "5-7", credential_tier: "tertiary" },
  ];
}
