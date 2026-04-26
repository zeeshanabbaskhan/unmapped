export type Module1Answers = {
  country_code: "GH" | "BD";
  city: string;
  education: string;
  work_description: string;
  sector: string;
  experience_years: number;
  employment_type: string;
  tools: string[];
  selected_skills: string[];
  languages: string[];
  aspiration: string;
  extra_skills: string;
};

export type Module1Profile = {
  id: string;
  generated_at: string;
  human_summary: string;
  primary_occupation: {
    title: string;
    esco_code: string;
    isco_code: string;
    isco_title: string;
    confidence: string;
    score: number;
    /** Human-readable explanation of why this occupation was matched. */
    match_reason?: string;
  } | null;
  alternative_occupations: Array<{
    title: string;
    isco_code: string;
    score: number;
  }>;
  education: {
    local_label: string;
    isced: string;
    credential_tier: string;
  };
  skills: {
    mapped: Array<{
      id: string;
      label: string;
      plain_label: string;
      evidence_type: string;
      /** Token overlap score used by the deterministic scorer. */
      match_score?: number;
      /** Traceable reason for inclusion. */
      reason?: string;
    }>;
    local_unmapped: Array<{
      id: string;
      label: string;
      plain_label: string;
    }>;
  };
  confidence: {
    level: string;
    caveat: string;
    /** Which extraction path was used: "openai" | "heuristic". */
    extraction_method?: string;
    /** Provider string, e.g. "openai/gpt-4o-mini". */
    extraction_provider?: string;
    /** Human-readable list of country adjustments applied. */
    country_adjustments?: string[];
    evidence?: {
      essential_skill_score: number;
      optional_skill_score: number;
      sector_score: number;
      text_score: number;
      onet_score: number;
      experience_score: number;
    };
  };
  task_enrichment: {
    source: string;
    link_method: string;
    note: string;
    onet_links: Array<{
      soc_code: string;
      title: string;
      link_score: number;
      link_method: string;
    }>;
    matched_evidence: Array<{
      type: string;
      label: string;
      source_title: string;
      soc_code: string;
      match_score: number;
    }>;
  };
  sources: Array<{
    id: string;
    label: string;
    type: string;
    files?: Array<{
      name: string;
      role: string;
      sha256: string;
    }>;
  }>;
};

export type Module1Metadata = {
  index_version: string;
  generated_at: string;
  note: string;
  stats: {
    occupations: number;
    all_skills: number;
    linked_runtime_skills: number;
    isco_groups: number;
    onet_occupations: number;
    occupations_with_onet_enrichment: number;
    occupation_skill_relations: number;
  };
  onet_stats: {
    occupations: number;
    occupations_with_tasks: number;
    occupations_with_tools: number;
    occupations_with_technology: number;
    occupations_with_job_zones: number;
    occupations_with_education: number;
  };
  sources: Array<{
    id: string;
    label: string;
    type: string;
    files: Array<{
      file: string;
      name: string;
      role: string;
      bytes: number;
      sha256: string;
    }>;
  }>;
};

export type IntakeOption = {
  label: string;
  count: number;
};

export type SectorOption = {
  id: string;
  label: string;
  occupation_count: number;
};

export type Module1IntakeOptions = {
  generated_at: string;
  sectors: SectorOption[];
  selected_sector: string;
  skills: IntakeOption[];
  tools: IntakeOption[];
  total_skills_for_sector: number;
  total_tools_for_sector: number;
};

// ---------------------------------------------------------------------------
// Module 2 — Automation Risk Analysis types
// ---------------------------------------------------------------------------

