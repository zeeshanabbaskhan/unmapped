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
