/**
 * Module 2 — Labor Market Risk Analysis Engine.
 *
 * Five-step pipeline:
 *   1–2  Deterministic: Frey-Osborne + O*NET crosswalk → LMIC calibration
 *   3–5  LLM-assisted (OpenRouter, template fallback):
 *         task decomposition, skill resilience, macro context
 */

import { OpenRouter } from "@openrouter/sdk";
import { getByONetLinks, getByISCOGroup } from "./automation-lookup.js";
import { calibrateForLMIC, getCountryLaborStats } from "./lmic-calibrator.js";
import { getTaxonomyIndex } from "./dataStore.js";

const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL ?? "openai/gpt-oss-120b:free";
const LLM_TIMEOUT_MS   = Number(
  process.env.RISK_LLM_TIMEOUT_MS ??
  process.env.LLM_TIMEOUT_MS ??
  35000
);

let _client = null;
function getClient() {
  _client ??= new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
  return _client;
}

function withTimeout(promise, ms) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`LLM timeout after ${ms}ms`)), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

function computeBaseAutomation(occupation) {
  const onetLinks = occupation.onet?.matches ?? [];
  const onetResult = getByONetLinks(onetLinks);
  if (onetResult) return onetResult;

  const groupResult = getByISCOGroup(occupation.isco_code);
  if (groupResult) return groupResult;

  return null;
}

const SYSTEM_PROMPT = `You are a labor economics analyst specialising in automation risk and LMIC labor markets.

You will receive a structured occupation profile with pre-computed automation probabilities. Your job is to:
1. Decompose the occupation into high-risk and low-risk tasks (step 3).
2. Classify the skills into at-risk, durable, and adjacent-upskilling categories (step 4).
3. Summarise macro trends affecting this occupation in the given country (step 5).

Rules you MUST follow:
- Do NOT invent or change any numeric probability values. They are provided to you.
- Base skill analysis ONLY on the skills listed in the profile. Do not add new ones.
- Be conservative; prefer lower risk ratings over aggressive claims.
- Risk scores must be between 0.0 and 1.0.
- Return valid JSON only. No markdown. No prose outside the JSON object.`;

function buildAnalysisPrompt(occupation, skills, country, automation, laborStats) {
  const onetTasks = (occupation.onet?.enrichments ?? [])
    .slice(0, 2)
    .flatMap((e) => (e.tasks ?? []).slice(0, 6).map((t) => t.task))
    .slice(0, 10);

  const wic = laborStats?.wittgenstein_projections ?? null;

  const context = {
    isco_code: occupation.isco_code,
    occupation_title: occupation.label,
    esco_code: occupation.esco_code,
    sector: occupation.sectors?.[0] ?? "unknown",
    skills_from_profile: skills,
    onet_sample_tasks: onetTasks,
    country: {
      name: country.country_name,
      code: country.country_code,
      world_bank_income: country.world_bank?.income_level_iso3v3 ?? country.world_bank?.income_level_id ?? "unknown",
      agriculture_share_2024: laborStats?.employment_by_sector?.agriculture_share ?? null,
      advanced_education_share_2024: laborStats?.labor_force_by_education?.advanced_share ?? null,
      wittgenstein_secondary_completion_2040: wic?.secondary_completion_2040 ?? null,
      wittgenstein_tertiary_share_2040: wic?.tertiary_share_2040 ?? null,
    },
    pre_computed_automation: {
      base_probability: automation.base,
      adjusted_probability: automation.adjusted,
      adjustment_factor: automation.adjustment_factor,
      note: "These values are fixed. Do not change them in your output.",
    },
  };

  return `${JSON.stringify(context, null, 2)}

Analyse this occupation profile and return ONLY the following JSON object:
{
  "task_breakdown": {
    "high_risk_tasks": [{ "task": "<description>", "risk_score": <0.0-1.0> }],
    "low_risk_tasks": [{ "task": "<description>", "risk_score": <0.0-1.0> }]
  },
  "skill_resilience_analysis": {
    "at_risk_skills": ["<skill label>"],
    "durable_skills": ["<skill label>"],
    "adjacent_skills": ["<skill label — upskilling pathway>"]
  },
  "macro_signals": {
    "education_projection": "<1-2 sentences>",
    "labor_shift_trend": "<1-2 sentences>"
  },
  "final_readiness_profile": {
    "risk_level": "<low|medium|high|very high>",
    "resilience_level": "<low|medium|high>",
    "opportunity_type": "<displacement|stable|upskilling_required|growth_area>",
    "summary": "<2-3 sentence summary>"
  },
  "explainability": { "key_drivers": ["<driver 1>", "<driver 2>", "<driver 3>"] }
}

Constraints:
- high_risk_tasks: 2-4. low_risk_tasks: 2-4.
- at_risk_skills and durable_skills ONLY from skills_from_profile.
- adjacent_skills: 1-3 closely related upskilling areas.
- key_drivers: exactly 3 items.`;
}

