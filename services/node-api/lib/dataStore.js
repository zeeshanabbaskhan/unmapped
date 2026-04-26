import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getAllCountrySummaries,
  getConfigLoaderStats,
  resolveConfig,
} from "./configLoader.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..", "..", "..");

function readJson(relativePath, fallback = {}) {
  const absolutePath = join(root, relativePath);
  if (!existsSync(absolutePath)) return fallback;
  try {
    return JSON.parse(readFileSync(absolutePath, "utf-8"));
  } catch {
    return fallback;
  }
}

const taxonomyIndex = readJson("data/processed/module1_taxonomy_index.json", {
  version: "missing",
  generated_at: null,
  stats: {},
  onet_stats: {},
  note: "Taxonomy index not found. Rebuild generated data files.",
  by_sector: {},
  occupations: {},
});
const localInformalSkills = readJson("config/local_informal_skills.json", { skills: [] });
const sourceRegistry = readJson("data/processed/source_registry.generated.json", { sources: [] });
const countryRegistry = readJson("data/processed/country_registry.generated.json", {
  version: "missing",
  generated_at: null,
  stats: {},
  sources: [],
  countries: [],
  by_iso2: {},
  by_iso3: {},
});

const sectorLabels = {
  technical_services: "Technical services",
  retail_trade: "Retail / trade",
  construction_manufacturing_transport: "Construction, manufacturing, and transport",
  garments_craft: "Garments / craft",
  agriculture: "Agriculture",
  food_hospitality: "Food / hospitality",
  personal_services: "Personal services",
  professional_services: "Professional services",
  other: "Other",
};

let cachedIntakeOptions;

/**
 * Returns the fully resolved country config (generated base + manual overrides).
 * Accepts ISO-2 (GH) or ISO-3 (GHA) codes. Falls back to legacy country registry
 * if the config loader has no entry for the code.
 */
export function getCountry(countryCode = "GH") {
  const resolved = resolveConfig(countryCode);
  if (resolved && resolved.country_code) return resolved;

  // Legacy fallback — country_registry.generated.json
  return (
    countryRegistry.by_iso2[countryCode] ??
    countryRegistry.by_iso3[countryCode] ??
    countryRegistry.by_iso2.GH ??
    { country_code: "GH", country_name: "Ghana", default_city: "Accra", education_levels: [] }
  );
}

/** Full resolved config (same as getCountry, explicit name for clarity). */
export function getFullConfig(countryCode = "GH") {
  return resolveConfig(countryCode);
}

/**
 * Returns a lean list of all supported countries.
 * Uses configLoader when available (200+ countries), falls back to country registry.
 */
export function getSupportedCountries() {
  const summaries = getAllCountrySummaries();
  if (summaries.length > 0) return summaries;

  // Legacy fallback
  return countryRegistry.countries.map((country) => ({
    country_code: country.country_code,
    iso2: country.iso2,
    iso3: country.iso3,
    country_name: country.country_name,
    default_city: country.default_city,
    currency: country.currency,
    supported_languages: country.supported_languages,
    language: country.language,
    geography: country.geography,
    world_bank: country.world_bank,
    data_adapters: country.data_adapters,
  }));
}

export function getConfigStats() {
  return getConfigLoaderStats();
}

export function getGeneratedCountryConfig(countryCode) {
  if (!countryCode) return null;
  const code = String(countryCode).toUpperCase().trim().slice(0, 3);
  const genPath = join(root, "config", "generated", "countries", `${code.slice(0, 2)}.json`);
  if (!existsSync(genPath)) return null;
  try { return JSON.parse(readFileSync(genPath, "utf-8")); } catch { return null; }
}

export function getOpportunitiesConfig(countryCode) {
  if (!countryCode) return null;
  const code = String(countryCode).toUpperCase().trim().slice(0, 2);
  const manualPath = join(root, "config", "opportunities", `${code}.json`);
  if (existsSync(manualPath)) {
    try { return JSON.parse(readFileSync(manualPath, "utf-8")); } catch { /* fall through */ }
  }
  const genPath = join(root, "config", "generated", "opportunities", `${code}.json`);
  if (existsSync(genPath)) {
    try { return JSON.parse(readFileSync(genPath, "utf-8")); } catch { /* fall through */ }
  }
  return null;
}

