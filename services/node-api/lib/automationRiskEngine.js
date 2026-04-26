function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function average(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function resolveScenario(automationConfig, scenarioId) {
  const toggles = Array.isArray(automationConfig?.scenario_toggles) ? automationConfig.scenario_toggles : [];
  if (!toggles.length) return { id: "current", label: "Current scenario", multiplier_adjustment: 0 };
  if (!scenarioId) return toggles.find((toggle) => toggle.id === "current") ?? toggles[0];
  return toggles.find((toggle) => toggle.id === scenarioId) ?? toggles.find((toggle) => toggle.id === "current") ?? toggles[0];
}

function resolveTaskMultipliers(automationConfig, taskProfile = {}) {
  const defaults = {
    physical_manual: 1,
    routine_cognitive: 1,
    non_routine_cognitive: 1,
    social_interactive: 1,
  };
  const multipliers = { ...defaults, ...(automationConfig?.calibration?.multipliers ?? {}) };
  const weights = {
    physical_manual: Number(taskProfile.physical_manual_weight ?? 0.25),
    routine_cognitive: Number(taskProfile.routine_cognitive_weight ?? 0.25),
    non_routine_cognitive: Number(taskProfile.non_routine_cognitive_weight ?? 0.25),
    social_interactive: Number(taskProfile.social_interactive_weight ?? 0.25),
  };

  const weightSum = Object.values(weights).reduce((sum, weight) => sum + (Number.isFinite(weight) ? weight : 0), 0);
  const normalized = weightSum > 0
    ? Object.fromEntries(Object.entries(weights).map(([key, weight]) => [key, clamp(weight / weightSum)]))
    : { physical_manual: 0.25, routine_cognitive: 0.25, non_routine_cognitive: 0.25, social_interactive: 0.25 };

  const weightedMultiplier =
    normalized.physical_manual * multipliers.physical_manual +
    normalized.routine_cognitive * multipliers.routine_cognitive +
    normalized.non_routine_cognitive * multipliers.non_routine_cognitive +
    normalized.social_interactive * multipliers.social_interactive;

  return {
    multipliers,
    weights: normalized,
    weighted_multiplier: clamp(weightedMultiplier, 0.1, 1.5),
  };
}

function classifyRisk(adjustedRisk, thresholds) {
  const low = Number(thresholds?.low ?? 0.3);
  const medium = Number(thresholds?.medium ?? 0.6);
  if (adjustedRisk < low) return "low";
  if (adjustedRisk < medium) return "medium";
  return "high";
}

function buildEconometricSignals(countryConfig) {
  const minWage = Number(countryConfig?.opportunities?.min_wage_monthly);
  const digital = countryConfig?.digital_infrastructure ?? {};
  const labor = countryConfig?.labor_market ?? {};

  const signals = [
    Number.isFinite(minWage)
      ? {
          id: "minimum_wage_monthly",
          label: "Minimum wage monthly reference",
          value: Math.round(minWage),
          unit: countryConfig?.opportunities?.currency ?? countryConfig?.currency ?? "local_currency",
          source: countryConfig?.opportunities?.min_wage_source ?? countryConfig?.opportunities?.min_wage_note ?? "country config",
        }
      : null,
    Number.isFinite(Number(digital.mobile_broadband_per_100))
      ? {
          id: "mobile_broadband_per_100",
          label: "Mobile broadband subscriptions",
          value: Number(digital.mobile_broadband_per_100),
          unit: "per_100",
          source: digital.source ?? "ITU/WDI",
        }
      : null,
    Number.isFinite(Number(digital.internet_users_pct))
      ? {
          id: "internet_users_pct",
          label: "Internet users",
          value: Number(digital.internet_users_pct),
          unit: "percent",
          source: digital.source ?? "ITU/WDI",
        }
      : null,
    Number.isFinite(Number(labor.self_employed_pct_wdi))
      ? {
          id: "self_employed_pct",
          label: "Self-employment share",
          value: Number(labor.self_employed_pct_wdi),
          unit: "percent",
          source: "World Bank WDI",
        }
      : null,
  ].filter(Boolean);

  return signals;
}

export function calculateAutomationRisk({
  countryConfig,
  baseRisk,
  occupation,
  scenarioId,
  taskProfile,
}) {
  const automation = countryConfig?.automation ?? {};
  const scenario = resolveScenario(automation, scenarioId);
  const uncertaintyBand = Number(automation.uncertainty_band ?? 0.15);
  const thresholds = automation.risk_thresholds ?? { low: 0.3, medium: 0.6, high: 1.0 };

  const explicitBaseRisk = Number(baseRisk);
  const candidateRisk = average([
    explicitBaseRisk,
    Number(occupation?.automation_risk_base),
    Number(occupation?.base_risk),
    Number(occupation?.risk),
  ]);
  const resolvedBaseRisk = clamp(candidateRisk ?? 0.5);

  const task = resolveTaskMultipliers(automation, taskProfile);
  const scenarioAdjustment = Number(scenario?.multiplier_adjustment ?? 0);
  const adjustedRisk = clamp(resolvedBaseRisk * task.weighted_multiplier + scenarioAdjustment);
  const riskBand = classifyRisk(adjustedRisk, thresholds);

  return {
    input: {
      country_code: countryConfig?.country_code ?? null,
      scenario: scenario?.id ?? "current",
      occupation: occupation?.title ?? null,
      occupation_code: occupation?.isco_code ?? occupation?.esco_code ?? null,
      base_risk: Number(resolvedBaseRisk.toFixed(4)),
    },
    output: {
      adjusted_risk: Number(adjustedRisk.toFixed(4)),
      risk_band: riskBand,
      uncertainty_range: {
        low: Number(clamp(adjustedRisk - uncertaintyBand).toFixed(4)),
        high: Number(clamp(adjustedRisk + uncertaintyBand).toFixed(4)),
        uncertainty_band: Number(uncertaintyBand.toFixed(4)),
      },
      thresholds: {
        low: Number(Number(thresholds.low ?? 0.3).toFixed(4)),
        medium: Number(Number(thresholds.medium ?? 0.6).toFixed(4)),
        high: Number(Number(thresholds.high ?? 1.0).toFixed(4)),
      },
    },
    calibration: {
      time_horizon_years: Number(automation.time_horizon_years ?? 10),
      infrastructure_level: automation.infrastructure_level ?? countryConfig?.digital_infrastructure?.infrastructure_level ?? null,
      weighted_task_multiplier: Number(task.weighted_multiplier.toFixed(4)),
      task_multipliers: task.multipliers,
      task_weights: task.weights,
      scenario_adjustment: Number(scenarioAdjustment.toFixed(4)),
      rationale: automation?.calibration?.rationale ?? null,
      scenario_note: scenario?.note ?? null,
    },
    econometric_signals: buildEconometricSignals(countryConfig),
    explainability: {
      formula:
        "adjusted_risk = clamp(base_risk * weighted_task_multiplier + scenario_adjustment, 0, 1)",
      evidence: [
        `Base risk ${Number(resolvedBaseRisk.toFixed(2))} from input occupation/profile.`,
        `Weighted task multiplier ${Number(task.weighted_multiplier.toFixed(2))} from country calibration multipliers.`,
        `Scenario adjustment ${Number(scenarioAdjustment.toFixed(2))} from selected scenario toggle.`,
      ],
    },
    sources: {
      base_dataset: automation.base_dataset ?? null,
      base_dataset_source: automation.base_dataset_source ?? null,
      source_label: automation.source_label ?? null,
      source_url: automation.source_url ?? null,
    },
  };
}
