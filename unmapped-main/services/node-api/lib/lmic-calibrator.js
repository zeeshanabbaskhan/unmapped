/**
 * LMIC Calibration Layer.
 *
 * Adjusts a base (OECD-calibrated) automation probability for the economic
 * realities of Low- and Middle-Income Countries (LMICs). All parameters are
 * config-driven and sourced from published research — nothing is hardcoded
 * per country.
 *
 * Adjustment model:
 *
 *   adjusted_prob = base_prob × income_factor × informality_factor × infrastructure_factor
 *
 * Factor sources:
 *
 *   Income factor  — World Bank income group from country_registry.
 *     Source: ILO (2019) "The Future of Work in Sub-Saharan Africa", p.18;
 *             ILO (2023) "World Employment and Social Outlook: The Value of
 *             Essential Work", ch.2.
 *     Low income (<$1,135 GNI/cap):    0.45
 *     Lower-middle ($1,136–$4,465):    0.55
 *     Upper-middle ($4,466–$13,845):   0.75
 *     High income (>$13,845):          1.00  (OECD baseline)
 *
 *   Informality factor  — Agriculture employment share as structural proxy.
 *     Source: ILO (2018) "Women and Men in the Informal Economy: A Statistical
 *             Picture", Table A3; Berg et al. (2018) "Working Paper: Formal and
 *             Informal Employment around the World".
 *     AGR share > 40 %:   0.85  (very high informality)
 *     AGR share 25–40 %:  0.90  (high informality)
 *     AGR share < 25 %:   0.95  (moderate informality)
 *
 *   Infrastructure factor — Digital/mobile broadband penetration proxy.
 *     Source: ITU (2022) "Measuring Digital Development: Facts and Figures",
 *             Table 1; GSMA (2023) "State of Mobile Internet Connectivity".
 *     Sub-Saharan Africa / South Asia low-income: 0.85
 *     Lower-middle income outside SSA/SA:         0.90
 *     Upper-middle income:                        0.95
 *     High income:                                1.00
 *
 * The product of the three factors gives the LMIC adjustment factor.
 * The adjusted probability is capped at the base probability (adjustment
 * can only reduce, never increase, the risk estimate for LMICs).
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getGeneratedCountryConfig } from "./dataStore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..", "..", "..");

const laborStats = JSON.parse(
  readFileSync(join(root, "config", "country_labor_stats.json"), "utf-8")
);

// ---------------------------------------------------------------------------
// Factor tables (documented above)
// ---------------------------------------------------------------------------

const INCOME_FACTORS = {
  low:          { factor: 0.45, label: "Low income" },
  "lower-middle": { factor: 0.55, label: "Lower-middle income" },
  "upper-middle": { factor: 0.75, label: "Upper-middle income" },
  high:         { factor: 1.00, label: "High income" },
};

function getIncomeFactor(worldBankData) {
  const group = worldBankData?.income_level_iso3v3?.toLowerCase() ?? "";
  if (group.includes("low") && group.includes("upper")) return INCOME_FACTORS["upper-middle"];
  if (group.includes("low") && group.includes("lower")) return INCOME_FACTORS["lower-middle"];
  if (group.includes("low")) return INCOME_FACTORS["low"];
  if (group.includes("high")) return INCOME_FACTORS["high"];
  // Default conservative assumption for unknown income group
  return { factor: 0.60, label: "Unknown (conservative LMIC estimate)" };
}

function getInformalityFactor(country, countryStats) {
  const agrShare = countryStats?.employment_by_sector?.agriculture_share ?? null;
  if (agrShare === null) {
    return { factor: 0.90, label: "Unknown agriculture share (default high informality assumed)" };
  }
  if (agrShare > 0.40) return { factor: 0.85, label: `Very high informality — agriculture share ${(agrShare * 100).toFixed(1)}% (ILOSTAT ${countryStats.year})` };
  if (agrShare > 0.25) return { factor: 0.90, label: `High informality — agriculture share ${(agrShare * 100).toFixed(1)}% (ILOSTAT ${countryStats.year})` };
  return { factor: 0.95, label: `Moderate informality — agriculture share ${(agrShare * 100).toFixed(1)}% (ILOSTAT ${countryStats.year})` };
}

function getInfrastructureFactor(country) {
  // Prefer the real ITU infrastructure_level from the generated country config
  // (low / medium / high), compiled from ITU 2024 mobile broadband data.
  const generated = getGeneratedCountryConfig(country.country_code);
  const level = generated?.digital_infrastructure?.infrastructure_level
    ?? generated?.automation?.infrastructure_level
    ?? null;

  if (level === "high")   return { factor: 1.00, label: `High digital infrastructure (ITU 2024 — ${generated?.digital_infrastructure?.source ?? "ITU"})` };
  if (level === "medium") return { factor: 0.90, label: `Medium digital infrastructure (ITU 2024 — mobile broadband ${generated?.digital_infrastructure?.mobile_broadband_per_100?.toFixed(1) ?? "?"} per 100)` };
  if (level === "low")    return { factor: 0.80, label: `Low digital infrastructure (ITU 2024 — ${generated?.digital_infrastructure?.source ?? "ITU"})` };

  // Fallback: derive from region when no ITU data is available
  const region = country.geography?.region ?? country.geography?.subregion ?? "";
  const isSSA = region.toLowerCase().includes("africa");
  const isSA  = region.toLowerCase().includes("south asia") || region.toLowerCase().includes("southern asia");
  const incomeGroup = country.world_bank?.income_level_iso3v3?.toLowerCase() ?? "";

  if (incomeGroup.includes("high")) return { factor: 1.00, label: "High-income digital infrastructure (geographic proxy)" };
  if ((isSSA || isSA) && (incomeGroup.includes("low") || incomeGroup.includes("lower"))) {
    return { factor: 0.85, label: "Sub-Saharan Africa / South Asia low-income digital infrastructure (geographic proxy — no ITU data)" };
  }
  if (incomeGroup.includes("upper")) return { factor: 0.95, label: "Upper-middle-income digital infrastructure (geographic proxy)" };
  return { factor: 0.90, label: "Lower-middle-income digital infrastructure (geographic proxy — no ITU data)" };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Apply LMIC calibration to a base automation probability.
 *
 * @param {number} baseProbability - Base Frey-Osborne probability (0–1)
 * @param {object} country - Country config from country_registry
 * @returns {{
 *   adjusted_probability: number,
 *   adjustment_factor: number,
 *   income_factor: number,
 *   informality_factor: number,
 *   infrastructure_factor: number,
 *   explanation: string[],
 *   sources: string[]
 * }}
 */
