/**
 * LMIC Calibration Layer.
 *
 * Adjusts a base (OECD-calibrated) automation probability for the economic
 * realities of Low- and Middle-Income Countries (LMICs).
 *
 *   adjusted_prob = base_prob × income_factor × informality_factor × infrastructure_factor
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getGeneratedCountryConfig } from "./dataStore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..", "..", "..");

const laborStatsPath = join(root, "config", "country_labor_stats.json");
const laborStats = existsSync(laborStatsPath)
  ? JSON.parse(readFileSync(laborStatsPath, "utf-8"))
  : { countries: {} };

const wittgensteinPath = join(root, "config", "wittgenstein_education.json");
const wittgensteinData = existsSync(wittgensteinPath)
  ? JSON.parse(readFileSync(wittgensteinPath, "utf-8"))
  : { countries: {} };

const INCOME_FACTORS = {
  low:            { factor: 0.45, label: "Low income" },
  "lower-middle": { factor: 0.55, label: "Lower-middle income" },
  "upper-middle": { factor: 0.75, label: "Upper-middle income" },
  high:           { factor: 1.00, label: "High income" },
};

function getIncomeFactor(worldBankData) {
  const group = (worldBankData?.income_level_iso3v3 ?? worldBankData?.income_level_id ?? worldBankData?.income_level ?? "").toLowerCase();
  if (group.includes("low") && group.includes("upper")) return INCOME_FACTORS["upper-middle"];
  if (group.includes("low") && group.includes("lower")) return INCOME_FACTORS["lower-middle"];
  if (group.includes("low")) return INCOME_FACTORS["low"];
  if (group.includes("high")) return INCOME_FACTORS["high"];
  return { factor: 0.60, label: "Unknown (conservative LMIC estimate)" };
}

function getInformalityFactor(country, countryStats) {
  const agrShare = countryStats?.employment_by_sector?.agriculture_share ?? null;
  if (agrShare === null) {
    // Try generated config sector shares
    const generated = getGeneratedCountryConfig(country.country_code);
    const genAgr = generated?.labor_market?.sector_shares?.AGR;
    if (Number.isFinite(genAgr)) {
      if (genAgr > 0.40) return { factor: 0.85, label: `Very high informality — agriculture share ${(genAgr * 100).toFixed(1)}% (generated config)` };
      if (genAgr > 0.25) return { factor: 0.90, label: `High informality — agriculture share ${(genAgr * 100).toFixed(1)}% (generated config)` };
      return { factor: 0.95, label: `Moderate informality — agriculture share ${(genAgr * 100).toFixed(1)}% (generated config)` };
    }
    return { factor: 0.90, label: "Unknown agriculture share (default high informality assumed)" };
  }
  if (agrShare > 0.40) return { factor: 0.85, label: `Very high informality — agriculture share ${(agrShare * 100).toFixed(1)}% (ILOSTAT ${countryStats.year})` };
  if (agrShare > 0.25) return { factor: 0.90, label: `High informality — agriculture share ${(agrShare * 100).toFixed(1)}% (ILOSTAT ${countryStats.year})` };
  return { factor: 0.95, label: `Moderate informality — agriculture share ${(agrShare * 100).toFixed(1)}% (ILOSTAT ${countryStats.year})` };
}

function getInfrastructureFactor(country) {
  const generated = getGeneratedCountryConfig(country.country_code);
  const level = generated?.digital_infrastructure?.infrastructure_level
    ?? generated?.automation?.infrastructure_level
    ?? null;

  if (level === "high")   return { factor: 1.00, label: `High digital infrastructure (ITU 2024)` };
  if (level === "medium") return { factor: 0.90, label: `Medium digital infrastructure (ITU 2024 — mobile broadband ${generated?.digital_infrastructure?.mobile_broadband_per_100?.toFixed(1) ?? "?"} per 100)` };
  if (level === "low")    return { factor: 0.80, label: `Low digital infrastructure (ITU 2024)` };

  const region = country.geography?.region ?? country.geography?.subregion ?? "";
  const isSSA = region.toLowerCase().includes("africa");
  const isSA  = region.toLowerCase().includes("south asia") || region.toLowerCase().includes("southern asia");
  const incomeGroup = (country.world_bank?.income_level_iso3v3 ?? country.world_bank?.income_level_id ?? "").toLowerCase();

  if (incomeGroup.includes("high")) return { factor: 1.00, label: "High-income digital infrastructure (geographic proxy)" };
  if ((isSSA || isSA) && (incomeGroup.includes("low") || incomeGroup.includes("lower"))) {
    return { factor: 0.85, label: "Sub-Saharan Africa / South Asia low-income digital infrastructure (geographic proxy)" };
  }
  if (incomeGroup.includes("upper")) return { factor: 0.95, label: "Upper-middle-income digital infrastructure (geographic proxy)" };
  return { factor: 0.90, label: "Lower-middle-income digital infrastructure (geographic proxy)" };
}

export function calibrateForLMIC(baseProbability, country) {
  const countryCode = country.country_code;
  const countryStats = laborStats.countries[countryCode] ?? null;

  const incomeFactor     = getIncomeFactor(country.world_bank);
  const informalityFactor = getInformalityFactor(country, countryStats);
  const infraFactor      = getInfrastructureFactor(country);

  const adjustmentFactor = Number(
    (incomeFactor.factor * informalityFactor.factor * infraFactor.factor).toFixed(3)
  );

  const adjustedProbability = Number(
    Math.min(baseProbability, baseProbability * adjustmentFactor).toFixed(3)
  );

  const explanation = [
    `Income group factor ${incomeFactor.factor} — ${incomeFactor.label}.`,
    `Informality factor ${informalityFactor.factor} — ${informalityFactor.label}.`,
    `Infrastructure factor ${infraFactor.factor} — ${infraFactor.label}.`,
    `Combined LMIC adjustment factor: ${adjustmentFactor}.`,
    `Adjusted automation probability: ${baseProbability} × ${adjustmentFactor} = ${adjustedProbability}.`,
  ];

  const sources = [
    "ILO (2019). The Future of Work in Sub-Saharan Africa.",
    "ILO (2023). World Employment and Social Outlook.",
    "Arntz, Gregory & Zierahn (2016). The Risk of Automation for Jobs in OECD Countries.",
    "ITU (2022). Measuring Digital Development: Facts and Figures 2022.",
    "ILOSTAT (2024). Employment by sex, age and economic activity.",
  ];

  return {
    adjusted_probability: adjustedProbability,
    adjustment_factor: adjustmentFactor,
    income_factor: incomeFactor.factor,
    informality_factor: informalityFactor.factor,
    infrastructure_factor: infraFactor.factor,
    explanation,
    sources,
    uncertainty_band: getGeneratedCountryConfig(countryCode)?.automation?.uncertainty_band ?? 0.15,
    scenario_toggles: getGeneratedCountryConfig(countryCode)?.automation?.scenario_toggles ?? [],
  };
}

export function getCountryLaborStats(countryCode) {
  const stats = laborStats.countries[countryCode] ?? null;
  const wic = wittgensteinData.countries?.[countryCode] ?? null;
  if (!stats && !wic) return null;

  const merged = { ...(stats ?? {}) };
  if (wic) {
    merged.wittgenstein_projections = buildWittgensteinSummary(wic);
  }
  return merged;
}

function buildWittgensteinSummary(wic) {
  const years = Object.keys(wic.years ?? {}).sort();
  if (years.length === 0) return null;

  const latest = years[years.length - 1];
  const youth = wic.years[latest]?.youth_15_24 ?? {};

  const noEdu = youth.no_education ?? 0;
  const incPrimary = youth.incomplete_primary ?? 0;
  const primary = youth.primary ?? 0;
  const lowerSec = youth.lower_secondary ?? 0;
  const upperSec = youth.upper_secondary ?? 0;
  const postSec = youth.post_secondary ?? 0;
  const shortPost = youth.short_post_secondary ?? 0;
  const bachelor = youth.bachelor ?? 0;
  const master = youth.master_and_higher ?? 0;

  const belowSecondary = noEdu + incPrimary + primary;
  const secondaryOrBelow = belowSecondary + lowerSec;
  const tertiaryShare = postSec + shortPost + bachelor + master;

  return {
    source: "Wittgenstein Centre WCDE v3.0 (SSP2 Medium)",
    year: latest,
    youth_15_24: youth,
    secondary_completion_rate: Math.round((upperSec + tertiaryShare) * 10) / 10,
    tertiary_share: Math.round(tertiaryShare * 10) / 10,
    below_secondary_share: Math.round(belowSecondary * 10) / 10,
    youth_summary: wic.youth_summary ?? null,
    education_trend: wic.education_trend ?? null,
  };
}
