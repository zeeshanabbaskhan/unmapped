/**
 * Module 2 — Labor Market Risk Analysis Engine.
 *
 * Analyses an occupation profile and estimates automation / AI impact in a
 * specific country context. The pipeline has five steps:
 *
 *   Steps 1–2  Deterministic (no LLM):
 *     1. Automation risk estimation (Frey-Osborne + O*NET crosswalk)
 *     2. LMIC calibration (country config + ILOSTAT labor structure)
 *
 *   Steps 3–5  LLM-assisted (OpenRouter, falls back to structured templates):
 *     3. Task decomposition (high-risk vs low-risk tasks)
 *     4. Skill resilience analysis (at-risk / durable / adjacent)
 *     5. Macro context overlay (education projection + labor shift trend)
 *
 * Output is the strict JSON schema defined in the product spec.
 * Numeric values in the output come ONLY from the deterministic steps or the
 * Module 1 profile — the LLM provides narrative and classification only.
 */

import { OpenRouter } from "@openrouter/sdk";
import { getByONetLinks, getByISCOGroup } from "./automation-lookup.js";
import { calibrateForLMIC, getCountryLaborStats } from "./lmic-calibrator.js";
import { getTaxonomyIndex } from "./dataStore.js";

const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL ?? "openai/gpt-oss-120b:free";
const LLM_TIMEOUT_MS   = Number(process.env.LLM_TIMEOUT_MS ?? 20000);

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

// ---------------------------------------------------------------------------
// Step 1 — Automation risk estimation
// ---------------------------------------------------------------------------

function computeBaseAutomation(occupation) {
  // Tier 1: weighted average via pre-computed O*NET links in taxonomy
  const onetLinks = occupation.onet?.matches ?? [];
  const onetResult = getByONetLinks(onetLinks);
  if (onetResult) return onetResult;

  // Tier 2: ISCO major-group fallback (documented group averages)
  const groupResult = getByISCOGroup(occupation.isco_code);
  if (groupResult) return groupResult;

  // Tier 3: no data — return null; risk engine will mark confidence as none
  return null;
}

// ---------------------------------------------------------------------------
// Step 3–5 — LLM analysis prompt
// ---------------------------------------------------------------------------

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
      world_bank_income: country.world_bank?.income_level_iso3v3 ?? "unknown",
      agriculture_share_2024: laborStats?.employment_by_sector?.agriculture_share ?? null,
      advanced_education_share_2024: laborStats?.labor_force_by_education?.advanced_share ?? null,
      wittgenstein_secondary_completion_2040: wic?.secondary_completion_2040 ?? null,
      wittgenstein_tertiary_share_2040: wic?.tertiary_share_2040 ?? null,
      wittgenstein_source: wic?.source ?? null,
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
    "high_risk_tasks": [
      { "task": "<task description>", "risk_score": <0.0-1.0> }
    ],
    "low_risk_tasks": [
      { "task": "<task description>", "risk_score": <0.0-1.0> }
    ]
  },
  "skill_resilience_analysis": {
    "at_risk_skills": ["<skill label>"],
    "durable_skills": ["<skill label>"],
    "adjacent_skills": ["<skill label — upskilling pathway>"]
  },
  "macro_signals": {
    "education_projection": "<1-2 sentences on education trend in this country, citing Wittgenstein projections if available>",
    "labor_shift_trend": "<1-2 sentences on informal→semi-formal transition trend>"
  },
  "final_readiness_profile": {
    "risk_level": "<low|medium|high|very high>",
    "resilience_level": "<low|medium|high>",
    "opportunity_type": "<displacement|stable|upskilling_required|growth_area>",
    "summary": "<2-3 sentence summary>"
  },
  "explainability": {
    "key_drivers": ["<driver 1>", "<driver 2>", "<driver 3>"]
  }
}

