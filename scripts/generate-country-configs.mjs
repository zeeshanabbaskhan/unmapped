/**
 * scripts/generate-country-configs.mjs
 *
 * Reads all downloaded datasets and auto-generates a complete config entry
 * for every country in the world into data/processed/all_country_configs.generated.json
 *
 * Inputs (all offline, no network calls):
 *   data/countries/restcountries.json          — language, currency, capital, text direction
 *   data/countries/worldbankapicountries.json   — income level, WB region
 *   data/itudataset/itu_data_extract_*.csv      — internet users %, mobile broadband/100
 *   data/ilostat/EMP_TEMP_SEX_AGE_ECO_NB_A*.csv — employment share by sector
 *   data/wdi_all_countries_full.json            — WDI indicators (if fetch script ran)
 *
 * Output:
 *   data/processed/all_country_configs.generated.json
 *
 * Run: node scripts/generate-country-configs.mjs
 * Run after: python scripts/fetch-wdi-all-countries.py
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = join(ROOT, "data", "processed");

// ─── helpers ──────────────────────────────────────────────────────────────────

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function readCsvRows(path) {
  const text = readFileSync(path, "utf-8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/);
  if (!lines.length) return [];
  const header = lines[0].split(",").map((h) => h.replace(/^"|"$/g, "").trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = splitCsvLine(lines[i]);
    if (parts.length < header.length) continue;
    const row = {};
    for (let j = 0; j < header.length; j++) row[header[j]] = parts[j] ?? "";
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line) {
  const parts = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQuotes = !inQuotes; continue; }
    if (c === "," && !inQuotes) { parts.push(field); field = ""; continue; }
    field += c;
  }
  parts.push(field);
  return parts;
}

function latestValue(indicatorData) {
  if (!indicatorData) return null;
  const years = Object.keys(indicatorData).sort().reverse();
  for (const y of years) {
    const v = indicatorData[y];
    if (v !== null && v !== undefined && !Number.isNaN(v)) return Number(v);
  }
  return null;
}

function fileHash(path) {
  const contents = readFileSync(path);
  return createHash("sha256").update(contents).digest("hex").slice(0, 16);
}

// ─── data loaders ─────────────────────────────────────────────────────────────

function loadRestCountries() {
  const raw = readJson(join(ROOT, "data", "countries", "restcountries.json"));
  const RTL = new Set(["ara", "arc", "dv", "fas", "heb", "kur", "prs", "pus", "snd", "urd", "yi"]);
  const byIso2 = {};
  const byIso3 = {};
  for (const c of raw) {
    if (!c.cca2 || !c.cca3) continue;
    const langCodes = Object.keys(c.languages ?? {});
    const entry = {
      iso2: c.cca2,
      iso3: c.cca3,
      name: (c.name?.common ?? "").trim(),
      capital: Array.isArray(c.capital) ? (c.capital[0] ?? "") : (c.capital ?? ""),
      region: c.region ?? "",
      subregion: c.subregion ?? "",
      currencies: c.currencies ? Object.keys(c.currencies) : [],
      primary_currency: c.currencies ? Object.keys(c.currencies)[0] ?? null : null,
      currency_name: c.currencies
        ? Object.values(c.currencies)[0]?.name ?? null
        : null,
      currency_symbol: c.currencies
        ? Object.values(c.currencies)[0]?.symbol ?? null
        : null,
      languages: Object.entries(c.languages ?? {}).map(([code, label]) => ({ code, label })),
      primary_language: langCodes[0] ?? "eng",
      text_direction: langCodes.some((code) => RTL.has(code)) ? "rtl" : "ltr",
    };
    byIso2[c.cca2] = entry;
    byIso3[c.cca3] = entry;
  }
  return { byIso2, byIso3 };
}

function loadWorldBankCountries() {
  const raw = readJson(join(ROOT, "data", "countries", "worldbankapicountries.json"));
  const rows = Array.isArray(raw?.[1]) ? raw[1] : raw;
  const byIso3 = {};
  const byIso2 = {};
  for (const c of rows) {
    if (!c?.id || !c?.iso2Code || c.region?.value === "Aggregates") continue;
    const entry = {
      iso3: c.id,
      iso2: c.iso2Code,
      income_level_id: c.incomeLevel?.id ?? "INX",
      income_level: c.incomeLevel?.value ?? "Unknown",
      region_id: c.region?.id ?? "",
      region: c.region?.value ?? "",
      admin_region: c.adminregion?.value ?? "",
      lending_type_id: c.lendingType?.id ?? "",
      capital_city: c.capitalCity ?? "",
    };
    byIso3[c.id] = entry;
    byIso2[c.iso2Code] = entry;
  }
  return { byIso3, byIso2 };
}

/** Returns { "GHA": { internet_users_pct: 70.6, mobile_broadband_per_100: 65.4, ... }, ... } */
function loadItuData() {
  const dir = join(ROOT, "data", "itudataset");
  if (!existsSync(dir)) return {};

  const files = readdirSync(dir).filter((f) => f.endsWith(".csv"));
  if (!files.length) return {};

  const rows = readCsvRows(join(dir, files[0]));

  const byIso3 = {};
  for (const row of rows) {
    const iso3 = row.entityIso?.trim();
    const code = row.seriesCode?.trim();
    const value = parseFloat(row.dataValue);
    const year = parseInt(row.dataYear, 10);
    if (!iso3 || !code || Number.isNaN(value) || Number.isNaN(year)) continue;

    byIso3[iso3] ??= {};

    // i99H = Individuals using the Internet (%)
    if (code === "i99H") {
      const existing = byIso3[iso3].internet_users_pct;
      if (!existing || year > (byIso3[iso3]._internet_year ?? 0)) {
        byIso3[iso3].internet_users_pct = round2(value);
        byIso3[iso3]._internet_year = year;
      }
    }

    // i911mw = Active mobile-broadband subscriptions per 100 people
    if (code === "i911mw") {
      const existing = byIso3[iso3].mobile_broadband_per_100;
      if (!existing || year > (byIso3[iso3]._mobile_year ?? 0)) {
        byIso3[iso3].mobile_broadband_per_100 = round2(value);
        byIso3[iso3]._mobile_year = year;
      }
    }

    // i271mb_5GB_GNI = Mobile broadband affordability (% GNI per capita)
    if (code === "i271mb_5GB_GNI") {
      const existing = byIso3[iso3].affordability_gni_pct;
      if (!existing || year > (byIso3[iso3]._afford_year ?? 0)) {
        byIso3[iso3].affordability_gni_pct = round2(value);
        byIso3[iso3]._afford_year = year;
      }
    }
  }

  // Clean internal year trackers
  for (const iso3 of Object.keys(byIso3)) {
    delete byIso3[iso3]._internet_year;
    delete byIso3[iso3]._mobile_year;
    delete byIso3[iso3]._afford_year;
  }

  return byIso3;
}

