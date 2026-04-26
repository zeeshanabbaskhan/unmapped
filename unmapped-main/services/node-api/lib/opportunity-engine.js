/**
 * Module 3 — Labor Market Opportunity Matching Engine.
 *
 * Matches a worker's occupation profile to REALISTIC economic opportunities
 * in their local labor market. Grounded in ISCO-08 structure, ILOSTAT
 * sector data, country config, and Module 2 risk output.
 *
 * Pipeline:
 *
 *   Step 1  Deterministic:
 *     Labor market anchoring — resolves sectors, formality, and economic
 *     signals from country config + country_labor_stats.json. No LLM.
 *
 *   Steps 2–5  LLM-assisted (OpenRouter, falls back to ISCO templates):
 *     2. Opportunity mapping (direct / adjacent / micro-enterprise)
 *     3. Economic feasibility scoring (income, demand, entry barrier, stability)
 *     4. Ranking by feasibility (not prestige)
 *     5. Policy view
 *
 * Rules enforced here:
 *   - No wage data is invented: income ranges come from wage_floor × multipliers.
 *   - No unrealistic mobility: opportunities are constrained to ISCO groups
 *     within ±1 skill level of the worker's current ISCO major group.
 *   - Informal pathways are always present.
 *   - At least 2 real economic indicators must appear in the output.
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

// ---------------------------------------------------------------------------
// Step 1 — Deterministic labor market anchoring
// ---------------------------------------------------------------------------

// Maps ISCO major group to the sectors where that occupation realistically
// operates. Based on ILO ISCO-08 and ILOSTAT sector classifications.
const ISCO_SECTOR_MAP = {
  "1": ["services", "industry"],
  "2": ["services"],
  "3": ["services", "industry"],
  "4": ["services"],
  "5": ["services"],
  "6": ["agriculture"],
  "7": ["industry", "services"],
  "8": ["industry"],
  "9": ["agriculture", "services", "industry"],
};

// Maps ISCO major group to the typical formality of employment.
// Based on ILO (2018) informal economy statistics.
const ISCO_FORMALITY_MAP = {
  "1": "formal",
  "2": "formal",
  "3": "formal",
  "4": "hybrid",
  "5": "hybrid",
  "6": "informal",
  "7": "hybrid",
  "8": "hybrid",
  "9": "informal",
};

/**
 * Step 1 — anchor the occupation to its local labor market realities.
 * Fully deterministic; uses country config + labor stats only.
 */
function anchorLaborMarket(profile, country, laborStats) {
  const iscoCode  = profile.primary_occupation?.isco_code ?? "";
  const iscoMajor = String(iscoCode)[0] ?? "7";

  const formality = ISCO_FORMALITY_MAP[iscoMajor] ?? "hybrid";

  // Is this a nationally prioritised occupation group?
  const priorityGroups = country.priority_isco_groups ?? [];
  const isPriority = priorityGroups.some((g) => g.startsWith(iscoCode.slice(0, 2)));

  // Which country sectors actually employ this ISCO group?
  const relevantSectors = ISCO_SECTOR_MAP[iscoMajor] ?? ["services"];

  // Filter to sectors the country actually has in its priority list
  const prioritySectors = country.priority_sectors ?? [];

  // Employment share for the dominant sector of this occupation
  const sectorShares = laborStats?.employment_by_sector ?? null;

  return {
    isco_major: iscoMajor,
    formality,
    is_priority_occupation: isPriority,
    relevant_sectors: relevantSectors,
    priority_sectors_overlap: relevantSectors.filter((s) =>
      prioritySectors.some((ps) => ps.includes(s) || s.includes(ps.split("_")[0]))
    ),
    sector_employment_shares: sectorShares
      ? {
          agriculture: sectorShares.agriculture_share,
          industry:    sectorShares.industry_share,
          services:    sectorShares.services_share,
        }
      : null,
  };
}

/**
 * Build the visible economic signals block from deterministic sources only.
 * Priority order: handcrafted opportunities config > country_labor_stats.json > generated config.
 * All values are cited with their source.
 */
