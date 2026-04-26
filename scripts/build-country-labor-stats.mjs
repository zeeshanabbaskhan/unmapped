/**
 * Builds config/country_labor_stats.json from:
 *   - data/ilostat/EMP_TEMP_SEX_AGE_ECO_NB_A*.csv  (employment by sector)
 *   - data/ilostat/EMP_TEMP_SEX_AGE_EDU_NB_A*.csv  (employment by education)
 *   - data/ilostat/EAP_TEAP_SEX_AGE_EDU_NB_A*.csv  (labor force by education)
 *   - data/ilostat/EMP_TEMP_SEX_AGE_OCU_NB_A*.csv  (employment by occupation skill level)
 *   - data/wdi_all_countries_full.json              (WDI indicators)
 *   - data/processed/all_country_configs.generated.json (ISO2/ISO3 mapping)
 *
 * Output: config/country_labor_stats.json
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function findCsv(prefix) {
  const dir = join(ROOT, "data", "ilostat");
  if (!existsSync(dir)) return null;
  const match = readdirSync(dir).find(f => f.startsWith(prefix) && f.endsWith(".csv"));
  return match ? join(dir, match) : null;
}

function parseCsv(path) {
  if (!path || !existsSync(path)) return [];
  const lines = readFileSync(path, "utf-8").split("\n");
  const header = lines[0].replace(/"/g, "").split(",");
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = line.replace(/"/g, "").split(",");
    const obj = {};
    for (let j = 0; j < header.length; j++) {
      obj[header[j].trim()] = values[j]?.trim() ?? "";
    }
    rows.push(obj);
  }
  return rows;
}

function readJson(relPath, fallback) {
  const p = join(ROOT, relPath);
  if (!existsSync(p)) return fallback;
  try { return JSON.parse(readFileSync(p, "utf-8")); } catch { return fallback; }
}

// Build ISO3 -> ISO2 mapping from generated configs
const allConfigs = readJson("data/processed/all_country_configs.generated.json", { countries: {} });
const iso3ToIso2 = {};
const iso2ToIso3 = {};
for (const [iso2, cfg] of Object.entries(allConfigs.countries)) {
  if (cfg.iso3) {
    iso3ToIso2[cfg.iso3] = iso2;
    iso2ToIso3[iso2] = cfg.iso3;
  }
}

function toIso2(code) {
  if (!code) return null;
  const upper = code.toUpperCase();
  if (upper.length === 2) return upper;
  if (upper.length === 3) return iso3ToIso2[upper] ?? null;
  return null;
}

// --- Parse ILOSTAT employment by sector ---
console.log("Parsing employment by sector...");
const ecoRows = parseCsv(findCsv("EMP_TEMP_SEX_AGE_ECO_NB_A"));
const sectorByCountry = {};

for (const row of ecoRows) {
  if (row.sex !== "SEX_T") continue;
  if (row.classif1 !== "AGE_YTHADULT_YGE15") continue;
  const iso2 = toIso2(row.ref_area);
  if (!iso2) continue;
  const year = parseInt(row.time);
  const val = parseFloat(row.obs_value);
  if (!year || isNaN(val)) continue;

  if (!sectorByCountry[iso2]) sectorByCountry[iso2] = {};
  const entry = sectorByCountry[iso2];

  if (!entry.year || year > entry.year) {
    entry.year = year;
    entry.total = entry.total ?? null;
    entry.agriculture = entry.agriculture ?? null;
    entry.industry = entry.industry ?? null;
    entry.services = entry.services ?? null;
  }

  if (year === entry.year) {
    const sector = row.classif2;
    if (sector === "ECO_SECTOR_TOTAL") entry.total = val;
    else if (sector === "ECO_SECTOR_AGR") entry.agriculture = val;
    else if (sector === "ECO_SECTOR_IND") entry.industry = val;
    else if (sector === "ECO_SECTOR_SER") entry.services = val;
  }
}

// For each country, re-scan to get the latest year with all sectors
for (const iso2 of Object.keys(sectorByCountry)) {
  const e = sectorByCountry[iso2];
  if (e.total && e.total > 0) {
    e.agriculture_share = e.agriculture ? Number((e.agriculture / e.total).toFixed(4)) : null;
    e.industry_share = e.industry ? Number((e.industry / e.total).toFixed(4)) : null;
    e.services_share = e.services ? Number((e.services / e.total).toFixed(4)) : null;
  }
}
console.log(`  ${Object.keys(sectorByCountry).length} countries with sector data`);

// --- Parse ILOSTAT labor force by education ---
console.log("Parsing labor force by education...");
const eduRows = parseCsv(findCsv("EAP_TEAP_SEX_AGE_EDU_NB_A"));
const eduByCountry = {};

for (const row of eduRows) {
  if (row.sex !== "SEX_T") continue;
  if (row.classif1 !== "AGE_YTHADULT_YGE15") continue;
  const iso2 = toIso2(row.ref_area);
  if (!iso2) continue;
  const year = parseInt(row.time);
  const val = parseFloat(row.obs_value);
  if (!year || isNaN(val)) continue;

  if (!eduByCountry[iso2]) eduByCountry[iso2] = {};
  const entry = eduByCountry[iso2];

  if (!entry.year || year > entry.year) {
    entry.year = year;
    entry.total = null;
    entry.basic = null;
    entry.intermediate = null;
    entry.advanced = null;
  }

  if (year === entry.year) {
    const level = row.classif2;
    if (level === "EDU_AGGREGATE_TOTAL") entry.total = val;
    else if (level === "EDU_AGGREGATE_BAS") entry.basic = val;
    else if (level === "EDU_AGGREGATE_INT") entry.intermediate = val;
    else if (level === "EDU_AGGREGATE_ADV") entry.advanced = val;
  }
}

for (const iso2 of Object.keys(eduByCountry)) {
  const e = eduByCountry[iso2];
  if (e.total && e.total > 0) {
    e.basic_share = e.basic != null ? Number((e.basic / e.total).toFixed(4)) : null;
    e.intermediate_share = e.intermediate != null ? Number((e.intermediate / e.total).toFixed(4)) : null;
    e.advanced_share = e.advanced != null ? Number((e.advanced / e.total).toFixed(4)) : null;
  }
}
console.log(`  ${Object.keys(eduByCountry).length} countries with education data`);

// --- Parse ILOSTAT employment by occupation skill level ---
console.log("Parsing employment by occupation skill level...");
const occRows = parseCsv(findCsv("EMP_TEMP_SEX_AGE_OCU_NB_A"));
const occByCountry = {};

for (const row of occRows) {
  if (row.sex !== "SEX_T") continue;
  if (row.classif1 !== "AGE_YTHADULT_YGE15") continue;
  const iso2 = toIso2(row.ref_area);
  if (!iso2) continue;
  const year = parseInt(row.time);
  const val = parseFloat(row.obs_value);
  if (!year || isNaN(val)) continue;

  if (!occByCountry[iso2]) occByCountry[iso2] = {};
  const entry = occByCountry[iso2];

  if (!entry.year || year > entry.year) {
    entry.year = year;
    entry.total = null;
    entry.skill_high = null;
    entry.skill_mid = null;
    entry.skill_low = null;
  }

  if (year === entry.year) {
    const level = row.classif2;
    if (level === "OCU_SKILL_TOTAL") entry.total = val;
    else if (level === "OCU_SKILL_L3-4" || level === "OCU_SKILL_L4") entry.skill_high = (entry.skill_high ?? 0) + val;
    else if (level === "OCU_SKILL_L2") entry.skill_mid = val;
    else if (level === "OCU_SKILL_L1") entry.skill_low = val;
  }
}

for (const iso2 of Object.keys(occByCountry)) {
  const e = occByCountry[iso2];
  if (e.total && e.total > 0) {
    e.high_skill_share = e.skill_high != null ? Number((e.skill_high / e.total).toFixed(4)) : null;
    e.mid_skill_share = e.skill_mid != null ? Number((e.skill_mid / e.total).toFixed(4)) : null;
    e.low_skill_share = e.skill_low != null ? Number((e.skill_low / e.total).toFixed(4)) : null;
  }
}
console.log(`  ${Object.keys(occByCountry).length} countries with occupation skill level data`);

// --- Load WDI for supplementary indicators ---
console.log("Loading WDI data...");
const wdi = readJson("data/wdi_all_countries_full.json", {});

function getLatestWdi(iso3, indicator) {
  const series = wdi[iso3]?.[indicator];
  if (!series || typeof series !== "object") return null;
  const years = Object.keys(series).map(Number).filter(Number.isFinite).sort((a, b) => b - a);
  if (!years.length) return null;
  const val = Number(series[String(years[0])]);
  return Number.isFinite(val) ? { value: val, year: years[0] } : null;
}

// --- Wage floor data (hardcoded for key countries, from ILO Global Wage Report 2024) ---
const WAGE_FLOORS = {
  GH: { currency: "GHS", monthly_amount: 530, source: "Ghana National Daily Minimum Wage 2024 (GHS 17.67/day x 30)" },
  BD: { currency: "BDT", monthly_amount: 12500, source: "Bangladesh Minimum Wage Board 2023 (garments sector)" },
  NG: { currency: "NGN", monthly_amount: 30000, source: "Nigeria National Minimum Wage Act 2019" },
  KE: { currency: "KES", monthly_amount: 15201, source: "Kenya Labour Institutions Act 2023 (Nairobi)" },
  IN: { currency: "INR", monthly_amount: 6500, source: "India Central Government minimum wage 2024" },
  PK: { currency: "PKR", monthly_amount: 32000, source: "Pakistan Federal Government minimum wage 2024" },
  PH: { currency: "PHP", monthly_amount: 12870, source: "Philippines NCR minimum wage 2024 (PHP 610/day)" },
  ET: { currency: "ETB", monthly_amount: 3000, source: "Ethiopia estimated minimum wage (no statutory national minimum)" },
  TZ: { currency: "TZS", monthly_amount: 250000, source: "Tanzania Wages Order 2024 (agriculture)" },
  UG: { currency: "UGX", monthly_amount: 130000, source: "Uganda statutory minimum wage (2024 estimate)" },
  ZA: { currency: "ZAR", monthly_amount: 5760, source: "South Africa National Minimum Wage 2024 (R27.58/hr)" },
  EG: { currency: "EGP", monthly_amount: 6000, source: "Egypt minimum wage 2024" },
  VN: { currency: "VND", monthly_amount: 4680000, source: "Vietnam Region I minimum wage 2024" },
  ID: { currency: "IDR", monthly_amount: 4900000, source: "Indonesia Jakarta Province UMP 2024" },
  BR: { currency: "BRL", monthly_amount: 1412, source: "Brazil federal minimum wage 2024" },
  MX: { currency: "MXN", monthly_amount: 7468, source: "Mexico daily minimum wage 2024 (248.93/day)" },
  CO: { currency: "COP", monthly_amount: 1300000, source: "Colombia minimum wage 2024" },
  PE: { currency: "PEN", monthly_amount: 1025, source: "Peru minimum wage 2024" },
  MA: { currency: "MAD", monthly_amount: 3111, source: "Morocco SMIG 2024" },
  TH: { currency: "THB", monthly_amount: 9870, source: "Thailand minimum wage 2024 (highest zone)" },
  MY: { currency: "MYR", monthly_amount: 1500, source: "Malaysia minimum wage 2024" },
  LK: { currency: "LKR", monthly_amount: 17500, source: "Sri Lanka minimum wage 2024" },
  NP: { currency: "NPR", monthly_amount: 17300, source: "Nepal minimum wage 2024" },
  MM: { currency: "MMK", monthly_amount: 144000, source: "Myanmar minimum wage 2024 (4800/day)" },
  KH: { currency: "KHR", monthly_amount: 204, source: "Cambodia garments sector minimum wage 2024 (USD 204)" },
  SN: { currency: "XOF", monthly_amount: 58900, source: "Senegal SMIG 2024" },
  CM: { currency: "XAF", monthly_amount: 41875, source: "Cameroon SMIG 2024" },
  CI: { currency: "XOF", monthly_amount: 75000, source: "Cote d'Ivoire SMIG 2024" },
  RW: { currency: "RWF", monthly_amount: 40000, source: "Rwanda estimated minimum (no statutory national)" },
  MZ: { currency: "MZN", monthly_amount: 6050, source: "Mozambique agriculture sector minimum wage 2024" },
  ZM: { currency: "ZMW", monthly_amount: 1698, source: "Zambia minimum wage 2024" },
  MW: { currency: "MWK", monthly_amount: 50000, source: "Malawi minimum wage 2024" },
};

// --- Build final output ---
console.log("Building country_labor_stats.json...");
const allIso2s = new Set([
  ...Object.keys(sectorByCountry),
  ...Object.keys(eduByCountry),
  ...Object.keys(occByCountry),
]);

const countries = {};
let countWithSector = 0;
let countWithWdi = 0;
let countWithWage = 0;

for (const iso2 of allIso2s) {
  const iso3 = iso2ToIso3[iso2];
  const sector = sectorByCountry[iso2];
  const edu = eduByCountry[iso2];
  const occ = occByCountry[iso2];

  const entry = {
    year: sector?.year ?? edu?.year ?? occ?.year ?? null,
  };

  // Employment by sector
  if (sector && sector.agriculture_share != null) {
    entry.employment_by_sector = {
      agriculture_share: sector.agriculture_share,
      industry_share: sector.industry_share,
      services_share: sector.services_share,
    };
    countWithSector++;
  }

  // Labor force by education
  if (edu && edu.total) {
    entry.labor_force_by_education = {
      basic_share: edu.basic_share,
      intermediate_share: edu.intermediate_share,
      advanced_share: edu.advanced_share,
      year: edu.year,
    };
  }

  // Employment by occupation skill level
  if (occ && occ.total) {
    entry.employment_by_skill_level = {
      high_skill_share: occ.high_skill_share,
      mid_skill_share: occ.mid_skill_share,
      low_skill_share: occ.low_skill_share,
      year: occ.year,
    };
  }

  // WDI supplementary indicators
  if (iso3) {
    const yu = getLatestWdi(iso3, "SL.UEM.1524.ZS");
    if (yu) {
      entry.youth_unemployment_rate = {
        rate: Number((yu.value / 100).toFixed(4)),
        age_group: "15-24",
        source: `World Bank WDI SL.UEM.1524.ZS (${yu.year})`,
      };
      countWithWdi++;
    }

    const neet = getLatestWdi(iso3, "SL.UEM.NEET.ZS");
    if (neet) {
      entry.neet_rate = {
        rate: Number((neet.value / 100).toFixed(4)),
        age_group: "15-24",
        source: `World Bank WDI SL.UEM.NEET.ZS (${neet.year})`,
      };
    }

    const gdp = getLatestWdi(iso3, "NY.GDP.PCAP.CD");
    if (gdp) {
      entry.gdp_per_capita = {
        value_usd: Math.round(gdp.value),
        source: `World Bank WDI NY.GDP.PCAP.CD (${gdp.year})`,
      };
    }

    const selfEmp = getLatestWdi(iso3, "SL.EMP.SELF.ZS");
    if (selfEmp) {
      entry.self_employed_pct = {
        rate: Number((selfEmp.value / 100).toFixed(4)),
        source: `World Bank WDI SL.EMP.SELF.ZS (${selfEmp.year})`,
      };
    }

    const empRatio = getLatestWdi(iso3, "SL.EMP.TOTL.SP.ZS");
    if (empRatio) {
      entry.employment_to_population_ratio = {
        rate: Number((empRatio.value / 100).toFixed(4)),
        source: `World Bank WDI SL.EMP.TOTL.SP.ZS (${empRatio.year})`,
      };
    }
  }

  // Wage floor
  if (WAGE_FLOORS[iso2]) {
    entry.wage_floor = WAGE_FLOORS[iso2];
    countWithWage++;
  }

  countries[iso2] = entry;
}

const output = {
  version: "country-labor-stats-v1",
  generated_at: new Date().toISOString(),
  sources: [
    "ILOSTAT EMP_TEMP_SEX_AGE_ECO_NB (employment by sector)",
    "ILOSTAT EAP_TEAP_SEX_AGE_EDU_NB (labor force by education)",
    "ILOSTAT EMP_TEMP_SEX_AGE_OCU_NB (employment by occupation skill level)",
    "World Bank WDI (youth unemployment, NEET, GDP per capita, self-employment, employment ratio)",
    "ILO Global Wage Report + national sources (wage floors)",
  ],
  stats: {
    total_countries: Object.keys(countries).length,
    with_sector_data: countWithSector,
    with_wdi_data: countWithWdi,
    with_wage_floor: countWithWage,
  },
  countries,
};

const outputDir = join(ROOT, "config");
if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
const outputPath = join(outputDir, "country_labor_stats.json");
writeFileSync(outputPath, JSON.stringify(output, null, 2));

console.log(`\nDone! Written to: config/country_labor_stats.json`);
console.log(`  ${output.stats.total_countries} countries`);
console.log(`  ${output.stats.with_sector_data} with sector shares`);
console.log(`  ${output.stats.with_wdi_data} with WDI data`);
console.log(`  ${output.stats.with_wage_floor} with wage floor`);
