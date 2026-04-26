import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..", "..", "..");

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(root, relativePath), "utf-8"));
}

const taxonomyIndex = readJson("data/processed/module1_taxonomy_index.json");
const localInformalSkills = readJson("config/local_informal_skills.json");
const sourceRegistry = readJson("data/processed/source_registry.generated.json");
const countryRegistry = readJson("data/processed/country_registry.generated.json");

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

export function getCountry(countryCode = "GH") {
  return (
    countryRegistry.by_iso2[countryCode] ??
    countryRegistry.by_iso3[countryCode] ??
    countryRegistry.by_iso2.GH
  );
}

export function getSupportedCountries() {
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
