/**
 * Module 3 — Labor Market Opportunity Matching Engine.
 *
 * Matches a worker's occupation profile to REALISTIC economic opportunities
 * in their local labor market. Grounded in ISCO-08 structure, ILOSTAT
 * sector data, country config, and Module 2 risk output.
 *
 * Pipeline:
 *   Step 1  Deterministic: Labor market anchoring
 *   Steps 2-5  LLM-assisted (OpenRouter, falls back to ISCO templates):
 *     2. Opportunity mapping (direct / adjacent / micro-enterprise)
 *     3. Economic feasibility scoring
 *     4. Ranking by feasibility
 *     5. Policy view
 */

import { OpenRouter } from "@openrouter/sdk";
import { getCountryLaborStats } from "./lmic-calibrator.js";
import { getOpportunitiesConfig, getGeneratedCountryConfig } from "./dataStore.js";

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

const ISCO_SECTOR_MAP = {
  "1": ["services", "industry"], "2": ["services"], "3": ["services", "industry"],
  "4": ["services"], "5": ["services"], "6": ["agriculture"],
  "7": ["industry", "services"], "8": ["industry"], "9": ["agriculture", "services", "industry"],
};

const ISCO_FORMALITY_MAP = {
  "1": "formal", "2": "formal", "3": "formal", "4": "hybrid", "5": "hybrid",
  "6": "informal", "7": "hybrid", "8": "hybrid", "9": "informal",
};

function anchorLaborMarket(profile, country, laborStats) {
  const iscoCode  = profile.primary_occupation?.isco_code ?? "";
  const iscoMajor = String(iscoCode)[0] ?? "7";
  const formality = ISCO_FORMALITY_MAP[iscoMajor] ?? "hybrid";
  const priorityGroups = country.priority_isco_groups ?? [];
  const isPriority = priorityGroups.some((g) => g.startsWith(iscoCode.slice(0, 2)));
  const relevantSectors = ISCO_SECTOR_MAP[iscoMajor] ?? ["services"];
  const prioritySectors = country.priority_sectors ?? [];
  const sectorShares = laborStats?.employment_by_sector ?? null;

  return {
    isco_major: iscoMajor, formality, is_priority_occupation: isPriority,
    relevant_sectors: relevantSectors,
    priority_sectors_overlap: relevantSectors.filter((s) =>
      prioritySectors.some((ps) => ps.includes(s) || s.includes(ps.split("_")[0]))
    ),
    sector_employment_shares: sectorShares
      ? { agriculture: sectorShares.agriculture_share, industry: sectorShares.industry_share, services: sectorShares.services_share }
      : null,
  };
}

function buildEconomicSignals(country, laborStats, oppConfig, generatedConfig) {
  const wf = oppConfig?.min_wage_monthly
    ? { currency: oppConfig.currency ?? country.currency, monthly_amount: oppConfig.min_wage_monthly, source: oppConfig.min_wage_source ?? "country config" }
    : laborStats?.wage_floor;

  const yu = laborStats?.youth_unemployment_rate;
  const se = laborStats?.employment_by_sector;
  const nr = laborStats?.neet_rate;
  const gp = laborStats?.gdp_per_capita;
  const selfEmp = laborStats?.self_employed_pct
    ?? (generatedConfig?.labor_market?.self_employed_pct_wdi
      ? { rate: generatedConfig.labor_market.self_employed_pct_wdi / 100, source: "World Bank WDI SL.EMP.SELF.ZS" }
      : null);
  const digital = generatedConfig?.digital_infrastructure;

  return {
    wage_floor: wf ? `${wf.currency} ${wf.monthly_amount?.toLocaleString?.() ?? wf.monthly_amount}/month (${wf.source})` : `${country.currency} — national minimum wage`,
    sector_employment_share: se ? `Services ${(se.services_share * 100).toFixed(1)}%, Industry ${(se.industry_share * 100).toFixed(1)}%, Agriculture ${(se.agriculture_share * 100).toFixed(1)}%` : "Not available",
    youth_unemployment_rate: yu ? `${(yu.rate * 100).toFixed(1)}% (${yu.source})` : "Not available",
    neet_rate: nr ? `${(nr.rate * 100).toFixed(1)}% (${nr.source})` : "Not available",
    gdp_per_capita: gp ? `USD ${gp.value_usd?.toLocaleString?.() ?? gp.value_usd} (${gp.source})` : "Not available",
    self_employed_share: selfEmp ? `${(selfEmp.rate * 100).toFixed(1)}% (${selfEmp.source ?? "WDI"})` : "Not available",
    digital_infrastructure: digital ? `${digital.infrastructure_level} — mobile broadband ${digital.mobile_broadband_per_100?.toFixed(1) ?? "?"} per 100` : "Not available",
  };
}

