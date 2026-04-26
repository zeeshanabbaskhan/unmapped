import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../../..");
const WDI_PATH = join(ROOT, "data", "wdi_all_countries_full.json");
const WDI_SERIES_BY_ISO3 = existsSync(WDI_PATH) ? JSON.parse(readFileSync(WDI_PATH, "utf-8")) : {};

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function normalizeText(value) {
  return String(value ?? "").trim().toLowerCase();
}

function toConfidenceLabel(score) {
  if (score >= 0.75) return "high";
  if (score >= 0.45) return "medium";
  return "low";
}

function parseCountryOpportunityTypes(countryConfig) {
  return (countryConfig?.opportunities?.types ?? []).filter((type) => type?.enabled !== false);
}

function getSeriesPoint(countryConfig, semanticKey) {
  const iso3 = countryConfig?.iso3;
  const code = countryConfig?.labor_market?.wdi_indicators?.[semanticKey];
  if (!iso3 || !code) return null;

  const seriesByYear = WDI_SERIES_BY_ISO3?.[iso3]?.[code];
  if (!seriesByYear || typeof seriesByYear !== "object") return null;
  const years = Object.keys(seriesByYear)
    .map((year) => Number(year))
    .filter(Number.isFinite)
    .sort((a, b) => b - a);
  if (!years.length) return null;

  const latestYear = String(years[0]);
  const prevYear = years[1] ? String(years[1]) : null;
  const latest = Number(seriesByYear[latestYear]);
  const previous = prevYear ? Number(seriesByYear[prevYear]) : null;
  if (!Number.isFinite(latest)) return null;

  const delta = Number.isFinite(previous) ? latest - previous : null;
  return {
    indicator_code: code,
    year: Number(latestYear),
    value: latest,
    previous_year: prevYear ? Number(prevYear) : null,
    previous_value: Number.isFinite(previous) ? previous : null,
    delta,
  };
}