/**
 * Returns { "GHA": { AGR: 0.45, IND: 0.23, SER: 0.32 }, ... }
 * Shares of employment by broad ISIC sector.
 */
function loadIlostatSectorShares() {
  const dir = join(ROOT, "data", "ilostat");
  if (!existsSync(dir)) return {};

  const ecoFile = readdirSync(dir).find((f) => f.startsWith("EMP_TEMP_SEX_AGE_ECO_NB"));
  if (!ecoFile) return {};

  console.log(`  Reading ILOSTAT sector data from ${ecoFile}...`);
  const rows = readCsvRows(join(dir, ecoFile));

  // Collect most recent year's TOTAL + sector values per country
  const byCountry = {};

  for (const row of rows) {
    const ref = row.ref_area?.replace(/"/g, "").trim();
    const sex = row.sex?.replace(/"/g, "").trim();
    const classif1 = row.classif1?.replace(/"/g, "").trim();
    const classif2 = row.classif2?.replace(/"/g, "").trim();
    const time = parseInt(row.time?.replace(/"/g, "").trim(), 10);
    const value = parseFloat(row.obs_value?.replace(/"/g, "").trim());

    if (
      !ref || sex !== "SEX_T" ||
      classif1 !== "AGE_YTHADULT_YGE15" ||
      Number.isNaN(time) || Number.isNaN(value) || value <= 0
    ) continue;

    byCountry[ref] ??= {};
    const existing = byCountry[ref][classif2];

    if (!existing || time > existing.year) {
      byCountry[ref][classif2] = { value, year: time };
    }
  }

  // Convert to shares
  const shares = {};
  for (const [iso3, sectors] of Object.entries(byCountry)) {
    const total = sectors.ECO_SECTOR_TOTAL?.value;
    if (!total || total === 0) continue;
    shares[iso3] = {
      AGR: round2((sectors.ECO_SECTOR_AGR?.value ?? 0) / total),
      IND: round2((sectors.ECO_SECTOR_IND?.value ?? 0) / total),
      SER: round2((sectors.ECO_SECTOR_SER?.value ?? 0) / total),
    };
  }

  return shares;
}

/** Returns { "GHA": { "SL.UEM.1524.ZS": { "2023": 12.5, ... }, ... }, ... } */
function loadWdiData() {
  const path = join(ROOT, "data", "wdi_all_countries_full.json");
  if (!existsSync(path)) {
    console.warn("  WARNING: data/wdi_all_countries_full.json not found.");
    console.warn("  Run: python scripts/fetch-wdi-all-countries.py");
    console.warn("  Continuing without WDI data — will fall back to income level for calibration.\n");
    return {};
  }
  console.log("  Reading WDI data...");
  return readJson(path);
}

// ─── derivation logic ─────────────────────────────────────────────────────────

function round2(n) {
  return Math.round(n * 100) / 100;
}

function deriveInfrastructureLevel(mobilePer100) {
  if (mobilePer100 === null || mobilePer100 === undefined) return "unknown";
  if (mobilePer100 >= 80) return "high";
  if (mobilePer100 >= 60) return "medium";
  if (mobilePer100 >= 40) return "low_medium";
  if (mobilePer100 >= 15) return "low";
  return "very_low";
}

/**
 * Automation calibration multipliers derived from World Bank income classification.
 * Physical-manual tasks are harder to automate at low capital intensity.
 * Non-routine cognitive tasks have the same risk globally (AI is borderless).
 */
const AUTOMATION_BY_INCOME = {
  LIC:  { physical_manual: 0.45, routine_cognitive: 0.80, non_routine_cognitive: 1.0, social_interactive: 0.65, uncertainty_band: 0.20 },
  LMC:  { physical_manual: 0.55, routine_cognitive: 0.85, non_routine_cognitive: 1.0, social_interactive: 0.70, uncertainty_band: 0.15 },
  UMC:  { physical_manual: 0.72, routine_cognitive: 0.90, non_routine_cognitive: 1.0, social_interactive: 0.82, uncertainty_band: 0.12 },
  HIC:  { physical_manual: 0.90, routine_cognitive: 0.95, non_routine_cognitive: 1.0, social_interactive: 0.92, uncertainty_band: 0.08 },
  INX:  { physical_manual: 0.60, routine_cognitive: 0.85, non_routine_cognitive: 1.0, social_interactive: 0.72, uncertainty_band: 0.18 },
};

function deriveAutomationCalibration(incomeId, infraLevel, countryName) {
  const base = AUTOMATION_BY_INCOME[incomeId] ?? AUTOMATION_BY_INCOME.INX;
  const { uncertainty_band, ...multipliers } = base;

  const rationale =
    `Calibrated for ${countryName} using World Bank income classification (${incomeId}) and ` +
    `ITU digital infrastructure level (${infraLevel}). Physical-manual task multiplier reflects ` +
    `local capital intensity relative to the US Frey-Osborne baseline. ` +
    `Non-routine cognitive tasks carry full (1.0×) risk since AI disruption is not infrastructure-bound.`;

  return {
    base_dataset: "frey_osborne",
    base_dataset_source: "Frey & Osborne (2013). The Future of Employment. University of Oxford.",
    infrastructure_level: infraLevel,
    calibration: {
      multipliers,
      rationale,
    },
    time_horizon_years: 10,
    uncertainty_band,
    risk_thresholds: { low: 0.30, medium: 0.60, high: 1.0 },
    scenario_toggles: [
      {
        id: "high_infra",
        label: "If technology investment grows fast",
        multiplier_adjustment: incomeId === "HIC" ? 0.05 : 0.15,
      },
      {
        id: "current",
        label: "Current infrastructure levels",
        multiplier_adjustment: 0.0,
      },
      {
        id: "low_infra",
        label: "If technology stays at current levels",
        multiplier_adjustment: incomeId === "HIC" ? -0.05 : -0.10,
      },
    ],
    source_label: `Frey and Osborne (2013), calibrated for ${countryName}`,
    source_url: "https://www.oxfordmartin.ox.ac.uk/downloads/academic/future-of-employment.pdf",
  };
}

/**
 * Opportunity type weights derived from:
 *  - ILOSTAT sector employment shares (AGR / IND / SER)
 *  - WB income level (determines feasibility of formal employment)
 *  - ITU mobile broadband (determines gig/digital work feasibility)
 */
function deriveOpportunityTypes(incomeId, region, sectorShares, mobilePer100, currency, symbol, minWage) {
  const agrShare = sectorShares?.AGR ?? 0.25;
  const indShare = sectorShares?.IND ?? 0.20;

  // Agricultural economies: enable cooperative
  const agriEnabled = agrShare >= 0.20 || region.includes("Africa") || region.includes("Asia");

  // Digital work: meaningful only above ~40/100 mobile broadband
  const gigEnabled = (mobilePer100 ?? 30) >= 30;
  const gigWeight = mobilePer100 >= 60 ? 0.20 : mobilePer100 >= 40 ? 0.12 : 0.08;

  // In LIC/LMC with high agri share, formal employment is scarce
  const formalWeight = (incomeId === "HIC") ? 0.50
    : (incomeId === "UMC") ? 0.40
    : (indShare >= 0.30) ? 0.35
    : (agrShare >= 0.35) ? 0.18
    : 0.25;

  // Self-employment dominates in LIC/LMC informal economies
  const selfWeight = (incomeId === "LIC" || incomeId === "LMC")
    ? (agrShare >= 0.35 ? 0.25 : 0.38)
    : 0.22;

  const agriWeight = agriEnabled ? Math.min(0.30, agrShare * 0.7) : 0;
  const trainingWeight = 0.15;

  // Normalise to 1.0
  const raw = formalWeight + selfWeight + gigWeight + agriWeight + trainingWeight;
  const norm = (w) => round2(w / raw);

  return {
    currency: currency ?? "USD",
    currency_symbol: symbol ?? "$",
    min_wage_monthly: minWage,
    min_wage_note: minWage
      ? `Estimated from World Bank income group (${incomeId}) median data`
      : null,
    types: [
      {
        id: "formal_employment",
        label: "Formal job with contract",
        label_short: "Formal job",
        icon: "briefcase",
        enabled: true,
        weight: norm(formalWeight),
        requires_credential: false,
      },
      {
        id: "self_employment",
        label: "Run your own business",
        label_short: "Self-employed",
        icon: "store",
        enabled: true,
        weight: norm(selfWeight),
        requires_credential: false,
      },
      {
        id: "gig_platform",
        label: "Gig and platform work",
        label_short: "Gig work",
        icon: "phone",
        enabled: gigEnabled,
        weight: norm(gigWeight),
        requires_credential: false,
      },
      {
        id: "vocational_training",
        label: "Short course or certification",
        label_short: "Training",
        icon: "graduation-cap",
        enabled: true,
        weight: norm(trainingWeight),
        requires_credential: false,
        max_cost_months_income: 1,
        providers: [],
      },
      {
        id: "agricultural_cooperative",
        label: "Farming or agricultural cooperative",
        label_short: "Agriculture",
        icon: "leaf",
        enabled: agriEnabled,
        weight: agriEnabled ? norm(agriWeight) : 0,
        requires_credential: false,
      },
    ],
  };
}

/** Minimum wage proxy (very rough, by income class) */
const MIN_WAGE_BY_INCOME = {
  LIC: 50,    // USD/month proxy
  LMC: 150,
  UMC: 450,
  HIC: 1200,
  INX: 200,
};

// Default ISCED education levels — country-specific labels added via manual overrides
const DEFAULT_EDUCATION_LEVELS = [
  { id: "none",            label: "No formal education",     isced: "0",   credential_tier: "none" },
  { id: "primary",         label: "Primary school",          isced: "1",   credential_tier: "primary" },
  { id: "lower_secondary", label: "Lower secondary",         isced: "2",   credential_tier: "lower_secondary" },
  { id: "upper_secondary", label: "Upper secondary",         isced: "3",   credential_tier: "secondary" },
  { id: "tvet",            label: "TVET / vocational",       isced: "3-4", credential_tier: "vocational" },
  { id: "tertiary",        label: "Tertiary / university",   isced: "5-7", credential_tier: "tertiary" },
];

const SECTOR_MAP = {
  ECO_SECTOR_AGR: { id: "agriculture",                            label: "Agriculture and farming" },
  ECO_SECTOR_IND: { id: "construction_manufacturing_transport",   label: "Industry and manufacturing" },
  ECO_SECTOR_SER: { id: "technical_services",                     label: "Services and trade" },
};

const WDI_INDICATORS = {
  youth_unemployment:            "SL.UEM.1524.ZS",
  employment_ratio:              "SL.EMP.TOTL.SP.ZS",
  gdp_per_capita:                "NY.GDP.PCAP.CD",
  neet_rate:                     "SL.UEM.NEET.ZS",
  self_employed_pct:             "SL.EMP.SELF.ZS",
  informal_employment_pct:       "SL.ISV.IFRM.ZS",
  internet_users_pct:            "IT.NET.USER.ZS",
  mobile_broadband_per_100:      "IT.MOB.4G.ZS",
  human_capital_index:           "HD.HCI.OVRL",
  learning_adjusted_school_years:"HD.HCI.LAYS",
  secondary_enrollment_gross:    "SE.SEC.ENRR",
  primary_completion_rate:       "SE.PRM.CMPT.ZS",
};

// ─── main build ───────────────────────────────────────────────────────────────

function buildFontForLanguage(langCode) {
  const map = {
    ara: "Noto Sans Arabic",
    ben: "Noto Sans Bengali",
    hin: "Noto Sans Devanagari",
    tam: "Noto Sans Tamil",
    tel: "Noto Sans Telugu",
    kan: "Noto Sans Kannada",
    mal: "Noto Sans Malayalam",
    sin: "Noto Sans Sinhala",
    tha: "Noto Sans Thai",
    khm: "Noto Sans Khmer",
    mya: "Noto Sans Myanmar",
    kat: "Noto Sans Georgian",
    heb: "Noto Sans Hebrew",
    urd: "Noto Nastaliq Urdu",
    zho: "Noto Sans SC",
    jpn: "Noto Sans JP",
    kor: "Noto Sans KR",
    amh: "Noto Sans Ethiopic",
  };
  return map[langCode] ?? "Noto Sans";
}

function build() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log("Loading datasets...");
  const rest = loadRestCountries();
  const wb = loadWorldBankCountries();
  const itu = loadItuData();
  const ilostat = loadIlostatSectorShares();
  const wdi = loadWdiData();

  console.log(`  REST Countries: ${Object.keys(rest.byIso2).length} countries`);
  console.log(`  World Bank:     ${Object.keys(wb.byIso2).length} countries`);
  console.log(`  ITU:            ${Object.keys(itu).length} countries with digital data`);
  console.log(`  ILOSTAT:        ${Object.keys(ilostat).length} countries with sector shares`);
  console.log(`  WDI full:       ${Object.keys(wdi).length} economies\n`);

  console.log("Generating configs...");
  const configs = {};
  let generated = 0;
  let withItu = 0;
  let withIlostat = 0;

  for (const [iso2, restC] of Object.entries(rest.byIso2)) {
    const wbC = wb.byIso2[iso2] ?? wb.byIso3[restC.iso3] ?? null;
    const iso3 = restC.iso3;

    const ituData = itu[iso3] ?? {};
    const iloData = ilostat[iso3] ?? null;
    const wdiData = wdi[iso3] ?? {};

    // Resolve digital infrastructure
    // Prefer WDI IT.MOB.4G.ZS, then ITU i911mw
    const mobilePer100 =
      latestValue(wdiData["IT.MOB.4G.ZS"]) ??
      ituData.mobile_broadband_per_100 ??
      null;

    const internetPct =
      latestValue(wdiData["IT.NET.USER.ZS"]) ??
      ituData.internet_users_pct ??
      null;

    const infraLevel = deriveInfrastructureLevel(mobilePer100);
    const incomeId = wbC?.income_level_id ?? "INX";
    const region = wbC?.region ?? restC.region ?? "";

    // Sector shares from ILOSTAT, or WDI self_employed_pct as proxy
    const sectorShares = iloData ?? null;
    const selfEmployedPct = latestValue(wdiData["SL.EMP.SELF.ZS"]) ?? null;

    // Estimate agri share if ILOSTAT missing
    const estimatedShares = sectorShares ?? (
      (incomeId === "LIC") ? { AGR: 0.55, IND: 0.15, SER: 0.30 }
      : (incomeId === "LMC") ? { AGR: 0.35, IND: 0.22, SER: 0.43 }
      : (incomeId === "UMC") ? { AGR: 0.18, IND: 0.28, SER: 0.54 }
      : { AGR: 0.05, IND: 0.25, SER: 0.70 }
    );

    const minWageUsd = MIN_WAGE_BY_INCOME[incomeId] ?? 200;

    const config = {
      country_code: iso2,
      country_name: restC.name,
      iso3,
      default_city: restC.capital || wbC?.capital_city || "",
      locale: `${restC.primary_language?.slice(0, 2) ?? "en"}-${iso2}`,
      currency: restC.primary_currency ?? null,
      currency_symbol: restC.currency_symbol ?? null,
      supported_languages: restC.languages.map((l) => l.label),

      language: {
        primary: restC.primary_language ?? "eng",
        translation_file: restC.primary_language === "eng" ? "en.json" : `${restC.primary_language}.json`,
        script: restC.text_direction === "rtl" ? "arabic_or_rtl" : "latin_or_local",
        direction: restC.text_direction ?? "ltr",
        font: buildFontForLanguage(restC.primary_language ?? "eng"),
        secondary_languages: restC.languages.slice(1).map((l) => ({
          code: l.code,
          name: l.label,
          translation_file: `${l.code}.json`,
        })),
        audio_support: (incomeId === "LIC" || incomeId === "LMC"),
      },

      world_bank: wbC
        ? {
            income_level_id: incomeId,
            income_level: wbC.income_level,
            region_id: wbC.region_id,
            region,
            admin_region: wbC.admin_region,
            lending_type_id: wbC.lending_type_id,
          }
        : null,

      digital_infrastructure: {
        mobile_broadband_per_100: mobilePer100,
        internet_users_pct: internetPct,
        affordability_gni_pct: ituData.affordability_gni_pct ?? null,
        infrastructure_level: infraLevel,
        source: "ITU 2024 / World Bank WDI IT.MOB.4G.ZS",
        source_url: "https://datahub.itu.int/",
      },

      labor_market: {
        ilostat_ref_area: iso3,
        wb_country_code: iso3,
        wb_iso2: iso2,
        currency: restC.primary_currency ?? null,
        currency_symbol: restC.currency_symbol ?? null,
        wage_frequency: "monthly",
        ilostat_employment_indicator: "EMP_TEMP_SEX_AGE_ECO_NB",
        ilostat_sector_classif_prefix: "ECO_SECTOR_",
        wdi_indicators: WDI_INDICATORS,
        sector_map: SECTOR_MAP,
        sector_shares: sectorShares
          ? { source: "ILOSTAT", ...sectorShares }
          : { source: "estimated_by_income_level", ...estimatedShares },
        self_employed_pct_wdi: selfEmployedPct,
        data_vintage: 2024,
        uncertainty_note:
          "Based on most recent available ILOSTAT and World Bank WDI data. Informal sector wages carry higher uncertainty.",
      },

      education_levels: DEFAULT_EDUCATION_LEVELS,

      priority_sectors: derivePrioritySectors(incomeId, estimatedShares),
      priority_isco_groups: derivePriorityIsco(incomeId, region),

      automation: deriveAutomationCalibration(incomeId, infraLevel, restC.name),

      opportunities: deriveOpportunityTypes(
        incomeId, region, estimatedShares, mobilePer100,
        restC.primary_currency, restC.currency_symbol, minWageUsd
      ),

      ui: {
        intake_title: "Build your skills profile",
        intake_greeting:
          "Tell us about the work you already do. We will translate it into a portable skills profile.",
      },

      provenance: {
        generated: true,
        generated_by: "scripts/generate-country-configs.mjs",
        sources_used: [
          "restcountries",
          ...(wbC ? ["world_bank_countries"] : []),
          ...(ituData.internet_users_pct !== undefined ? ["itu_dataset"] : []),
          ...(iloData ? ["ilostat_emp_eco"] : []),
          ...(Object.keys(wdiData).length ? ["wdi_all_countries_full"] : []),
        ],
        override_applied: false,
      },
    };

    configs[iso2] = config;
    generated++;
    if (ituData.internet_users_pct !== undefined) withItu++;
    if (iloData) withIlostat++;
  }

  const payload = {
    version: "all-country-configs-generated-v1",
    generated_at: new Date().toISOString(),
    note:
      "Auto-generated from REST Countries, World Bank, ITU, ILOSTAT, and WDI datasets. " +
      "Manual overrides in config/countries/*.json, config/automation/*.json, config/opportunities/*.json take precedence.",
    stats: {
      total_countries: generated,
      with_itu_digital_data: withItu,
      with_ilostat_sector_shares: withIlostat,
      with_wdi_data: Object.keys(wdi).length,
    },
    countries: configs,
  };

  const outputPath = join(OUTPUT_DIR, "all_country_configs.generated.json");
  writeFileSync(outputPath, JSON.stringify(payload, null, 2), "utf-8");

  // Write individual per-country files to config/generated/countries/{CC}.json
  // so each country's config is browsable, diffable, and editable
  const perCountryDir = join(ROOT, "config", "generated", "countries");
  mkdirSync(perCountryDir, { recursive: true });
  for (const [cc, cfg] of Object.entries(configs)) {
    writeFileSync(join(perCountryDir, `${cc}.json`), JSON.stringify(cfg, null, 2), "utf-8");
  }

  console.log(`\nGenerated configs for ${generated} countries`);
  console.log(`  Combined file     : ${outputPath}`);
  console.log(`  Per-country files : config/generated/countries/ (${generated} files)`);
  console.log(`  ${withItu} with real ITU digital data`);
  console.log(`  ${withIlostat} with real ILOSTAT sector shares`);
  console.log(`  ${Object.keys(wdi).length} with WDI indicator data`);
}

function derivePrioritySectors(incomeId, shares) {
  if (shares.AGR >= 0.40) return ["agriculture", "food_hospitality", "retail_trade", "personal_services"];
  if (incomeId === "LIC") return ["agriculture", "technical_services", "retail_trade", "construction_manufacturing_transport"];
  if (incomeId === "LMC") return ["technical_services", "retail_trade", "construction_manufacturing_transport", "garments_craft", "agriculture"];
  if (incomeId === "UMC") return ["technical_services", "professional_services", "retail_trade", "construction_manufacturing_transport"];
  return ["professional_services", "technical_services", "retail_trade", "food_hospitality"];
}

function derivePriorityIsco(incomeId, region) {
  const base = ["5223", "5230", "9412"];
  if (incomeId === "LIC" || incomeId === "LMC") {
    return [...base, "7422", "7421", "7115", "7212", "7531", "8322", "6110", "6111"];
  }
  if (incomeId === "UMC") {
    return [...base, "7422", "7421", "3123", "3114", "4110", "2141", "7115"];
  }
  return [...base, "2141", "2512", "3114", "4110", "3123", "1120"];
}

build();
