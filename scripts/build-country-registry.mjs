import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COUNTRIES_DIR = join(ROOT, "data", "countries");
const CONFIG_COUNTRIES_DIR = join(ROOT, "config", "countries");
const OUTPUT_DIR = join(ROOT, "data", "processed");

const INPUT_FILES = {
  restCountries: join(COUNTRIES_DIR, "restcountries.json"),
  worldBankCountries: join(COUNTRIES_DIR, "worldbankapicountries.json"),
};

/**
 * Country overrides loaded from config/countries/*.json — replaces the old
 * hardcoded COUNTRY_OVERRIDES object. Any country file added to config/countries/
 * is automatically picked up here. No code changes needed to add a new country.
 */
function loadCountryOverrides() {
  const overrides = {};
  if (!existsSync(CONFIG_COUNTRIES_DIR)) return overrides;
  for (const file of readdirSync(CONFIG_COUNTRIES_DIR).filter((f) => f.endsWith(".json"))) {
    try {
      const data = readJson(join(CONFIG_COUNTRIES_DIR, file));
      const code = data.country_code;
      if (!code) continue;
      overrides[code] = {};
      if (data.education_levels) overrides[code].education_levels = data.education_levels;
      if (data.priority_sectors) overrides[code].priority_sectors = data.priority_sectors;
      if (data.priority_isco_groups) overrides[code].priority_isco_groups = data.priority_isco_groups;
      if (data.ui) overrides[code].ui = data.ui;
      if (data.default_city) overrides[code].default_city = data.default_city;
      if (data.language) overrides[code].language = data.language;
    } catch {}
  }
  return overrides;
}

const DEFAULT_EDUCATION_LEVELS = [
  { id: "primary", label: "Primary", isced: "1", credential_tier: "primary" },
  { id: "lower_secondary", label: "Lower secondary", isced: "2", credential_tier: "lower_secondary" },
  { id: "upper_secondary", label: "Upper secondary", isced: "3", credential_tier: "secondary" },
  { id: "tvet", label: "TVET / vocational", isced: "3-4", credential_tier: "vocational" },
  { id: "tertiary", label: "Tertiary / university", isced: "5-7", credential_tier: "tertiary" },
];

const RTL_LANGUAGE_CODES = new Set(["ara", "arc", "dv", "fas", "heb", "kur", "prs", "pus", "snd", "urd", "yi"]);

// Overrides are now loaded dynamically from config/countries/*.json — see loadCountryOverrides()
// This replaces the old hardcoded COUNTRY_OVERRIDES object.

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function fileManifest(path, role) {
  const contents = readFileSync(path);
  const stats = statSync(path);
  return {
    file: relative(ROOT, path).replaceAll("\\", "/"),
    name: basename(path),
    role,
    bytes: stats.size,
    sha256: createHash("sha256").update(contents).digest("hex"),
  };
}