export type Module2Analysis = {
  isco_code: string;
  occupation_title: string;
  automation_analysis: {
    source_model: string;
    base_automation_probability: number | null;
    base_source: string;
    lmic_adjustment_explanation: string[];
    adjustment_factor: number;
    adjusted_automation_probability: number | null;
    sources: string[];
    uncertainty_band?: number;
    scenario_toggles?: Array<{ id: string; label: string; multiplier_adjustment: number }>;
  };
  task_breakdown: {
    high_risk_tasks: Array<{ task: string; risk_score: number }>;
    low_risk_tasks: Array<{ task: string; risk_score: number }>;
  };
  skill_resilience_analysis: {
    at_risk_skills: string[];
    durable_skills: string[];
    adjacent_skills: string[];
  };
  economic_context: { country: string; informality_level: string; interpretation: string };
  macro_signals: { education_projection: string; labor_shift_trend: string };
  final_readiness_profile: {
    risk_level: "low" | "medium" | "high" | "very high";
    resilience_level: "low" | "medium" | "high";
    opportunity_type: "displacement" | "stable" | "upskilling_required" | "growth_area";
    summary: string;
  };
  explainability: { key_drivers: string[] };
  _meta?: { analysis_provider: string; profile_id: string; generated_at: string };
};

// ---------------------------------------------------------------------------
// Module 3 — Labor Market Opportunity Matching types
// ---------------------------------------------------------------------------

export type Module3OpportunityItem = {
  title: string;
  isco_code?: string;
  income_range: string;
  demand_strength?: "low" | "medium" | "high";
  entry_barrier: "low" | "medium" | "high";
  stability: "volatile" | "moderate" | "stable";
  required_upskilling?: string[];
  reason: string;
};

export type Module3Analysis = {
  isco_code: string;
  occupation_title: string;

  labor_market_context: {
    country: string;
    informality_level: string;
    key_economic_signals: {
      wage_floor: string;
      sector_employment_share: string;
      youth_unemployment_rate: string;
      /** Share of youth not in education, employment or training (WDI) */
      neet_rate?: string;
      /** GDP per capita in USD (World Bank WDI) */
      gdp_per_capita?: string;
      /** Share of workers who are self-employed (WDI) */
      self_employed_share?: string;
      /** ITU digital infrastructure level */
      digital_infrastructure?: string;
    };
  };

  opportunities: {
    direct: Module3OpportunityItem[];
    adjacent: Module3OpportunityItem[];
    micro_enterprise: Module3OpportunityItem[];
  };

  ranking: Array<{
    opportunity: string;
    score: number;
    reason: string;
  }>;

  policy_view: {
    labor_gap_identified: string;
    sector_shortage_signal: string;
    recommendation_for_government_or_ngos: string;
  };

  explainability: {
    key_drivers: string[];
  };

  _meta?: {
    analysis_provider: string;
    profile_id: string;
    generated_at: string;
  };
};

const NODE_API = process.env.NEXT_PUBLIC_NODE_API ?? "http://localhost:4000";

export async function createModule1Profile(answers: Module1Answers): Promise<Module1Profile> {
  const response = await fetch(`${NODE_API}/api/module1/profile`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ answers }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? "Could not generate profile");
  }

  const body = await response.json();
  return body.profile;
}

export async function getModule1Metadata(): Promise<Module1Metadata> {
  const response = await fetch(`${NODE_API}/api/module1/metadata`);

  if (!response.ok) {
    throw new Error("Could not load Module 1 metadata");
  }

  return response.json();
}

export async function getModule1IntakeOptions(sector: string): Promise<Module1IntakeOptions> {
  const params = new URLSearchParams({ sector, limit: "all" });
  const response = await fetch(`${NODE_API}/api/module1/intake-options?${params.toString()}`);

  if (!response.ok) {
    throw new Error("Could not load intake options");
  }

  return response.json();
}

export async function matchOpportunities(
  profile: Module1Profile,
  module2: object | null,
  countryCode: string
): Promise<Module3Analysis> {
  const response = await fetch(`${NODE_API}/api/module3/opportunities`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ profile, module2, country_code: countryCode }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Could not generate opportunity map");
  }

  const body = await response.json();
  return body.opportunities;
}

export async function createModule2RiskAnalysis(
  profile: Module1Profile,
  countryCode: string
): Promise<Module2Analysis> {
  const response = await fetch(`${NODE_API}/api/module2/risk-analysis`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ profile, country_code: countryCode }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Could not generate risk analysis");
  }

  const body = await response.json();
  return body.analysis;
}

export async function getI18nStrings(locale: string): Promise<Record<string, string>> {
  const response = await fetch(`${NODE_API}/api/i18n?locale=${encodeURIComponent(locale)}`);
  if (!response.ok) return {};
  return response.json();
}
