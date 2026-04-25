import { randomUUID } from "node:crypto";
import { getSourceRegistry } from "./dataStore.js";

function educationFromCountry(country, educationId) {
  return (
    country.education_levels.find((level) => level.id === educationId) ??
    country.education_levels[0]
  );
}

function buildCaveat(confidence) {
  if (confidence === "high") {
    return "This profile is a strong match based on your answers, but it is still self-reported rather than formally verified.";
  }
  if (confidence === "medium") {
    return "This profile is a useful starting point. Some parts should be reviewed or strengthened with evidence before using it as a credential.";
  }
  return "This profile is incomplete or uncertain. It should be reviewed with a navigator, trainer, or employer before being treated as a reliable credential.";
}

function templateSummary(answers, primary, confidence) {
  const occupation = primary?.occupation?.label ?? "worker";
  const years = Number(answers.experience_years) || 0;
  const experience =
    years >= 3 ? "more than three years" : years >= 1 ? "one to three years" : "less than one year";
  const employment = answers.employment_type ? `${answers.employment_type} ` : "";
  return `You are a ${employment}${occupation} with ${experience} of hands-on experience. This match is ${confidence} confidence and is based on your work description, selected skills, tools, and country context.`;
}

export function buildProfile({ answers, country, scoring, aiSummary }) {
  const primary = scoring.primary;
  const occupation = primary?.occupation;
  const mappedSkills = primary?.evidence.matched_skills ?? [];
  const education = educationFromCountry(country, answers.education);
  const profileId = `${country.country_code}-${randomUUID().slice(0, 8).toUpperCase()}`;

  return {
    id: profileId,
    profile_version: 1,
    generated_at: new Date().toISOString(),
    country_context: {
      country_code: country.country_code,
      country_name: country.country_name,
      city: answers.city || country.default_city,
      locale: country.locale,
    },
    intake: {
      work_description: answers.work_description,
      sector: answers.sector,
      experience_years: Number(answers.experience_years) || 0,
      employment_type: answers.employment_type,
      tools: answers.tools ?? [],
      selected_skills: answers.selected_skills ?? [],
      languages: answers.languages ?? [],
      aspiration: answers.aspiration,
    },
    education: {
      local_label: education.label,
      isced: education.isced,
      credential_tier: education.credential_tier,
    },
    primary_occupation: occupation
      ? {
          occupation_id: occupation.id,
          title: occupation.label,
          esco_code: occupation.esco_code,
          isco_code: occupation.isco_code,
          isco_title: occupation.isco_group?.label,
          sectors: occupation.sectors,
          confidence: scoring.confidence,
          score: primary.score,
        }
      : null,
    alternative_occupations: scoring.alternatives.map(({ occupation: alternative, score }) => ({
      occupation_id: alternative.id,
      title: alternative.label,
      esco_code: alternative.esco_code,
      isco_code: alternative.isco_code,
      score,
    })),
    skills: {
      mapped: mappedSkills.map((skill) => ({
        id: skill.id,
        label: skill.label,
        plain_label: skill.plain_label,
        evidence_type: skill.relation === "essential" ? "demonstrated_or_core" : "supporting",
      })),
      local_unmapped: scoring.local_skills,
    },
    confidence: {
      level: scoring.confidence,
      caveat: buildCaveat(scoring.confidence),
      evidence: primary?.evidence,
    },
    task_enrichment: {
      source: "O*NET 30.2",
      link_method: "precomputed title/description similarity",
      note: "Used for task/tool/technology evidence only; ESCO/ISCO remains the occupation identity source.",
      onet_links: primary?.evidence.onet_links ?? [],
      matched_evidence: primary?.evidence.matched_onet_evidence ?? [],
    },
    human_summary: aiSummary?.summary || templateSummary(answers, primary, scoring.confidence),
    sources: getSourceRegistry().sources
      .filter((source) => ["tabiya_esco_1_1_1", "onet_30_2", "onetsoc_isco_crosswalks"].includes(source.id))
      .map((source) => ({
        id: source.id,
        label: source.label,
        type: source.type,
        files: source.files?.map((file) => ({
          name: file.name,
          role: file.role,
          sha256: file.sha256,
        })),
      })),
    portability: {
      machine_readable: true,
      human_readable: true,
      standard_codes: ["ESCO", "ISCO-08", "ISCED"],
      privacy_default: "session_only_until_user_saves",
    },
  };
}
