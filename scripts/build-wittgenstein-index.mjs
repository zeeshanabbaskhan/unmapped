#!/usr/bin/env node
/**
 * scripts/build-wittgenstein-index.mjs
 *
 * Parses the Wittgenstein Centre (WCDE v3) education-attainment CSV
 * and produces config/wittgenstein_education.json consumable by risk-engine.
 *
 * Input : data/wcde_data (1).csv   (or first wcde*.csv found in data/)
 * Output: config/wittgenstein_education.json
 *
 * Output shape per country (ISO-2):
 *   {
 *     "GH": {
 *       "country_name": "Ghana",
 *       "years": {
 *         "2020": {
 *           "youth_15_24": {
 *             "no_education": 5.2,
 *             "incomplete_primary": 8.1,
 *             "primary": 22.4,
 *             "lower_secondary": 31.0,
 *             "upper_secondary": 25.3,
 *             "post_secondary": 8.0
 *           },
 *           "all_ages": { ... }
 *         }
 *       },
 *       "youth_summary": "62% of youth 15-24 have lower-secondary education or below"
 *     }
 *   }
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ─── find the CSV ──────────────────────────────────────────────────────────────

function findWcdeFile() {
  const dataDir = join(ROOT, "data");
  const candidates = readdirSync(dataDir).filter(
    (f) => f.toLowerCase().startsWith("wcde") && f.endsWith(".csv")
  );
  if (candidates.length === 0) {
    console.error("ERROR: No wcde*.csv file found in data/");
    process.exit(1);
  }
  candidates.sort();
  return join(dataDir, candidates[candidates.length - 1]);
}

const csvPath = findWcdeFile();
console.log("Reading:", csvPath);

// ─── country name → ISO-2 mapping ─────────────────────────────────────────────

const countryRegistryPath = join(ROOT, "data", "processed", "country_registry.generated.json");
const allConfigsPath = join(ROOT, "data", "processed", "all_country_configs.generated.json");

const nameToIso2 = {};

if (existsSync(allConfigsPath)) {
  const allConfigs = JSON.parse(readFileSync(allConfigsPath, "utf-8"));
  for (const [iso2, cfg] of Object.entries(allConfigs.countries || {})) {
    if (cfg.country_name) nameToIso2[cfg.country_name.toLowerCase()] = iso2;
  }
}
if (existsSync(countryRegistryPath)) {
  const reg = JSON.parse(readFileSync(countryRegistryPath, "utf-8"));
  for (const c of reg.countries || []) {
    if (c.country_name && c.iso2) nameToIso2[c.country_name.toLowerCase()] = c.iso2;
  }
}

// Wittgenstein uses full UN names that differ from our registry — add manual aliases
const ALIASES = {
  "bolivia (plurinational state of)": "BO",
  "bonaire, sint eustatius and saba": "BQ",
  "brunei darussalam": "BN",
  "cabo verde": "CV",
  "china, hong kong sar": "HK",
  "china, macao sar": "MO",
  "china, taiwan province of china": "TW",
  "congo": "CG",
  "cote d'ivoire": "CI",
  "côte d'ivoire": "CI",
  "curaçao": "CW",
  "curacao": "CW",
  "czech republic": "CZ",
  "czechia": "CZ",
  "democratic people's republic of korea": "KP",
  "democratic republic of the congo": "CD",
  "eswatini": "SZ",
  "iran (islamic republic of)": "IR",
  "lao people's democratic republic": "LA",
  "micronesia (federated states of)": "FM",
  "moldova (republic of)": "MD",
  "republic of moldova": "MD",
  "republic of korea": "KR",
  "russian federation": "RU",
  "são tomé and príncipe": "ST",
  "sao tome and principe": "ST",
  "sint maarten (dutch part)": "SX",
  "state of palestine": "PS",
  "syrian arab republic": "SY",
  "timor-leste": "TL",
  "türkiye": "TR",
  "turkey": "TR",
  "united arab emirates": "AE",
  "united kingdom of great britain and northern ireland": "GB",
  "united republic of tanzania": "TZ",
  "united states of america": "US",
  "united states virgin islands": "VI",
  "venezuela (bolivarian republic of)": "VE",
  "viet nam": "VN",
  "west bank and gaza strip": "PS",
  "western sahara": "EH",
};

for (const [name, iso2] of Object.entries(ALIASES)) {
  nameToIso2[name.toLowerCase()] = iso2;
}

function toIso2(areaName) {
  const lower = areaName.toLowerCase().trim();
  if (nameToIso2[lower]) return nameToIso2[lower];
  // try removing parenthetical
  const noParen = lower.replace(/\s*\(.*?\)\s*/g, "").trim();
  if (nameToIso2[noParen]) return nameToIso2[noParen];
  return null;
}