Constraints:
- high_risk_tasks: 2–4 tasks. low_risk_tasks: 2–4 tasks.
- at_risk_skills and durable_skills must come ONLY from skills_from_profile.
- adjacent_skills may suggest 1-3 closely related upskilling areas not in the profile.
- risk_level and resilience_level must be consistent with adjusted_probability ${automation.adjusted}.
- key_drivers: exactly 3 items.`;
}

// ---------------------------------------------------------------------------
// LLM call with template fallback
// ---------------------------------------------------------------------------

async function runLLMAnalysis(occupation, skills, country, automation, laborStats) {
  if (!process.env.OPENROUTER_API_KEY) {
    return buildTemplateFallback(occupation, skills, automation);
  }

  try {
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

    // Validate required keys — if anything is missing, fall back
    const required = ["task_breakdown", "skill_resilience_analysis", "macro_signals", "final_readiness_profile", "explainability"];
    for (const key of required) {
      if (!parsed[key]) throw new Error(`LLM response missing key: ${key}`);
    }
    return { ...parsed, _provider: `openrouter/${OPENROUTER_MODEL}` };
  } catch (err) {
    console.warn(`[risk-engine] LLM failed (${err.message}) — using template fallback`);
    return buildTemplateFallback(occupation, skills, automation);
  }
}

// Generic ISCO task templates used when O*NET data is not available in the
// taxonomy. Based on ILO task classification by ISCO major group.
const ISCO_TEMPLATE_TASKS = {
  "1": {
    high: ["Coordinate and schedule operational activities", "Monitor budget and resource allocation"],
    low:  ["Negotiate with clients and partners", "Mentor and develop team members"],
  },
  "2": {
    high: ["Document and file case records", "Apply established research procedures"],
    low:  ["Diagnose complex or unusual situations", "Advise clients on specialized matters"],
  },
  "3": {
    high: ["Record and log data from instruments or equipment", "Apply standard testing protocols"],
    low:  ["Troubleshoot non-routine technical faults", "Coordinate with clients on technical issues"],
  },
  "4": {
    high: ["Process and file standard documents", "Enter data into information systems"],
    low:  ["Handle customer inquiries and complaints", "Resolve data discrepancies"],
  },
  "5": {
    high: ["Process routine transactions", "Maintain inventory counts"],
    low:  ["Serve and assist customers directly", "Adapt service to customer needs"],
  },
  "6": {
    high: ["Apply standard planting or harvesting methods", "Sort and grade produce"],
    low:  ["Monitor crop or animal health conditions", "Operate in variable terrain and weather"],
  },
  "7": {
    high: ["Perform repetitive assembly or fabrication tasks", "Apply standard finishing operations"],
    low:  ["Diagnose and repair non-standard faults", "Adapt methods to varying materials or conditions"],
  },
  "8": {
    high: ["Operate machinery on a fixed production line", "Load and unload materials according to schedule"],
    low:  ["Monitor equipment for abnormal conditions", "Respond to mechanical breakdowns"],
  },
  "9": {
    high: ["Perform routine cleaning or sorting tasks", "Follow simple sequential instructions"],
    low:  ["Navigate changing physical environments", "Interact directly with the public"],
  },
};

function buildTemplateFallback(occupation, skills, automation) {
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
  return {
    task_breakdown: { high_risk_tasks: highRisk, low_risk_tasks: lowRisk },
    skill_resilience_analysis: {
      at_risk_skills:  skills.slice(0, half),
      durable_skills:  skills.slice(half),
      adjacent_skills: [],
    },
    macro_signals: {
      education_projection: "LLM unavailable — education projection analysis requires OpenRouter API access.",
      labor_shift_trend: "LLM unavailable — labor shift trend analysis requires OpenRouter API access.",
    },
    final_readiness_profile: {
      risk_level: riskLevel,
      resilience_level: prob >= 0.6 ? "low" : "medium",
      opportunity_type: prob >= 0.65 ? "upskilling_required" : "stable",
      summary: `Template fallback (LLM unavailable). Adjusted automation probability ${prob} implies ${riskLevel} risk for this occupation in the given country context.`,
    },
    explainability: {
      key_drivers: [
        `Adjusted automation probability ${prob} (base × LMIC factor ${automation.adjustment_factor}).`,
        `ISCO group ${iscoMajor} task structure — high-risk tasks are repetitive/procedural; low-risk tasks involve contextual judgment.`,
        "LMIC context reduces near-term automation risk vs OECD baseline due to informality and infrastructure constraints.",
      ],
    },
    _provider: "template_fallback",
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Run the full Module 2 risk analysis pipeline.
 *
 * @param {object} params
 * @param {object} params.profile    - Module 1 profile output (from buildProfile)
 * @param {object} params.country    - Country config object from country_registry
 * @returns {Promise<object>}        - Risk analysis in the Module 2 JSON schema
 */
export async function analyseRisk({ profile, country }) {
  // Resolve occupation from taxonomy for O*NET task data
  const taxonomy = getTaxonomyIndex();
  const occupationId = profile.primary_occupation?.occupation_id;
  const occupation = occupationId ? taxonomy.occupations[occupationId] : null;

  // Step 1 — Base automation probability
  const baseResult =
    occupation
      ? computeBaseAutomation(occupation)
      : getByISCOGroup(profile.primary_occupation?.isco_code);

  const baseProbability = baseResult?.probability ?? null;
  const baseSource      = baseResult?.source ?? "unavailable";

  // Step 2 — LMIC calibration
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

  // Collect skills from the profile (Module 1 only — no hallucination)
  const skillLabels = (profile.skills?.mapped ?? []).map((s) => s.plain_label || s.label);

  // Country labor stats for macro context
  const laborStats = getCountryLaborStats(country.country_code);

  // Steps 3–5 — LLM analysis
  const llmResult = await runLLMAnalysis(occupation ?? {}, skillLabels, country, automationSummary, laborStats);

  // Assemble final output per the strict JSON schema
  return {
    isco_code: profile.primary_occupation?.isco_code ?? "",
    occupation_title: profile.primary_occupation?.title ?? "",

    automation_analysis: {
      source_model: "Frey-Osborne (2017) + ILO LMIC adjustment",
      base_automation_probability: baseProbability,
      base_source: baseSource,
      lmic_adjustment_explanation: lmicResult?.explanation ?? [
        "No LMIC adjustment applied — base probability unavailable.",
      ],
      adjustment_factor: adjustmentFactor,
      adjusted_automation_probability: adjustedProbability,
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
      profile_id: profile.id,
      generated_at: new Date().toISOString(),
    },
  };
}