function formatSignalValue(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function trendDirection(delta) {
  if (!Number.isFinite(delta)) return "flat";
  if (delta > 0.001) return "up";
  if (delta < -0.001) return "down";
  return "flat";
}

function buildWdiSignal(countryConfig, semanticKey, label, unit, sourceLabel = "World Bank WDI") {
  const point = getSeriesPoint(countryConfig, semanticKey);
  if (!point) return null;
  return {
    id: semanticKey,
    label,
    value: formatSignalValue(point.value),
    unit,
    year: point.year,
    trend: trendDirection(point.delta),
    delta: formatSignalValue(point.delta),
    source: sourceLabel,
    source_indicator: point.indicator_code,
  };
}

function buildSectorShareSignals(countryConfig) {
  const shares = countryConfig?.labor_market?.sector_shares ?? {};
  const labels = {
    AGR: "Agriculture employment share",
    IND: "Industry employment share",
    SER: "Services employment share",
  };
  return ["AGR", "IND", "SER"]
    .filter((key) => Number.isFinite(Number(shares[key])))
    .map((key) => ({
      id: `sector_share_${key.toLowerCase()}`,
      label: labels[key],
      value: formatSignalValue(Number(shares[key]) * 100),
      unit: "percent",
      year: countryConfig?.labor_market?.data_vintage ?? null,
      trend: "flat",
      delta: null,
      source: "ILOSTAT",
      source_indicator: countryConfig?.labor_market?.ilostat_employment_indicator ?? "EMP_TEMP_SEX_AGE_ECO_NB",
    }));
}

function buildEconometricSignals(countryConfig, module1Output) {
  const fromWdi = [
    buildWdiSignal(countryConfig, "youth_unemployment", "Youth unemployment rate", "percent"),
    buildWdiSignal(countryConfig, "neet_rate", "NEET rate (youth not in employment, education or training)", "percent"),
    buildWdiSignal(countryConfig, "employment_ratio", "Employment-to-population ratio", "percent"),
    buildWdiSignal(countryConfig, "self_employed_pct", "Self-employment share", "percent"),
    buildWdiSignal(countryConfig, "informal_employment_pct", "Informal employment share", "percent"),
    buildWdiSignal(countryConfig, "gdp_per_capita", "GDP per capita", "usd"),
    buildWdiSignal(countryConfig, "internet_users_pct", "Internet users", "percent"),
    buildWdiSignal(countryConfig, "mobile_broadband_per_100", "Mobile broadband subscriptions", "per_100"),
    buildWdiSignal(countryConfig, "human_capital_index", "Human capital index", "index"),
    buildWdiSignal(countryConfig, "learning_adjusted_school_years", "Learning-adjusted school years", "years"),
    buildWdiSignal(countryConfig, "secondary_enrollment_gross", "Secondary enrollment (gross)", "percent"),
    buildWdiSignal(countryConfig, "primary_completion_rate", "Primary completion rate", "percent"),
  ].filter(Boolean);

  const minWage = Number(countryConfig?.opportunities?.min_wage_monthly);
  const wageSignal = Number.isFinite(minWage)
    ? [{
        id: "minimum_wage_monthly",
        label: "Minimum wage (monthly estimate)",
        value: Math.round(minWage),
        unit: countryConfig?.opportunities?.currency ?? countryConfig?.currency ?? "local_currency",
        year: countryConfig?.labor_market?.data_vintage ?? null,
        trend: "flat",
        delta: null,
        source: countryConfig?.opportunities?.min_wage_source ?? countryConfig?.opportunities?.min_wage_note ?? "Country opportunity config",
        source_indicator: "minimum_wage",
      }]
    : [];

  const sectorSignals = buildSectorShareSignals(countryConfig);

  const automationRiskAdjusted = Number(module1Output?.adjusted_readiness?.automation_risk_adjusted);
  const automationSignal = Number.isFinite(automationRiskAdjusted)
    ? [{
        id: "automation_risk_adjusted",
        label: "Automation risk (country-adjusted)",
        value: formatSignalValue(automationRiskAdjusted * 100),
        unit: "percent",
        year: countryConfig?.labor_market?.data_vintage ?? null,
        trend: "flat",
        delta: null,
        source: "Module 1 adjusted readiness",
        source_indicator: "automation_adjusted",
      }]
    : [];

  const allSignals = [...wageSignal, ...fromWdi, ...sectorSignals, ...automationSignal];

  const visibleToYouth = allSignals
    .filter((signal) =>
      [
        "minimum_wage_monthly",
        "youth_unemployment",
        "self_employed_pct",
        "informal_employment_pct",
        "employment_ratio",
        "automation_risk_adjusted",
      ].includes(signal.id)
    )
    .slice(0, 6);

  return {
    all_signals: allSignals,
    visible_signals_youth: visibleToYouth,
    signal_count: allSignals.length,
  };
}

function parseSkillSignals(module1Output) {
  const skills = Array.isArray(module1Output?.skills) ? module1Output.skills : [];
  const names = skills.map((skill) => normalizeText(skill.name)).filter(Boolean);
  const avgConfidence =
    skills.length > 0
      ? skills.reduce((sum, skill) => sum + (Number(skill.confidence) || 0), 0) / skills.length
      : 0.5;
  return { skills, names, avgConfidence: clamp(avgConfidence) };
}

function getTopOccupation(module1Output) {
  if (module1Output?.final_selection?.title) return module1Output.final_selection;
  return Array.isArray(module1Output?.occupation_candidates) ? module1Output.occupation_candidates[0] : null;
}

function estimateDigitalReadiness(countryConfig, skillNames) {
  const infra = countryConfig?.digital_infrastructure ?? {};
  const internetUsers = Number(infra.internet_users_pct ?? infra.internet_users_percent ?? 0);
  const mobileBroadband = Number(infra.mobile_broadband_per_100 ?? infra.mobile_broadband ?? 0);
  const infraScore = clamp((internetUsers / 100) * 0.7 + (mobileBroadband / 100) * 0.3, 0.15, 0.9);

  const digitalHints = ["digital", "online", "social media", "mobile money", "data entry", "computer"];
  const hasDigitalSkill = skillNames.some((name) => digitalHints.some((hint) => name.includes(hint)));
  return clamp(infraScore + (hasDigitalSkill ? 0.12 : 0));
}

function inferInformalEconomySignal(module1Output, countryConfig) {
  const laborStructure = normalizeText(module1Output?.country_context?.labor_structure);
  if (laborStructure.includes("informal")) return 0.9;

  const selfEmp = Number(countryConfig?.opportunities?.ilostat_self_employed_pct ?? 0);
  if (selfEmp > 0) return clamp(selfEmp / 100);
  return 0.5;
}

function inferAutomationReadiness(module1Output) {
  const adjustedRisk = Number(module1Output?.adjusted_readiness?.automation_risk_adjusted);
  if (Number.isFinite(adjustedRisk)) return clamp(1 - adjustedRisk);
  return 0.5;
}

function buildMissingSkills(module1Output, skillNames) {
  const candidates = Array.isArray(module1Output?.occupation_candidates) ? module1Output.occupation_candidates : [];
  const top = candidates[0];
  const next = candidates[1];

  const seed = [];
  if (top?.confidence && Number(top.confidence) < 0.7) seed.push("advanced task specialization");
  if (next?.matched_skills?.length) seed.push(...next.matched_skills.map((s) => normalizeText(s)));
  if (!skillNames.some((s) => s.includes("digital"))) seed.push("digital tools usage");
  if (!skillNames.some((s) => s.includes("business") || s.includes("sales"))) seed.push("basic business operations");

  return [...new Set(seed.filter(Boolean))].slice(0, 4);
}

function scoreByType({ typeId, weight, module1Output, topOccupation, skillSignal, countryConfig }) {
  const finalConfidence = Number(module1Output?.final_selection?.confidence ?? topOccupation?.confidence ?? 0.5);
  const skillStrength = skillSignal.avgConfidence;
  const informalSignal = inferInformalEconomySignal(module1Output, countryConfig);
  const automationReadiness = inferAutomationReadiness(module1Output);
  const digitalReadiness = estimateDigitalReadiness(countryConfig, skillSignal.names);
  const lowConfidenceBoost = finalConfidence < 0.6 ? 0.18 : 0;

  let base = 0.35;
  switch (typeId) {
    case "formal_employment":
      base =
        finalConfidence * 0.4 +
        skillStrength * 0.25 +
        automationReadiness * 0.2 +
        (1 - informalSignal) * 0.15;
      break;
    case "self_employment":
      base =
        skillStrength * 0.35 +
        informalSignal * 0.25 +
        finalConfidence * 0.2 +
        automationReadiness * 0.2;
      break;
    case "gig_platform":
      base =
        digitalReadiness * 0.4 +
        skillStrength * 0.2 +
        finalConfidence * 0.2 +
        automationReadiness * 0.2;
      break;
    case "vocational_training":
      base =
        (1 - finalConfidence) * 0.35 +
        (1 - skillStrength) * 0.25 +
        lowConfidenceBoost +
        automationReadiness * 0.1 +
        0.2;
      break;
    case "microenterprise_support":
      base =
        informalSignal * 0.3 +
        skillStrength * 0.25 +
        automationReadiness * 0.15 +
        (1 - finalConfidence) * 0.1 +
        0.2;
      break;
    case "agricultural_cooperative": {
      const textBlob = normalizeText(
        `${module1Output?.input_summary?.original_text ?? ""} ${topOccupation?.title ?? ""} ${skillSignal.names.join(" ")}`
      );
      const agriHint = /(agri|farm|crop|livestock|fishing)/.test(textBlob) ? 1 : 0.25;
      base = agriHint * 0.45 + informalSignal * 0.25 + (1 - finalConfidence) * 0.1 + skillStrength * 0.2;
      break;
    }
    default:
      base = finalConfidence * 0.35 + skillStrength * 0.35 + automationReadiness * 0.3;
      break;
  }

  const normalizedWeight = clamp(Number(weight) || 0.2, 0.05, 1);
  // Keep intrinsic fit dominant, and let country weight bias ranking.
  return clamp(base * 0.75 + normalizedWeight * 0.25);
}

function buildRationale({ typeId, typeConfig, module1Output, topOccupation, skillSignal, score }) {
  const evidence = [];
  const matched = skillSignal.skills
    .sort((a, b) => (Number(b.confidence) || 0) - (Number(a.confidence) || 0))
    .slice(0, 2)
    .map((s) => s.name);

  if (topOccupation?.title) {
    evidence.push(`Your strongest occupation match is ${topOccupation.title}${topOccupation.isco_code ? ` (ISCO ${topOccupation.isco_code})` : ""}.`);
  }
  if (matched.length) {
    evidence.push(`Top extracted skills used: ${matched.join(", ")}.`);
  }
  if (module1Output?.adjusted_readiness?.interpretation) {
    evidence.push(module1Output.adjusted_readiness.interpretation);
  } else if (module1Output?.adjusted_readiness?.automation_risk_adjusted !== undefined) {
    evidence.push(`Automation-adjusted readiness considered from local context.`);
  }
  if (typeConfig?.notes) {
    evidence.push(typeConfig.notes);
  }
  evidence.push(`Overall pathway fit score: ${Math.round(score * 100)}%.`);

  if (typeId === "vocational_training") {
    evidence.push("Training is prioritized when occupation confidence is medium/low or skills are incomplete.");
  }

  return evidence.slice(0, 5);
}

function buildNextActions(typeId, countryConfig) {
  const base = {
    formal_employment: [
      "Prepare a one-page skills profile with your top occupation and matched skills.",
      "Apply to 3-5 employers in this occupation category in your city this week.",
      "Collect one proof-of-work item (photo, task record, or supervisor note).",
    ],
    self_employment: [
      "List your top three services and set simple pricing.",
      "Record weekly costs and revenue to track profitability.",
      "Offer one bundled service package to repeat customers.",
    ],
    gig_platform: [
      "Create or update your profile on one platform and one local channel.",
      "Publish a clear service description with turnaround time.",
      "Track ratings and response time for the first 10 jobs.",
    ],
    vocational_training: [
      "Choose one short course directly related to your occupation match.",
      "Prioritize low-cost or subsidized providers first.",
      "Set a 4-8 week completion timeline with weekly milestones.",
    ],
    microenterprise_support: [
      "Shortlist one grant and one microloan option.",
      "Prepare a one-page business need and repayment plan.",
      "Bring your current weekly cashflow estimates to application support.",
    ],
    agricultural_cooperative: [
      "Identify one local cooperative in your district.",
      "Verify joining criteria and seasonal activity timing.",
      "Start with one market-linked production plan.",
    ],
  };

  const actions = base[typeId] ?? ["Review this pathway with a navigator and set a 30-day action plan."];
  const currency = countryConfig?.currency;
  if (currency && typeId === "self_employment") {
    return [...actions.slice(0, 2), `Set a weekly savings target for tools and working capital in ${currency}.`];
  }
  return actions;
}

function confidenceBand(score) {
  if (score >= 0.75) return "high";
  if (score >= 0.5) return "medium";
  return "low";
}

function buildOpportunity({ typeConfig, module1Output, countryConfig, topOccupation, skillSignal, missingSkills }) {
  const typeId = typeConfig.id;
  const score = scoreByType({
    typeId,
    weight: typeConfig.weight ?? 1,
    module1Output,
    topOccupation,
    skillSignal,
    countryConfig,
  });
  const providers = Array.isArray(typeConfig.providers) ? typeConfig.providers : [];
  const minWage = Number(countryConfig?.opportunities?.min_wage_monthly);

  return {
    id: `${countryConfig.country_code || "XX"}-${typeId}`,
    type: typeId,
    title: typeConfig.label || typeConfig.label_short || typeId,
    match_score: Number(score.toFixed(4)),
    confidence: confidenceBand(score),
    rationale: buildRationale({ typeId, typeConfig, module1Output, topOccupation, skillSignal, score }),
    estimated_income: Number.isFinite(minWage)
      ? {
          min: Math.round(minWage * (typeId === "formal_employment" ? 1 : 0.7)),
          max: Math.round(minWage * (typeId === "vocational_training" ? 0.9 : 1.8)),
          currency: countryConfig?.currency ?? countryConfig?.opportunities?.currency ?? null,
          period: "month",
        }
      : undefined,
    requirements: typeConfig.requires_credential
      ? ["Requires proof of credential or prior certification."]
      : ["No strict credential requirement in baseline configuration."],
    missing_skills: typeId === "vocational_training" || typeId === "formal_employment" ? missingSkills : [],
    providers,
    next_actions: buildNextActions(typeId, countryConfig),
    econometric_context: [
      `Country pathway weight: ${Math.round(clamp(Number(typeConfig.weight) || 0, 0, 1) * 100)}%`,
      Number.isFinite(minWage) ? `Minimum wage reference: ${Math.round(minWage)} ${countryConfig?.opportunities?.currency ?? ""}/month` : null,
      countryConfig?.labor_market?.uncertainty_note ?? null,
    ].filter(Boolean),
    source_tags: ["country_opportunity_config", "module1_profile_output", "deterministic_module3_engine"],
  };
}

function buildPolicyDashboard(countryConfig, econometrics, opportunities) {
  const topTypes = opportunities.slice(0, 3).map((item) => ({
    type: item.type,
    label: item.title,
    score: item.match_score,
  }));
  const priorities = {
    priority_sectors: countryConfig?.priority_sectors ?? [],
    priority_isco_groups: countryConfig?.priority_isco_groups ?? [],
  };

  return {
    country: {
      code: countryConfig?.country_code ?? null,
      name: countryConfig?.country_name ?? null,
      income_level: countryConfig?.world_bank?.income_level ?? null,
      region: countryConfig?.world_bank?.region ?? null,
    },
    opportunity_mix_top3: topTypes,
    priorities,
    diagnostics: {
      total_econometric_signals: econometrics.signal_count,
      visible_to_youth_count: econometrics.visible_signals_youth.length,
      infrastructure_level: countryConfig?.digital_infrastructure?.infrastructure_level ?? null,
      data_vintage: countryConfig?.labor_market?.data_vintage ?? null,
    },
    labor_market_snapshot: {
      sector_shares: countryConfig?.labor_market?.sector_shares ?? null,
      uncertainty_note: countryConfig?.labor_market?.uncertainty_note ?? null,
    },
  };
}

export function generateModule3Opportunities({
  module1Output,
  countryConfig,
  limit = 8,
  includeTypes,
}) {
  const types = parseCountryOpportunityTypes(countryConfig);
  const filteredTypes = Array.isArray(includeTypes) && includeTypes.length
    ? types.filter((type) => includeTypes.includes(type.id))
    : types;

  const topOccupation = getTopOccupation(module1Output);
  const skillSignal = parseSkillSignals(module1Output);
  const missingSkills = buildMissingSkills(module1Output, skillSignal.names);
  const econometrics = buildEconometricSignals(countryConfig, module1Output);

  const opportunities = filteredTypes
    .map((typeConfig) =>
      buildOpportunity({
        typeConfig,
        module1Output,
        countryConfig,
        topOccupation,
        skillSignal,
        missingSkills,
      })
    )
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, Number(limit) || 8);

  return {
    opportunities,
    econometric_dashboard: {
      youth_view: {
        headline: "Grounded opportunity outlook from real labor market data",
        visible_signals: econometrics.visible_signals_youth,
        all_signals: econometrics.all_signals,
        signal_note:
          "Signals are shown directly to the user and sourced from WDI/ILOSTAT/country wage data, not hidden inside ranking.",
      },
      policymaker_view: buildPolicyDashboard(countryConfig, econometrics, opportunities),
    },
    metadata: {
      country_code: countryConfig?.country_code ?? "GH",
      country_name: countryConfig?.country_name ?? "Unknown",
      input_language: module1Output?.input_summary?.detected_language ?? "unknown",
      top_occupation: topOccupation
        ? {
            isco_code: topOccupation.isco_code ?? null,
            title: topOccupation.title ?? null,
            confidence: Number(topOccupation.confidence ?? 0),
          }
        : null,
      skills_detected: skillSignal.skills.length,
      average_skill_confidence: Number(skillSignal.avgConfidence.toFixed(4)),
      readiness_signal: toConfidenceLabel(inferAutomationReadiness(module1Output)),
      econometric_signal_count: econometrics.signal_count,
      generated_at: new Date().toISOString(),
      version: "module3-v2-econometric-dashboard",
    },
  };
}