export function getI18nStrings(locale = "en") {
  const i18nPath = join(root, "config", "i18n", `${locale}.json`);
  if (!existsSync(i18nPath)) return {};
  try { return JSON.parse(readFileSync(i18nPath, "utf-8")); } catch { return {}; }
}

export function getTaxonomyIndex() {
  return taxonomyIndex;
}

export function getLocalInformalSkills() {
  return localInformalSkills.skills;
}

export function getSourceRegistry() {
  return sourceRegistry;
}

export function getModule1Metadata() {
  return {
    index_version: taxonomyIndex.version,
    generated_at: taxonomyIndex.generated_at,
    stats: taxonomyIndex.stats,
    onet_stats: taxonomyIndex.onet_stats,
    country_registry: {
      version: countryRegistry.version,
      generated_at: countryRegistry.generated_at,
      stats: countryRegistry.stats,
      sources: countryRegistry.sources,
    },
    sources: sourceRegistry.sources,
    note: taxonomyIndex.note,
  };
}

function increment(map, key, value) {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + value);
}

function buildIntakeOptions() {
  const sectors = Object.entries(taxonomyIndex.by_sector)
    .map(([id, occupationIds]) => ({
      id,
      label: sectorLabels[id] ?? id.replaceAll("_", " "),
      occupation_count: occupationIds.length,
    }))
    .sort((a, b) => b.occupation_count - a.occupation_count);

  const skillsBySector = {};
  const toolsBySector = {};

  for (const sector of sectors) {
    const skillCounts = new Map();
    const toolCounts = new Map();
    const occupationIds = taxonomyIndex.by_sector[sector.id] ?? [];

    for (const occupationId of occupationIds) {
      const occupation = taxonomyIndex.occupations[occupationId];
      if (!occupation) continue;

      for (const skill of occupation.essential_skills ?? []) {
        increment(skillCounts, skill.plain_label || skill.label, 3);
      }
      for (const skill of occupation.optional_skills ?? []) {
        increment(skillCounts, skill.plain_label || skill.label, 1);
      }
      for (const enrichment of occupation.onet?.enrichments ?? []) {
        for (const tool of enrichment.tools ?? []) {
          increment(toolCounts, tool.example || tool.commodity_title, 2);
          increment(toolCounts, tool.commodity_title, 1);
        }
        for (const technology of enrichment.technology_skills ?? []) {
          increment(toolCounts, technology.example, 2);
          increment(toolCounts, technology.commodity_title, 1);
        }
      }
    }

    skillsBySector[sector.id] = [...skillCounts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

    toolsBySector[sector.id] = [...toolCounts.entries()]
      .filter(([label]) => label && label.length <= 80)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }

  return {
    generated_at: taxonomyIndex.generated_at,
    sectors,
    skills_by_sector: skillsBySector,
    tools_by_sector: toolsBySector,
  };
}

export function getIntakeOptions({ sector, limit = "all" } = {}) {
  cachedIntakeOptions ??= buildIntakeOptions();
  const sectorAliases = {
    construction: "construction_manufacturing_transport",
    transport: "construction_manufacturing_transport",
    garments: "garments_craft",
    food_services: "food_hospitality",
  };
  const selectedSector = sectorAliases[sector] || sector || cachedIntakeOptions.sectors[0]?.id || "technical_services";
  const maxItems = limit === "all" ? Number.POSITIVE_INFINITY : Number(limit) || 200;

  return {
    generated_at: cachedIntakeOptions.generated_at,
    sectors: cachedIntakeOptions.sectors,
    selected_sector: selectedSector,
    skills: (cachedIntakeOptions.skills_by_sector[selectedSector] ?? []).slice(0, maxItems),
    tools: (cachedIntakeOptions.tools_by_sector[selectedSector] ?? []).slice(0, maxItems),
    total_skills_for_sector: cachedIntakeOptions.skills_by_sector[selectedSector]?.length ?? 0,
    total_tools_for_sector: cachedIntakeOptions.tools_by_sector[selectedSector]?.length ?? 0,
  };
}