const ISCO_TEMPLATE_TASKS = {
  "1": { high: ["Coordinate and schedule operational activities", "Monitor budget and resource allocation"], low: ["Negotiate with clients and partners", "Mentor and develop team members"] },
  "2": { high: ["Document and file case records", "Apply established research procedures"], low: ["Diagnose complex or unusual situations", "Advise clients on specialized matters"] },
  "3": { high: ["Record and log data from instruments or equipment", "Apply standard testing protocols"], low: ["Troubleshoot non-routine technical faults", "Coordinate with clients on technical issues"] },
  "4": { high: ["Process and file standard documents", "Enter data into information systems"], low: ["Handle customer inquiries and complaints", "Resolve data discrepancies"] },
  "5": { high: ["Process routine transactions", "Maintain inventory counts"], low: ["Serve and assist customers directly", "Adapt service to customer needs"] },
  "6": { high: ["Apply standard planting or harvesting methods", "Sort and grade produce"], low: ["Monitor crop or animal health conditions", "Operate in variable terrain and weather"] },
  "7": { high: ["Perform repetitive assembly or fabrication tasks", "Apply standard finishing operations"], low: ["Diagnose and repair non-standard faults", "Adapt methods to varying materials or conditions"] },
  "8": { high: ["Operate machinery on a fixed production line", "Load and unload materials according to schedule"], low: ["Monitor equipment for abnormal conditions", "Respond to mechanical breakdowns"] },
  "9": { high: ["Perform routine cleaning or sorting tasks", "Follow simple sequential instructions"], low: ["Navigate changing physical environments", "Interact directly with the public"] },
};

function buildTemplateFallback(occupation, skills, automation, laborStats) {
  const prob = automation.adjusted;
  const riskLevel = prob >= 0.7 ? "very high" : prob >= 0.5 ? "high" : prob >= 0.3 ? "medium" : "low";
  const iscoMajor = String(occupation.isco_code ?? "7")[0];
  const templates = ISCO_TEMPLATE_TASKS[iscoMajor] ?? ISCO_TEMPLATE_TASKS["7"];

  const onetTasks = (occupation.onet?.enrichments ?? [])
    .slice(0, 1)
    .flatMap((e) => (e.tasks ?? []).slice(0, 4).map((t) => t.task));

  const highRiskSource = onetTasks.length >= 2 ? onetTasks.slice(0, 2) : templates.high;
  const lowRiskSource  = onetTasks.length >= 4 ? onetTasks.slice(2, 4) : templates.low;

  const highRisk = highRiskSource.map((t) => ({ task: t, risk_score: Number((prob * 0.9).toFixed(2)) }));
  const lowRisk  = lowRiskSource.map((t) => ({ task: t, risk_score: Number((prob * 0.35).toFixed(2)) }));

  const half = Math.ceil(skills.length / 2);

  const wic = laborStats?.wittgenstein_projections;
  let educationProjection = "Education projection data not available.";
  let laborShiftTrend = "Labor shift trend data not available.";

  if (wic) {
    const belowSec = wic.below_secondary_share;
    const tertiary = wic.tertiary_share;
    const secCompletion = wic.secondary_completion_rate;
    educationProjection = wic.youth_summary
      ? `${wic.youth_summary} (Wittgenstein Centre ${wic.year}, SSP2).`
      : `${belowSec}% of youth (15-24) have below-secondary education; ${secCompletion}% have upper-secondary or above (Wittgenstein WCDE ${wic.year}).`;
    if (wic.education_trend) {
      educationProjection += ` Trend: ${wic.education_trend}.`;
    }
  }

  if (laborStats?.employment_by_sector) {
    const agr = laborStats.employment_by_sector.agriculture_share;
    const svc = laborStats.employment_by_sector.services_share;
    if (agr != null && svc != null) {
      laborShiftTrend = `Agriculture employs ${(agr * 100).toFixed(0)}% of workers while services account for ${(svc * 100).toFixed(0)}% (ILOSTAT ${laborStats.year}).`;
    }
  }

  return {
    task_breakdown: { high_risk_tasks: highRisk, low_risk_tasks: lowRisk },
    skill_resilience_analysis: {
      at_risk_skills:  skills.slice(0, half),
      durable_skills:  skills.slice(half),
      adjacent_skills: [],
    },
    macro_signals: {
      education_projection: educationProjection,
      labor_shift_trend: laborShiftTrend,
    },
    final_readiness_profile: {
      risk_level: riskLevel,
      resilience_level: prob >= 0.6 ? "low" : "medium",
      opportunity_type: prob >= 0.65 ? "upskilling_required" : "stable",
      summary: `Adjusted automation probability ${prob} implies ${riskLevel} risk. ${educationProjection}`,
    },
    explainability: {
      key_drivers: [
        `Adjusted automation probability ${prob} (base × LMIC factor ${automation.adjustment_factor}).`,
        `ISCO group ${iscoMajor} task structure.`,
        wic ? `Wittgenstein data: ${wic.below_secondary_share}% of youth below secondary education.` : "LMIC context reduces near-term automation risk vs OECD baseline.",
      ],
    },
    _provider: "template_fallback",
    _fallback_reason: "unknown",
  };
}