// ─── parse CSV ─────────────────────────────────────────────────────────────────

const raw = readFileSync(csvPath, "utf-8");
const lines = raw.split("\n");

// Find the header line (contains "Area","Year",...)
const headerIdx = lines.findIndex((l) => l.includes('"Area"') && l.includes('"Year"'));
if (headerIdx < 0) {
  console.error("ERROR: Could not find header row in CSV");
  process.exit(1);
}

console.log("Header at line:", headerIdx);
console.log("Header:", lines[headerIdx].trim());
console.log("Total data lines:", lines.length - headerIdx - 1);

// Normalize education level names
function normalizeEdu(edu) {
  const e = edu.toLowerCase().trim();
  if (e === "no education") return "no_education";
  if (e === "incomplete primary") return "incomplete_primary";
  if (e === "primary") return "primary";
  if (e === "lower secondary") return "lower_secondary";
  if (e === "upper secondary") return "upper_secondary";
  if (e === "post secondary" || e === "post-secondary") return "post_secondary";
  if (e === "short post secondary" || e === "short post-secondary") return "short_post_secondary";
  if (e === "bachelor") return "bachelor";
  if (e === "master and higher" || e === "master or higher") return "master_and_higher";
  return e.replace(/[^a-z0-9]+/g, "_");
}

// Youth age bands we care about
const YOUTH_AGES = new Set(["15--19", "20--24"]);
const YOUNG_ADULT_AGES = new Set(["15--19", "20--24", "25--29"]);

// data[iso2][year][ageGroup][eduLevel] = value
const data = {};
const countryNames = {};
const eduLevels = new Set();
const years = new Set();
let skippedRegions = 0;
let matched = 0;

for (let i = headerIdx + 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;

  // Parse CSV with quoted fields
  const parts = [];
  let current = "";
  let inQuote = false;
  for (let c = 0; c < line.length; c++) {
    const ch = line[c];
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === "," && !inQuote) {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current.trim());

  if (parts.length < 5) continue;

  const [area, yearStr, age, education, valueStr] = parts;
  const year = yearStr;
  const value = parseFloat(valueStr);
  if (isNaN(value)) continue;

  // Skip aggregate regions
  if (
    area.toLowerCase() === "world" ||
    area.toLowerCase() === "africa" ||
    area.toLowerCase().includes("more developed") ||
    area.toLowerCase().includes("less developed") ||
    area.toLowerCase().includes("least developed")
  ) {
    skippedRegions++;
    continue;
  }

  const iso2 = toIso2(area);
  if (!iso2) {
    // only warn once per unknown area
    if (!countryNames["_unknown_" + area]) {
      countryNames["_unknown_" + area] = true;
      // console.warn("  Unknown area:", area);
    }
    skippedRegions++;
    continue;
  }

  matched++;
  countryNames[iso2] = area;
  years.add(year);
  const edu = normalizeEdu(education);
  eduLevels.add(edu);

  if (!data[iso2]) data[iso2] = {};
  if (!data[iso2][year]) data[iso2][year] = { youth: {}, young_adult: {}, all: {} };

  const yearData = data[iso2][year];

  // Accumulate into age groups (we average later)
  if (YOUTH_AGES.has(age)) {
    yearData.youth[edu] = (yearData.youth[edu] || []);
    yearData.youth[edu].push(value);
  }
  if (YOUNG_ADULT_AGES.has(age)) {
    yearData.young_adult[edu] = (yearData.young_adult[edu] || []);
    yearData.young_adult[edu].push(value);
  }
  yearData.all[edu] = (yearData.all[edu] || []);
  yearData.all[edu].push(value);
}