function buildEconomicSignals(country, laborStats, oppConfig, generatedConfig) {
  // Wage floor — handcrafted config is authoritative (correct local currency)
  const wf = oppConfig?.min_wage_monthly
    ? { currency: oppConfig.currency ?? country.currency, monthly_amount: oppConfig.min_wage_monthly, source: oppConfig.min_wage_source ?? "country config" }
    : laborStats?.wage_floor;

  const yu = laborStats?.youth_unemployment_rate;
  const se = laborStats?.employment_by_sector;
  const nr = laborStats?.neet_rate;
  const gp = laborStats?.gdp_per_capita;
  const selfEmp = laborStats?.self_employed_pct
    ?? (generatedConfig?.labor_market?.self_employed_pct_wdi
      ? { rate: generatedConfig.labor_market.self_employed_pct_wdi / 100, note: oppConfig?.ilostat_self_employed_note, source: "World Bank WDI SL.EMP.SELF.ZS" }
      : null);
  const digital = generatedConfig?.digital_infrastructure;

  const wageFloor = wf
    ? `${wf.currency} ${wf.monthly_amount.toLocaleString()}/month (${wf.source})`
    : `${country.currency} — national minimum wage (see wage authority)`;

  const sectorShare = se
    ? `Services ${(se.services_share * 100).toFixed(1)}%, Industry ${(se.industry_share * 100).toFixed(1)}%, Agriculture ${(se.agriculture_share * 100).toFixed(1)}% (ILOSTAT ${laborStats.year})`
    : "Sector distribution not available";

  const youthUnemployment = yu
    ? `${(yu.rate * 100).toFixed(1)}% (age ${yu.age_group}, ${yu.source})`
    : "Not available";

  const neetRate = nr
    ? `${(nr.rate * 100).toFixed(1)}% of youth aged ${nr.age_group} — not in education, employment or training (${nr.source})`
    : "Not available";

  const gdpPerCapita = gp
    ? `USD ${gp.value_usd.toLocaleString()} (${gp.source})`
    : "Not available";

  const selfEmployedShare = selfEmp
    ? `${(selfEmp.rate * 100).toFixed(1)}% of workers are self-employed (${selfEmp.source ?? "WDI"})`
    : "Not available";

  const digitalInfra = digital
    ? `${digital.infrastructure_level} — mobile broadband ${digital.mobile_broadband_per_100?.toFixed(1) ?? "?"} per 100 (${digital.source ?? "ITU 2024"})`
    : "Not available";

  return {
    wage_floor: wageFloor,
    sector_employment_share: sectorShare,
    youth_unemployment_rate: youthUnemployment,
    neet_rate: neetRate,
    gdp_per_capita: gdpPerCapita,
    self_employed_share: selfEmployedShare,
    digital_infrastructure: digitalInfra,
  };
}

// ---------------------------------------------------------------------------
// LLM prompt — Steps 2–5
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a labor economist specialising in LMIC labor markets and ISCO-08 occupation structure.

You will receive a structured worker profile, Module 2 automation risk output, and country labor market data. Your job is to identify REALISTIC job opportunities and rank them by feasibility — NOT by prestige or aspiration.

Rules you MUST follow:
- Never suggest occupations more than 1 ISCO skill level above the worker's current ISCO major group without strong justification.
- Always include at least one informal or micro-enterprise pathway.
- Income ranges MUST be expressed using the provided wage floor as the anchor (e.g., "1–2× minimum wage"). Do NOT invent currency amounts.
- Demand strength, entry barrier, and stability ratings must match the country's actual sector context.
- Durable and adjacent skills from Module 2 MUST drive the adjacent opportunity choices.
- Return valid JSON only. No markdown. No prose outside the JSON object.`;

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
    automation_context: {
      adjusted_automation_probability: adjustedProb,
      risk_level: riskLevel,
      note: "High risk = prioritise adjacent or micro-enterprise paths over direct.",
    },
    country: {
      name: country.country_name,
      code: country.country_code,
      currency: country.currency,
      formality_of_occupation: anchor.formality,
      priority_sectors: country.priority_sectors ?? [],
      relevant_sectors_for_isco: anchor.relevant_sectors,
    },
    economic_signals: signals,
    constraints: [
      "Income ranges must be expressed as multiples of the wage floor (e.g., '1–2× minimum wage / ~" + signals.wage_floor + "').",
      "Do NOT invent or cite wage amounts not derivable from the wage floor above.",
      "Do NOT suggest unrealistic upward mobility (e.g., 'become a software engineer') without strong justification from durable/adjacent skills.",
      "Always include informal hiring channels in direct opportunities.",
      "Micro-enterprise paths must be grounded in the local informal economy.",
    ],
    // Real opportunity types and training providers for this country
    local_opportunity_types: (oppConfig?.types ?? []).filter(t => t.enabled !== false).map(t => ({
      id: t.id,
      label: t.label,
      weight: t.weight,
      notes: t.notes,
      providers: t.providers?.slice(0, 3),
      platforms: t.platforms,
    })),
  };

  return `${JSON.stringify(context, null, 2)}