const SYSTEM_PROMPT = `You are a labor economist specialising in LMIC labor markets and ISCO-08 occupation structure.

You will receive a structured worker profile, Module 2 automation risk output, and country labor market data. Your job is to identify REALISTIC job opportunities and rank them by feasibility — NOT by prestige or aspiration.

Rules:
- Never suggest occupations more than 1 ISCO skill level above the worker's current group without strong justification.
- Always include at least one informal or micro-enterprise pathway.
- Income ranges MUST use the provided wage floor as anchor (e.g., "1-2x minimum wage"). Do NOT invent currency amounts.
- Return valid JSON only. No markdown.`;

function buildOpportunityPrompt(profile, module2, country, laborStats, anchor, signals, oppConfig) {
  const skillLabels     = (profile.skills?.mapped ?? []).map((s) => s.plain_label || s.label);
  const durableSkills   = module2?.skill_resilience_analysis?.durable_skills  ?? [];
  const adjacentSkills  = module2?.skill_resilience_analysis?.adjacent_skills ?? [];
  const riskLevel       = module2?.final_readiness_profile?.risk_level ?? "unknown";
  const adjustedProb    = module2?.automation_analysis?.adjusted_automation_probability ?? null;

  const context = {
    worker: {
      isco_code: profile.primary_occupation?.isco_code,
      occupation_title: profile.primary_occupation?.title,
      isco_major_group: anchor.isco_major,
      skills_from_module1: skillLabels,
      durable_skills_from_module2: durableSkills,
      adjacent_skills_from_module2: adjacentSkills,
    },
    automation_context: { adjusted_automation_probability: adjustedProb, risk_level: riskLevel },
    country: {
      name: country.country_name, code: country.country_code, currency: country.currency,
      formality_of_occupation: anchor.formality,
      priority_sectors: country.priority_sectors ?? [],
    },
    economic_signals: signals,
    local_opportunity_types: (oppConfig?.types ?? []).filter(t => t.enabled !== false).map(t => ({
      id: t.id, label: t.label, weight: t.weight, providers: t.providers?.slice(0, 3),
    })),
  };

  return `${JSON.stringify(context, null, 2)}

Return ONLY the following JSON:
{
  "opportunities": {
    "direct": [{ "title": "...", "isco_code": "...", "income_range": "...", "demand_strength": "...", "entry_barrier": "...", "stability": "...", "reason": "..." }],
    "adjacent": [{ "title": "...", "isco_code": "...", "income_range": "...", "demand_strength": "...", "entry_barrier": "...", "stability": "...", "required_upskilling": [...], "reason": "..." }],
    "micro_enterprise": [{ "title": "...", "income_range": "...", "entry_barrier": "...", "stability": "...", "reason": "..." }]
  },
  "ranking": [{ "opportunity": "...", "score": <0.0-1.0>, "reason": "..." }],
  "policy_view": { "labor_gap_identified": "...", "sector_shortage_signal": "...", "recommendation_for_government_or_ngos": "..." },
  "explainability": { "key_drivers": ["...", "...", "..."] }
}

Constraints: direct 2-3, adjacent 2-3, micro_enterprise 1-2. Ranking: ALL opportunities. key_drivers: exactly 3.`;
}