console.log("\nMatched rows:", matched);
console.log("Skipped regions:", skippedRegions);
console.log("Countries:", Object.keys(data).length);
console.log("Years:", [...years].sort());
console.log("Education levels:", [...eduLevels]);

// ─── build output ──────────────────────────────────────────────────────────────

function avg(arr) {
  if (!arr || arr.length === 0) return 0;
  return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100;
}

function buildDistribution(eduMap) {
  const result = {};
  for (const [edu, values] of Object.entries(eduMap)) {
    result[edu] = avg(values);
  }
  return result;
}

function youthSummary(dist) {
  const lowEdu =
    (dist.no_education || 0) +
    (dist.incomplete_primary || 0) +
    (dist.primary || 0) +
    (dist.lower_secondary || 0);
  const rounded = Math.round(lowEdu);
  if (rounded >= 50) {
    return `${rounded}% of youth (15-24) have lower-secondary education or below — significant upskilling needed`;
  } else if (rounded >= 30) {
    return `${rounded}% of youth (15-24) have lower-secondary education or below — moderate upskilling gap`;
  } else {
    return `${rounded}% of youth (15-24) have lower-secondary education or below — relatively well-educated youth cohort`;
  }
}

const output = {};

for (const [iso2, yearMap] of Object.entries(data)) {
  const entry = {
    country_name: countryNames[iso2] || iso2,
    years: {},
  };

  for (const [year, ageData] of Object.entries(yearMap)) {
    entry.years[year] = {
      youth_15_24: buildDistribution(ageData.youth),
      young_adult_15_29: buildDistribution(ageData.young_adult),
    };
  }

  // Build summary from most recent year
  const sortedYears = Object.keys(yearMap).sort();
  const latestYear = sortedYears[sortedYears.length - 1];
  const youthDist = entry.years[latestYear]?.youth_15_24 || {};
  entry.youth_summary = youthSummary(youthDist);

  // If we have multiple years, add trend
  if (sortedYears.length >= 2) {
    const firstYear = sortedYears[0];
    const firstDist = entry.years[firstYear]?.youth_15_24 || {};
    const latestDist = entry.years[latestYear]?.youth_15_24 || {};
    const firstLow =
      (firstDist.no_education || 0) + (firstDist.incomplete_primary || 0) + (firstDist.primary || 0);
    const latestLow =
      (latestDist.no_education || 0) + (latestDist.incomplete_primary || 0) + (latestDist.primary || 0);
    const delta = Math.round((latestLow - firstLow) * 10) / 10;
    if (delta < -2) {
      entry.education_trend = `improving: low-education youth share fell ${Math.abs(delta)}pp from ${firstYear} to ${latestYear}`;
    } else if (delta > 2) {
      entry.education_trend = `worsening: low-education youth share rose ${delta}pp from ${firstYear} to ${latestYear}`;
    } else {
      entry.education_trend = `stable between ${firstYear} and ${latestYear}`;
    }
  }

  output[iso2] = entry;
}

const final = {
  version: "wittgenstein-education-v1",
  generated_at: new Date().toISOString(),
  scenario: "SSP2 (Medium)",
  source: "Wittgenstein Centre for Demography and Global Human Capital (2023), WCDE v3.0",
  source_url: "http://dataexplorer.wittgensteincentre.org/wcde-v3/",
  stats: {
    countries: Object.keys(output).length,
    years: [...years].sort(),
    education_levels: [...eduLevels].sort(),
  },
  countries: output,
};

const outDir = join(ROOT, "config");
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "wittgenstein_education.json");
writeFileSync(outPath, JSON.stringify(final, null, 2));
console.log("\nWrote:", outPath);
console.log("Countries:", Object.keys(output).length);

// Show samples
for (const cc of ["GH", "BD", "US", "SN"]) {
  if (output[cc]) {
    console.log(`\n--- ${cc} (${output[cc].country_name}) ---`);
    console.log("Summary:", output[cc].youth_summary);
    const firstYear = Object.keys(output[cc].years)[0];
    if (firstYear) {
      console.log(`Youth 15-24 (${firstYear}):`, JSON.stringify(output[cc].years[firstYear].youth_15_24));
    }
  }
}
