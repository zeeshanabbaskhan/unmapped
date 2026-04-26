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

export type Module3Module1Output = {
  input_summary?: {
    original_text?: string;
    detected_language?: string;
  };
  skills?: Array<{
    name: string;
    confidence?: number;
    source?: string;
  }>;
  occupation_candidates?: Array<{
    isco_code?: string;
    title?: string;
    confidence?: number;
    matched_skills?: string[];
    reason?: string;
  }>;
  final_selection?: {
    isco_code?: string;
    title?: string;
    confidence?: number;
    reason?: string;
  };
  country_context?: {
    country?: string;
    country_code?: string;
    labor_structure?: string;
  };
  adjusted_readiness?: {
    automation_risk_base?: number;
    automation_risk_adjusted?: number;
    interpretation?: string;
  };
};

export type EconometricSignal = {
  id: string;
  label: string;
  value: number | null;
  unit: string;
  year: number | null;
  trend: string;
  delta: number | null;
  source: string;
  source_indicator: string;
};

export type Module3Opportunity = {
  id: string;
  type: string;
  title: string;
  match_score: number;
  confidence: string;
  rationale: string[];
  estimated_income?: {
    min?: number;
    max?: number;
    currency?: string | null;
    period?: string;
  };
  requirements?: string[];
  missing_skills?: string[];
  providers?: Array<{ name: string; url?: string; note?: string }>;
  next_actions: string[];
  econometric_context?: string[];
  source_tags: string[];
};

export type Module3Response = {
  opportunities: Module3Opportunity[];
  econometric_dashboard: {
    youth_view: {
      headline: string;
      visible_signals: EconometricSignal[];
      all_signals: EconometricSignal[];
      signal_note: string;
    };
    policymaker_view: {
      country: {
        code: string | null;
        name: string | null;
        income_level: string | null;
        region: string | null;
      };
      opportunity_mix_top3: Array<{ type: string; label: string; score: number }>;
      priorities: {
        priority_sectors: string[];
        priority_isco_groups: string[];
      };
      diagnostics: {
        total_econometric_signals: number;
        visible_to_youth_count: number;
        infrastructure_level: string | null;
        data_vintage: number | null;
      };
      labor_market_snapshot: {
        sector_shares: { source?: string; AGR?: number; IND?: number; SER?: number } | null;
        uncertainty_note: string | null;
      };
    };
  };
  metadata: {
    country_code: string;
    country_name: string;
    input_language: string;
    top_occupation: {
      isco_code: string | null;
      title: string | null;
      confidence: number;
    } | null;
    skills_detected: number;
    average_skill_confidence: number;
    readiness_signal: string;
    econometric_signal_count: number;
    generated_at: string;
    version: string;
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

export async function getModule3Opportunities({
  module1Output,
  countryCode,
  limit = 8,
  includeTypes,
}: {
  module1Output: Module3Module1Output;
  countryCode?: string;
  limit?: number;
  includeTypes?: string[];
}): Promise<Module3Response> {
  const response = await fetch(`${NODE_API}/api/module3/opportunities`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      module1_output: module1Output,
      country_code: countryCode,
      limit,
      include_types: includeTypes,
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? "Could not generate Module 3 opportunities");
  }

  return response.json();
}