// ISCO opportunity templates (abbreviated, same structure as unmapped-main)
const ISCO_OPPORTUNITY_TEMPLATES = {
  "1": { direct: [{ title: "Operations Manager", isco: "1219", demand: "low", barrier: "high", stability: "stable", income: "4-8x minimum wage", reason: "Managers in formal sector and NGOs." }], adjacent: [{ title: "Business Development Officer", isco: "2431", demand: "medium", barrier: "medium", stability: "moderate", income: "2-5x minimum wage", upskilling: ["negotiation", "reporting"], reason: "Strategic planning in SME/NGO." }], micro: [{ title: "Consultancy or advisory services", income: "2-6x minimum wage", barrier: "low", stability: "volatile", reason: "Experienced managers offer paid advisory." }] },
  "2": { direct: [{ title: "Technical Specialist / Analyst", isco: "2529", demand: "medium", barrier: "high", stability: "stable", income: "3-6x minimum wage", reason: "Professional services sector." }], adjacent: [{ title: "Trainer / Facilitator", isco: "2359", demand: "medium", barrier: "medium", stability: "moderate", income: "2-4x minimum wage", upskilling: ["instructional design", "public speaking"], reason: "Knowledge transfer role." }], micro: [{ title: "Independent professional services", income: "2-5x minimum wage", barrier: "low", stability: "volatile", reason: "Freelance consulting/tutoring." }] },
  "3": { direct: [{ title: "Technical Support Technician", isco: "3512", demand: "medium", barrier: "medium", stability: "moderate", income: "1.5-3x minimum wage", reason: "Growing demand for technical troubleshooting." }, { title: "Health / Lab Technician", isco: "3211", demand: "medium", barrier: "medium", stability: "stable", income: "2-3.5x minimum wage", reason: "Public health infrastructure expansion." }], adjacent: [{ title: "ICT Field Technician", isco: "7422", demand: "medium", barrier: "low", stability: "moderate", income: "1.5-2.5x minimum wage", upskilling: ["networking basics", "device repair"], reason: "Short TVET upskilling bridge." }], micro: [{ title: "Mobile technical services", income: "1-2.5x minimum wage", barrier: "low", stability: "volatile", reason: "Self-employed technical services." }] },
  "4": { direct: [{ title: "Office Clerk / Admin Assistant", isco: "4110", demand: "medium", barrier: "low", stability: "moderate", income: "1-1.5x minimum wage", reason: "Widespread in NGOs and government." }], adjacent: [{ title: "Accounts / Billing Clerk", isco: "4312", demand: "medium", barrier: "medium", stability: "stable", income: "1.5-2x minimum wage", upskilling: ["basic bookkeeping", "spreadsheet software"], reason: "Short-course upskilling." }], micro: [{ title: "Home-based data entry", income: "0.5-1x minimum wage", barrier: "low", stability: "volatile", reason: "Mobile platforms and informal outsourcing." }] },
  "5": { direct: [{ title: "Retail Sales Worker", isco: "5223", demand: "high", barrier: "low", stability: "volatile", income: "1-1.5x minimum wage", reason: "High turnover informal market." }, { title: "Food Service Worker", isco: "5123", demand: "high", barrier: "low", stability: "volatile", income: "0.8-1.2x minimum wage", reason: "Street food and hospitality." }], adjacent: [{ title: "Sales Team Leader", isco: "5220", demand: "medium", barrier: "medium", stability: "moderate", income: "1.5-2.5x minimum wage", upskilling: ["team coordination", "inventory management"], reason: "Direct path from frontline service." }], micro: [{ title: "Market trader or mobile vendor", income: "0.5-1.5x minimum wage", barrier: "low", stability: "volatile", reason: "Extremely low entry barrier." }] },
  "6": { direct: [{ title: "Agricultural Farm Worker", isco: "6111", demand: "high", barrier: "low", stability: "volatile", income: "0.5-1x minimum wage", reason: "Dominant employment category in LMICs." }], adjacent: [{ title: "Irrigation / Agri-Input Technician", isco: "3142", demand: "low", barrier: "medium", stability: "moderate", income: "1-2x minimum wage", upskilling: ["irrigation systems", "fertiliser application"], reason: "TVET agri-tech training." }], micro: [{ title: "Smallholder farming", income: "subsistence to 1x minimum wage", barrier: "low", stability: "volatile", reason: "Primary informal livelihood path." }] },
  "7": { direct: [{ title: "Skilled Trade Technician / Repair Worker", isco: "7422", demand: "medium", barrier: "low", stability: "moderate", income: "1-2x minimum wage", reason: "Strong urban informal demand." }, { title: "Construction Trades Worker", isco: "7115", demand: "high", barrier: "low", stability: "moderate", income: "1-1.8x minimum wage", reason: "Construction sector sub-contracting." }], adjacent: [{ title: "Workshop Supervisor / Team Lead", isco: "7500", demand: "medium", barrier: "medium", stability: "stable", income: "1.5-2.5x minimum wage", upskilling: ["team supervision", "quality inspection"], reason: "Supervisory roles with basic management training." }, { title: "Vocational Trainer", isco: "2320", demand: "low", barrier: "medium", stability: "stable", income: "1.5-2x minimum wage", upskilling: ["instructional skills", "workshop facilitation"], reason: "TVET expansion creates demand." }], micro: [{ title: "Own-account repair or fabrication workshop", income: "0.8-2.5x minimum wage", barrier: "low", stability: "moderate", reason: "Common informal path for skilled trades." }] },
  "8": { direct: [{ title: "Machine Operator / Production Worker", isco: "8189", demand: "medium", barrier: "low", stability: "volatile", income: "1-1.5x minimum wage", reason: "Manufacturing / garments sector." }], adjacent: [{ title: "Equipment Maintenance Technician", isco: "7233", demand: "medium", barrier: "medium", stability: "stable", income: "1.5-2.5x minimum wage", upskilling: ["mechanical diagnostics", "preventive maintenance"], reason: "Short TVET bridging." }], micro: [{ title: "Small transport or delivery service", income: "0.8-1.5x minimum wage", barrier: "medium", stability: "volatile", reason: "Motorcycle delivery micro-enterprise." }] },
  "9": { direct: [{ title: "General Labourer / Domestic Worker", isco: "9112", demand: "high", barrier: "low", stability: "volatile", income: "0.5-1x minimum wage", reason: "Largest informal employment category." }], adjacent: [{ title: "Cleaning / Facilities Supervisor", isco: "9100", demand: "low", barrier: "medium", stability: "moderate", income: "1-1.5x minimum wage", upskilling: ["team coordination", "safety standards"], reason: "Supervisory roles in formal facilities." }], micro: [{ title: "Domestic cleaning or waste collection service", income: "0.5-1x minimum wage", barrier: "low", stability: "volatile", reason: "Low-capital self-employment." }] },
};