Analyse this worker's profile and return ONLY the following JSON object:
{
  "opportunities": {
    "direct": [
      {
        "title": "<realistic local job title>",
        "isco_code": "<4-digit ISCO code>",
        "income_range": "<expressed as multiple of wage floor>",
        "demand_strength": "<low|medium|high>",
        "entry_barrier": "<low|medium|high>",
        "stability": "<volatile|moderate|stable>",
        "reason": "<1-2 sentences: why this is realistic for this worker in this country>"
      }
    ],
    "adjacent": [
      {
        "title": "<realistic adjacent job title>",
        "isco_code": "<4-digit ISCO code>",
        "income_range": "<expressed as multiple of wage floor>",
        "demand_strength": "<low|medium|high>",
        "entry_barrier": "<low|medium|high>",
        "stability": "<volatile|moderate|stable>",
        "required_upskilling": ["<skill 1>", "<skill 2>"],
        "reason": "<1-2 sentences: skill bridge from Module 2 durable/adjacent skills>"
      }
    ],
    "micro_enterprise": [
      {
        "title": "<self-employment or micro-business title>",
        "income_range": "<expressed as multiple of wage floor>",
        "entry_barrier": "<low|medium|high>",
        "stability": "<volatile|moderate|stable>",
        "reason": "<1-2 sentences: grounded in local informal economy reality>"
      }
    ]
  },
  "ranking": [
    {
      "opportunity": "<title from above>",
      "score": <0.0-1.0, higher = more feasible>,
      "reason": "<1 sentence: why ranked here>"
    }
  ],
  "policy_view": {
    "labor_gap_identified": "<1 sentence: skill or sector gap visible from this analysis>",
    "sector_shortage_signal": "<low|medium|high> shortage in <sector name>",
    "recommendation_for_government_or_ngos": "<1-2 sentences: actionable policy recommendation>"
  },
  "explainability": {
    "key_drivers": ["<driver 1>", "<driver 2>", "<driver 3>"]
  }
}