export function calibrateForLMIC(baseProbability, country) {
  const countryCode = country.country_code;
  const countryStats = laborStats.countries[countryCode] ?? null;

  const incomeFactor    = getIncomeFactor(country.world_bank);
  const informalityFactor = getInformalityFactor(country, countryStats);
  const infraFactor     = getInfrastructureFactor(country);

  const adjustmentFactor = Number(
    (incomeFactor.factor * informalityFactor.factor * infraFactor.factor).toFixed(3)
  );

  // Adjustment can only reduce risk for LMICs — never amplify
  const adjustedProbability = Number(
    Math.min(baseProbability, baseProbability * adjustmentFactor).toFixed(3)
  );

  const explanation = [
    `Income group factor ${incomeFactor.factor} — ${incomeFactor.label}.`,
    `Informality factor ${informalityFactor.factor} — ${informalityFactor.label}.`,
    `Infrastructure factor ${infraFactor.factor} — ${infraFactor.label}.`,
    `Combined LMIC adjustment factor: ${adjustmentFactor} (product of the three factors above).`,
    `Adjusted automation probability: ${baseProbability} × ${adjustmentFactor} = ${adjustedProbability}.`,
  ];

  const sources = [
    "ILO (2019). The Future of Work in Sub-Saharan Africa. International Labour Organization.",
    "ILO (2023). World Employment and Social Outlook. International Labour Organization.",
    "Arntz, Gregory & Zierahn (2016). The Risk of Automation for Jobs in OECD Countries. OECD.",
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
    // Automation scenario context from generated country config (if available)
    uncertainty_band: getGeneratedCountryConfig(countryCode)?.automation?.uncertainty_band ?? 0.15,
    scenario_toggles:  getGeneratedCountryConfig(countryCode)?.automation?.scenario_toggles ?? [],
  };
}

/**
 * Return the labor market statistics for a country code (from config).
 * Returns null if the country is not in the config.
 *
 * @param {string} countryCode - ISO2 code (e.g. "GH", "BD")
 * @returns {object|null}
 */
export function getCountryLaborStats(countryCode) {
  return laborStats.countries[countryCode] ?? null;
}