function buildOpportunityFallback(profile, module2, country, anchor, signals, oppConfig) {
  const iscoMajor  = anchor.isco_major;
  const templates  = ISCO_OPPORTUNITY_TEMPLATES[iscoMajor] ?? ISCO_OPPORTUNITY_TEMPLATES["7"];
  const adjustedP  = module2?.automation_analysis?.adjusted_automation_probability ?? 0.5;
  const highRisk   = adjustedP >= 0.6;

  const direct = templates.direct.map((t) => ({ title: t.title, isco_code: t.isco, income_range: t.income, demand_strength: t.demand, entry_barrier: t.barrier, stability: t.stability, reason: t.reason }));
  const adjacent = templates.adjacent.map((t) => ({ title: t.title, isco_code: t.isco, income_range: t.income, demand_strength: t.demand, entry_barrier: t.barrier, stability: t.stability, required_upskilling: t.upskilling, reason: t.reason }));
  const micro = templates.micro.map((t) => ({ title: t.title, income_range: t.income, entry_barrier: t.barrier, stability: t.stability, reason: t.reason }));

  const rankItems = highRisk
    ? [...adjacent.map(o => o.title), ...micro.map(o => o.title), ...direct.map(o => o.title)]
    : [...direct.map(o => o.title), ...adjacent.map(o => o.title), ...micro.map(o => o.title)];

  const scores = rankItems.map((title, i) => ({ opportunity: title, score: Number((1 - i * 0.12).toFixed(2)), reason: i === 0 ? "Highest feasibility given skills and local demand." : "Lower-ranked by entry barrier or demand signal." }));

  return {
    opportunities: { direct, adjacent, micro_enterprise: micro },
    ranking: scores,
    policy_view: {
      labor_gap_identified: `Trained workers in ISCO group ${iscoMajor} face limited formal channels; informal sector absorbs majority.`,
      sector_shortage_signal: `medium shortage in ${anchor.relevant_sectors[0] ?? "services"} sector`,
      recommendation_for_government_or_ngos: `Expand TVET bridging for ISCO group ${iscoMajor}. Strengthen formal hiring channels.`,
    },
    explainability: {
      key_drivers: [
        `Adjusted automation probability ${adjustedP} — ${highRisk ? "high risk prioritises adjacent/micro paths." : "moderate risk supports direct pathways."}`,
        `ISCO major group ${iscoMajor} — realistic opportunities within 1 skill level.`,
        "LMIC informality constrains formal hiring; micro-enterprise and informal channels are primary access points.",
      ],
    },
    _provider: "template_fallback",
  };
}