async function runLLMAnalysis(occupation, skills, country, automation, laborStats) {
  if (!process.env.OPENROUTER_API_KEY) {
    return {
      ...buildTemplateFallback(occupation, skills, automation, laborStats),
      _fallback_reason: "missing_openrouter_api_key",
    };
  }

  const callLLMOnce = async () => {
    const client = getClient();
    const result = await withTimeout(
      client.chat.send({
        chatRequest: {
          model: OPENROUTER_MODEL,
          maxTokens: 1200,
          responseFormat: { type: "json_object" },
          stream: false,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: buildAnalysisPrompt(occupation, skills, country, automation, laborStats) },
          ],
        },
      }),
      LLM_TIMEOUT_MS
    );

    const raw = result.choices?.[0]?.message?.content ?? "";
    if (!raw.trim()) throw new Error("Empty LLM response");

    const parsed = JSON.parse(
      raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim()
    );

    const required = ["task_breakdown", "skill_resilience_analysis", "macro_signals", "final_readiness_profile", "explainability"];
    for (const key of required) {
      if (!parsed[key]) throw new Error(`LLM response missing key: ${key}`);
    }
    return parsed;
  };

  const attempts = [1, 2];
  let lastError = null;
  for (const attempt of attempts) {
    try {
      const parsed = await callLLMOnce();
      return { ...parsed, _provider: `openrouter/${OPENROUTER_MODEL}` };
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[risk-engine] LLM attempt ${attempt}/${attempts.length} failed (${msg})`);
      if (attempt < attempts.length) continue;
    }
  }

  const reason = lastError instanceof Error ? lastError.message : "unknown_llm_error";
  console.warn(`[risk-engine] LLM failed after retry (${reason}) — using template fallback`);
  return {
    ...buildTemplateFallback(occupation, skills, automation, laborStats),
    _fallback_reason: reason,
  };
}

/**
 * Run the full Module 2 risk analysis pipeline.
 *
 * @param {{ profile: object, country: object }} params
 * @returns {Promise<object>}
 */
export async function analyseRisk({ profile, country }) {
  const taxonomy = getTaxonomyIndex();
  const occupationId = profile.primary_occupation?.occupation_id;
  const occupation = occupationId ? taxonomy.occupations[occupationId] : null;

  const baseResult =
    occupation
      ? computeBaseAutomation(occupation)
      : getByISCOGroup(profile.primary_occupation?.isco_code);

  const baseProbability = baseResult?.probability ?? null;
  const baseSource      = baseResult?.source ?? "unavailable";

  const lmicResult = baseProbability !== null
    ? calibrateForLMIC(baseProbability, country)
    : null;

  const adjustedProbability = lmicResult?.adjusted_probability ?? baseProbability ?? null;
  const adjustmentFactor    = lmicResult?.adjustment_factor ?? 1.0;

  const automationSummary = {
    base: baseProbability,
    adjusted: adjustedProbability,
    adjustment_factor: adjustmentFactor,
    base_source: baseSource,
  };

  const skillLabels = (profile.skills?.mapped ?? []).map((s) => s.plain_label || s.label);
  const laborStats = getCountryLaborStats(country.country_code);

  const llmResult = await runLLMAnalysis(occupation ?? {}, skillLabels, country, automationSummary, laborStats);

  return {
    isco_code: profile.primary_occupation?.isco_code ?? "",
    occupation_title: profile.primary_occupation?.title ?? "",

    automation_analysis: {
      source_model: "Frey-Osborne (2017) + ILO LMIC adjustment",
      base_automation_probability: baseProbability,
      base_source: baseSource,
      lmic_adjustment_explanation: lmicResult?.explanation ?? ["No LMIC adjustment applied — base probability unavailable."],
      adjustment_factor: adjustmentFactor,
      adjusted_automation_probability: adjustedProbability,
      uncertainty_band: lmicResult?.uncertainty_band ?? 0.15,
      scenario_toggles: lmicResult?.scenario_toggles ?? [],
      sources: lmicResult?.sources ?? [],
    },

    task_breakdown: llmResult.task_breakdown,
    skill_resilience_analysis: llmResult.skill_resilience_analysis,

    economic_context: {
      country: country.country_name,
      informality_level: laborStats
        ? `Agriculture share ${(laborStats.employment_by_sector.agriculture_share * 100).toFixed(1)}% (ILOSTAT ${laborStats.year})`
        : "Data not available",
      interpretation: lmicResult?.explanation?.[0] ?? "LMIC calibration not available",
    },

    macro_signals: llmResult.macro_signals,
    final_readiness_profile: llmResult.final_readiness_profile,
    explainability: llmResult.explainability,

    _meta: {
      analysis_provider: llmResult._provider ?? "unknown",
      fallback_reason: llmResult._provider === "template_fallback"
        ? (llmResult._fallback_reason ?? "unknown")
        : null,
      profile_id: profile.id,
      generated_at: new Date().toISOString(),
    },
  };
}