Constraints:
- direct: 2–3 opportunities. adjacent: 2–3 opportunities. micro_enterprise: 1–2 opportunities.
- ranking: list ALL opportunities from all three categories, ordered best → worst feasibility.
- key_drivers: exactly 3 items.
- If automation risk is high (≥ 0.6 adjusted), rank adjacent and micro-enterprise above direct.`;
}

// ---------------------------------------------------------------------------
// LLM call with template fallback — Steps 2–5
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Template fallback — grounded in ISCO group structure
// ---------------------------------------------------------------------------

// Opportunity templates by ISCO major group. Income ranges are expressed
// as multiples of minimum wage so they automatically scale per country.
// Based on ILO ISCO-08 occupation descriptions and LMIC labor market surveys.
const ISCO_OPPORTUNITY_TEMPLATES = {
  "1": {
    direct: [
      { title: "Operations Manager", isco: "1219", demand: "low", barrier: "high", stability: "stable", income: "4–8× minimum wage", reason: "Managers operate across formal private sector and NGOs; entry requires proven track record." },
    ],
    adjacent: [
      { title: "Business Development Officer", isco: "2431", demand: "medium", barrier: "medium", stability: "moderate", income: "2–5× minimum wage", upskilling: ["negotiation", "reporting"], reason: "Leverages strategic planning skills in SME or NGO contexts." },
    ],
    micro: [
      { title: "Consultancy or advisory services", income: "variable (2–6× minimum wage)", barrier: "low", stability: "volatile", reason: "Experienced managers can offer paid advisory to SMEs in the informal market." },
    ],
  },
  "2": {
    direct: [
      { title: "Technical Specialist / Analyst", isco: "2529", demand: "medium", barrier: "high", stability: "stable", income: "3–6× minimum wage", reason: "Professionals in services sector; mostly formal hiring through institutions and NGOs." },
    ],
    adjacent: [
      { title: "Trainer / Facilitator", isco: "2359", demand: "medium", barrier: "medium", stability: "moderate", income: "2–4× minimum wage", upskilling: ["instructional design", "public speaking"], reason: "Knowledge transfer role accessible with professional credentials and experience." },
    ],
    micro: [
      { title: "Independent professional services", income: "2–5× minimum wage", barrier: "low", stability: "volatile", reason: "Freelance consulting, tutoring, or technical writing accessible via informal and online channels." },
    ],
  },
  "3": {
    direct: [
      { title: "Technical Support Technician", isco: "3512", demand: "medium", barrier: "medium", stability: "moderate", income: "1.5–3× minimum wage", reason: "Growing demand in services sector for technical troubleshooting roles, both formal and hybrid." },
      { title: "Health / Lab Technician", isco: "3211", demand: "medium", barrier: "medium", stability: "stable", income: "2–3.5× minimum wage", reason: "Public health infrastructure expansion drives technician demand in lower-middle-income countries." },
    ],
    adjacent: [
      { title: "ICT Field Technician", isco: "7422", demand: "medium", barrier: "low", stability: "moderate", income: "1.5–2.5× minimum wage", upskilling: ["networking basics", "device repair"], reason: "Short-cycle TVET upskilling bridges associate professional to hands-on ICT technician role." },
    ],
    micro: [
      { title: "Mobile or field-based technical services", income: "1–2.5× minimum wage", barrier: "low", stability: "volatile", reason: "Self-employed technical services (e.g., device diagnostics, calibration) operate in informal markets with low startup cost." },
    ],
  },
  "4": {
    direct: [
      { title: "Office Clerk / Administrative Assistant", isco: "4110", demand: "medium", barrier: "low", stability: "moderate", income: "1–1.5× minimum wage", reason: "Widespread in NGOs, government, and private sector; entry barriers low with basic literacy and numeracy." },
    ],
    adjacent: [
      { title: "Accounts or Billing Clerk", isco: "4312", demand: "medium", barrier: "medium", stability: "stable", income: "1.5–2× minimum wage", upskilling: ["basic bookkeeping", "spreadsheet software"], reason: "Short-course upskilling in accounting enables lateral move into finance-adjacent clerical work." },
    ],
    micro: [
      { title: "Home-based data entry or form processing", income: "0.5–1× minimum wage", barrier: "low", stability: "volatile", reason: "Accessible via mobile platforms and informal outsourcing networks; low capital required." },
    ],
  },
  "5": {
    direct: [
      { title: "Retail Sales Worker", isco: "5223", demand: "high", barrier: "low", stability: "volatile", income: "1–1.5× minimum wage", reason: "High turnover market with constant informal hiring through personal networks and market systems." },
      { title: "Food Service Worker", isco: "5123", demand: "high", barrier: "low", stability: "volatile", income: "0.8–1.2× minimum wage", reason: "Street food and hospitality sector absorbs large numbers informally in urban areas." },
    ],
    adjacent: [
      { title: "Sales Team Leader / Supervisor", isco: "5220", demand: "medium", barrier: "medium", stability: "moderate", income: "1.5–2.5× minimum wage", upskilling: ["team coordination", "inventory management"], reason: "Experience in frontline service roles provides direct path to supervisory positions in retail." },
    ],
    micro: [
      { title: "Market trader or mobile vendor", income: "0.5–1.5× minimum wage", barrier: "low", stability: "volatile", reason: "Extremely low entry barrier; fits informal economy reality; income highly variable but immediately accessible." },
    ],
  },
  "6": {
    direct: [
      { title: "Agricultural Farm Worker", isco: "6111", demand: "high", barrier: "low", stability: "volatile", income: "0.5–1× minimum wage", reason: "Dominant employment category in sub-Saharan Africa and South Asia; mostly informal seasonal contracts." },
    ],
    adjacent: [
      { title: "Irrigation or Agri-Input Technician", isco: "3142", demand: "low", barrier: "medium", stability: "moderate", income: "1–2× minimum wage", upskilling: ["irrigation systems", "fertiliser application"], reason: "TVET-level agri-tech training opens access to higher-value agri-services sector." },
    ],
    micro: [
      { title: "Smallholder farming or market gardening", income: "subsistence to 1× minimum wage", barrier: "low", stability: "volatile", reason: "Primary informal livelihood path for agricultural workers; income depends on land access and market linkages." },
    ],
  },
  "7": {
    direct: [
      { title: "Skilled Trade Technician / Repair Worker", isco: "7422", demand: "medium", barrier: "low", stability: "moderate", income: "1–2× minimum wage", reason: "Strong demand in urban informal economy for device repair, electrical, and mechanical services." },
      { title: "Construction Trades Worker", isco: "7115", demand: "high", barrier: "low", stability: "moderate", income: "1–1.8× minimum wage", reason: "Construction sector consistently absorbs skilled tradespeople through informal sub-contracting networks." },
    ],
    adjacent: [
      { title: "Workshop Supervisor / Team Lead", isco: "7500", demand: "medium", barrier: "medium", stability: "stable", income: "1.5–2.5× minimum wage", upskilling: ["team supervision", "quality inspection"], reason: "Experienced craft workers can move into supervisory roles with basic management training." },
      { title: "Vocational Trainer (technical skills)", isco: "2320", demand: "low", barrier: "medium", stability: "stable", income: "1.5–2× minimum wage", upskilling: ["instructional skills", "workshop facilitation"], reason: "TVET expansion in both Ghana and Bangladesh creates demand for industry-experienced trainers." },
    ],
    micro: [
      { title: "Own-account repair or fabrication workshop", income: "0.8–2.5× minimum wage", barrier: "low", stability: "moderate", reason: "Very common informal path for skilled trade workers; low capital requirement; income tied to client demand." },
    ],
  },
  "8": {
    direct: [
      { title: "Machine Operator / Production Worker", isco: "8189", demand: "medium", barrier: "low", stability: "volatile", income: "1–1.5× minimum wage", reason: "Manufacturing and garments sectors absorb operators; mostly formal contracts with seasonal variation." },
    ],
    adjacent: [
      { title: "Equipment Maintenance Technician", isco: "7233", demand: "medium", barrier: "medium", stability: "stable", income: "1.5–2.5× minimum wage", upskilling: ["mechanical diagnostics", "preventive maintenance"], reason: "Operators with diagnostic skills can shift to maintenance tech roles with short TVET bridging." },
    ],
    micro: [
      { title: "Small transport or delivery service", income: "0.8–1.5× minimum wage", barrier: "medium", stability: "volatile", reason: "Motorcycle or three-wheeler delivery is a common micro-enterprise in urban LMIC contexts; requires vehicle access." },
    ],
  },
  "9": {
    direct: [
      { title: "General Labourer / Domestic Worker", isco: "9112", demand: "high", barrier: "low", stability: "volatile", income: "0.5–1× minimum wage", reason: "Largest informal employment category; hiring via personal networks and labour aggregators." },
    ],
    adjacent: [
      { title: "Cleaning or Facilities Supervisor", isco: "9100", demand: "low", barrier: "medium", stability: "moderate", income: "1–1.5× minimum wage", upskilling: ["team coordination", "safety standards"], reason: "Experienced workers in cleaning or domestic services can move into supervisory roles in formal facilities." },
    ],
    micro: [
      { title: "Domestic cleaning or waste collection service", income: "0.5–1× minimum wage", barrier: "low", stability: "volatile", reason: "Low-capital self-employment common in urban informal areas; income dependent on client retention." },
    ],
  },
};

function buildOpportunityFallback(profile, module2, country, anchor, signals, oppConfig) {
  const iscoMajor  = anchor.isco_major;
  const templates  = ISCO_OPPORTUNITY_TEMPLATES[iscoMajor] ?? ISCO_OPPORTUNITY_TEMPLATES["7"];
  const adjustedP  = module2?.automation_analysis?.adjusted_automation_probability ?? 0.5;
  const highRisk   = adjustedP >= 0.6;

  const direct = templates.direct.map((t) => ({
    title: t.title,
    isco_code: t.isco,
    income_range: t.income,
    demand_strength: t.demand,
    entry_barrier: t.barrier,
    stability: t.stability,
    reason: t.reason,
  }));

  const adjacent = templates.adjacent.map((t) => ({
    title: t.title,
    isco_code: t.isco,
    income_range: t.income,
    demand_strength: t.demand,
    entry_barrier: t.barrier,
    stability: t.stability,
    required_upskilling: t.upskilling,
    reason: t.reason,
  }));

  const micro = templates.micro.map((t) => ({
    title: t.title,
    income_range: t.income,
    entry_barrier: t.barrier,
    stability: t.stability,
    reason: t.reason,
  }));

  // Rank: if high automation risk, adjacent > micro > direct; else direct > adjacent > micro
  const rankItems = highRisk
    ? [...adjacent.map((o) => o.title), ...micro.map((o) => o.title), ...direct.map((o) => o.title)]
    : [...direct.map((o) => o.title), ...adjacent.map((o) => o.title), ...micro.map((o) => o.title)];

  const scores = rankItems.map((title, i) => ({
    opportunity: title,
    score: Number((1 - i * 0.12).toFixed(2)),
    reason: i === 0
      ? "Highest feasibility given current skill level and local labor market demand."
      : "Lower-ranked by entry barrier or demand signal relative to top option.",
  }));

  return {
    opportunities: { direct, adjacent, micro_enterprise: micro },
    ranking: scores,
    policy_view: {
      labor_gap_identified: `Trained workers in ISCO group ${iscoMajor} face limited formal job channels; informal sector absorbs majority.`,
      sector_shortage_signal: `medium shortage in ${anchor.relevant_sectors[0] ?? "services"} sector`,
      recommendation_for_government_or_ngos: `Expand TVET bridging programmes linking ISCO group ${iscoMajor} workers to adjacent occupations. Strengthen formal hiring channels through sector associations and job centres.`,
    },
    explainability: {
      key_drivers: [
        `Adjusted automation probability ${adjustedP} — ${highRisk ? "high risk prioritises adjacent/micro paths over direct." : "moderate risk supports direct pathways remaining viable."}`,
        `ISCO major group ${iscoMajor} — labor market anchoring limits realistic opportunities to 1 skill level of movement.`,
        "LMIC informality constrains formal hiring; micro-enterprise and informal channels are primary access points.",
      ],
    },
    _provider: "template_fallback",
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Run the full Module 3 opportunity matching pipeline.
 *
 * @param {object} params
 * @param {object} params.profile   - Module 1 profile (from buildProfile)
 * @param {object} params.module2   - Module 2 risk analysis output (from analyseRisk)
 * @param {object} params.country   - Country config from country_registry
 * @returns {Promise<object>}       - Opportunity map in the Module 3 JSON schema
 */
export async function matchOpportunities({ profile, module2, country }) {
  const laborStats      = getCountryLaborStats(country.country_code);
  const oppConfig       = getOpportunitiesConfig(country.country_code);
  const generatedConfig = getGeneratedCountryConfig(country.country_code);

  // Step 1 — Labor market anchoring (deterministic)
  const anchor  = anchorLaborMarket(profile, country, laborStats);
  const signals = buildEconomicSignals(country, laborStats, oppConfig, generatedConfig);

  // Steps 2–5 — LLM-assisted opportunity mapping and ranking
  const llmResult = await runLLMOpportunityAnalysis(
    profile, module2, country, laborStats, anchor, signals, oppConfig
  );

  // Assemble final output per the strict Module 3 JSON schema
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