function normalizeName(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function cleanWorldBankCountries(raw) {
  const rows = Array.isArray(raw?.[1]) ? raw[1] : raw;
  return rows
    .filter((country) => country?.id && country?.iso2Code)
    .filter((country) => country.region?.value !== "Aggregates")
    .map((country) => ({
      iso3: country.id,
      iso2: country.iso2Code,
      name: normalizeName(country.name),
      world_bank_code: country.id,
      world_bank_region_id: country.region?.id || null,
      world_bank_region: normalizeName(country.region?.value),
      world_bank_admin_region_id: country.adminregion?.id || null,
      world_bank_admin_region: normalizeName(country.adminregion?.value),
      income_level_id: country.incomeLevel?.id || null,
      income_level: normalizeName(country.incomeLevel?.value),
      lending_type_id: country.lendingType?.id || null,
      lending_type: normalizeName(country.lendingType?.value),
      capital_city: normalizeName(country.capitalCity),
      latitude: country.latitude === "" ? null : Number(country.latitude),
      longitude: country.longitude === "" ? null : Number(country.longitude),
    }));
}

function cleanRestCountries(raw) {
  return raw
    .filter((country) => country?.cca2 && country?.cca3)
    .map((country) => {
      const languageCodes = Object.keys(country.languages ?? {});
      return {
        iso2: country.cca2,
        iso3: country.cca3,
        numeric_code: country.ccn3 || null,
        name: normalizeName(country.name?.common),
        official_name: normalizeName(country.name?.official),
        native_name: normalizeName(country.name?.native?.common || country.name?.common),
        currencies: country.currency ?? [],
        primary_currency: country.currency?.[0] ?? null,
        calling_codes: country.callingCode ?? [],
        capital: normalizeName(country.capital),
        region: normalizeName(country.region),
        subregion: normalizeName(country.subregion),
        languages: Object.entries(country.languages ?? {}).map(([code, label]) => ({
          code,
          label,
        })),
        primary_language: country.nativeLanguage || languageCodes[0] || "eng",
        text_direction: languageCodes.some((code) => RTL_LANGUAGE_CODES.has(code)) ? "rtl" : "ltr",
        borders: country.borders ?? [],
        area: country.area ?? null,
        latlng: country.latlng ?? [],
        tld: country.tld ?? [],
      };
    });
}

function mergeCountry(restCountry, worldBankCountry, COUNTRY_OVERRIDES = {}) {
  const iso2 = restCountry.iso2 || worldBankCountry?.iso2;
  const iso3 = restCountry.iso3 || worldBankCountry?.iso3;
  const override = COUNTRY_OVERRIDES[iso2] ?? {};
  const languages = restCountry.languages?.length ? restCountry.languages : [{ code: "eng", label: "English" }];
  const defaultCity = restCountry.capital || worldBankCountry?.capital_city || "";
  const supportedLanguages = languages.map((language) => language.label);

  return {
    country_code: iso2,
    iso2,
    iso3,
    country_name: restCountry.name || worldBankCountry?.name || iso3,
    official_name: restCountry.official_name || restCountry.name || worldBankCountry?.name || iso3,
    default_city: defaultCity,
    locale: `en-${iso2}`,
    currency: restCountry.primary_currency,
    currencies: restCountry.currencies ?? [],
    language: {
      primary: restCountry.primary_language || "eng",
      supported: languages,
      text_direction: restCountry.text_direction || "ltr",
    },
    supported_languages: supportedLanguages,
    geography: {
      region: restCountry.region || worldBankCountry?.world_bank_region || "",
      subregion: restCountry.subregion || worldBankCountry?.world_bank_admin_region || "",
      capital: defaultCity,
      latlng: restCountry.latlng ?? [],
      borders: restCountry.borders ?? [],
      area: restCountry.area ?? null,
    },
    world_bank: worldBankCountry
      ? {
          code: worldBankCountry.world_bank_code,
          region_id: worldBankCountry.world_bank_region_id,
          region: worldBankCountry.world_bank_region,
          admin_region_id: worldBankCountry.world_bank_admin_region_id,
          admin_region: worldBankCountry.world_bank_admin_region,
          income_level_id: worldBankCountry.income_level_id,
          income_level: worldBankCountry.income_level,
          lending_type_id: worldBankCountry.lending_type_id,
          lending_type: worldBankCountry.lending_type,
        }
      : null,
    data_adapters: {
      world_bank: {
        enabled: Boolean(worldBankCountry),
        country_code: worldBankCountry?.world_bank_code ?? null,
      },
      ilostat: {
        enabled: Boolean(iso3),
        ref_area: iso3,
      },
      itu: {
        enabled: Boolean(iso3),
        country_code: iso3,
      },
    },
    education_levels: override.education_levels ?? DEFAULT_EDUCATION_LEVELS,
    priority_sectors: override.priority_sectors ?? [
      "technical_services",
      "retail_trade",
      "construction_manufacturing_transport",
      "garments_craft",
      "agriculture",
      "food_hospitality",
      "personal_services",
    ],
    priority_isco_groups: override.priority_isco_groups ?? [],
    ui: {
      intake_title: "Build your skills profile",
      intake_greeting: "Tell us about the work you already do. We will translate it into a portable skills profile.",
    },
    provenance: {
      sources: ["restcountries", ...(worldBankCountry ? ["world_bank_countries"] : [])],
      override_applied: Boolean(COUNTRY_OVERRIDES[iso2]),
    },
  };
}

function build() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const COUNTRY_OVERRIDES = loadCountryOverrides();

  const restCountries = cleanRestCountries(readJson(INPUT_FILES.restCountries));
  const worldBankCountries = cleanWorldBankCountries(readJson(INPUT_FILES.worldBankCountries));
  const worldBankByIso3 = new Map(worldBankCountries.map((country) => [country.iso3, country]));
  const worldBankByIso2 = new Map(worldBankCountries.map((country) => [country.iso2, country]));

  const countries = restCountries
    .map((restCountry) => mergeCountry(restCountry, worldBankByIso3.get(restCountry.iso3) ?? worldBankByIso2.get(restCountry.iso2), COUNTRY_OVERRIDES))
    .filter((country) => country.iso2 && country.iso3)
    .sort((a, b) => a.country_name.localeCompare(b.country_name));

  const byIso2 = Object.fromEntries(countries.map((country) => [country.iso2, country]));
  const byIso3 = Object.fromEntries(countries.map((country) => [country.iso3, country]));
  const byWorldBankCode = Object.fromEntries(
    countries
      .filter((country) => country.world_bank?.code)
      .map((country) => [country.world_bank.code, country.iso2])
  );

  const payload = {
    version: "country-registry-generated-v1",
    generated_at: new Date().toISOString(),
    note: "Generated from REST Countries and World Bank country metadata. Do not hand-edit.",
    stats: {
      rest_countries: restCountries.length,
      world_bank_countries: worldBankCountries.length,
      merged_countries: countries.length,
      with_world_bank_mapping: countries.filter((country) => country.world_bank).length,
      with_currency: countries.filter((country) => country.currency).length,
      rtl_countries: countries.filter((country) => country.language.text_direction === "rtl").length,
      overrides_applied: countries.filter((country) => country.provenance.override_applied).length,
    },
    sources: [
      fileManifest(INPUT_FILES.restCountries, "rest_countries"),
      fileManifest(INPUT_FILES.worldBankCountries, "world_bank_countries"),
    ],
    countries,
    by_iso2: byIso2,
    by_iso3: byIso3,
    by_world_bank_code: byWorldBankCode,
  };

  writeFileSync(join(OUTPUT_DIR, "country_registry.generated.json"), JSON.stringify(payload, null, 2), "utf-8");
  console.log(
    `Generated ${payload.stats.merged_countries} countries ` +
      `(${payload.stats.with_world_bank_mapping} with World Bank mappings, ${payload.stats.rtl_countries} RTL).`
  );
}

build();