async function runLLMOpportunityAnalysis(profile, module2, country, laborStats, anchor, signals, oppConfig) {
  if (!process.env.OPENROUTER_API_KEY) {
    return buildOpportunityFallback(profile, module2, country, anchor, signals, oppConfig);
  }

  try {
    const client = getClient();
    const result = await withTimeout(
      client.chat.send({
        chatRequest: {
          model: OPENROUTER_MODEL,
          maxTokens: 1500,
          responseFormat: { type: "json_object" },
          stream: false,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: buildOpportunityPrompt(profile, module2, country, laborStats, anchor, signals, oppConfig) },
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

    const required = ["opportunities", "ranking", "policy_view", "explainability"];
    for (const key of required) {
      if (!parsed[key]) throw new Error(`LLM response missing key: ${key}`);
    }
    return { ...parsed, _provider: `openrouter/${OPENROUTER_MODEL}` };
  } catch (err) {
    console.warn(`[opportunity-engine] LLM failed (${err.message}) — using template fallback`);
    return buildOpportunityFallback(profile, module2, country, anchor, signals, oppConfig);
  }
}

/**
 * Run the full Module 3 opportunity matching pipeline.
 *
 * @param {{ profile: object, module2: object|null, country: object }} params
 * @returns {Promise<object>}
 */
export async function matchOpportunities({ profile, module2, country }) {
  const laborStats      = getCountryLaborStats(country.country_code);
  const oppConfig       = getOpportunitiesConfig(country.country_code);
  const generatedConfig = getGeneratedCountryConfig(country.country_code);

  const anchor  = anchorLaborMarket(profile, country, laborStats);
  const signals = buildEconomicSignals(country, laborStats, oppConfig, generatedConfig);

  const llmResult = await runLLMOpportunityAnalysis(
    profile, module2, country, laborStats, anchor, signals, oppConfig
  );

  return {
    isco_code:        profile.primary_occupation?.isco_code ?? "",
    occupation_title: profile.primary_occupation?.title ?? "",

    labor_market_context: {
      country:          country.country_name,
      informality_level: anchor.formality,
      key_economic_signals: signals,
    },

    opportunities: llmResult.opportunities,
    ranking:       llmResult.ranking,
    policy_view:   llmResult.policy_view,
    explainability: llmResult.explainability,

    _meta: {
      analysis_provider: llmResult._provider ?? "unknown",
      profile_id:        profile.id,
      generated_at:      new Date().toISOString(),
      data_sources: {
        wage_floor: oppConfig?.min_wage_source ?? laborStats?.wage_floor?.source ?? "country config",
        economic_signals: "World Bank WDI 2024 + ILOSTAT 2024 + ITU 2024",
      },
    },
  };
}
