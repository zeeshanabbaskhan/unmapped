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
    years >= 3
      ? "more than three years"
      : years >= 1
        ? "one to three years"
        : "less than one year";
  const employment = answers.employment_type ? `${answers.employment_type} ` : "";
  return `You are a ${employment}${occupation} with ${experience} of hands-on experience. This match is ${confidence} confidence and is based on your work description, selected skills, tools, and country context.`;
}

/**
 * Generate a human-readable explanation of why this occupation was matched.
 *
 * Reads from the evidence object produced by scorer.js and produces a concise
 * traceable sentence. All numeric values come from deterministic scoring — this
 * function is purely formatting.
 *
 * @param {object} evidence - primary.evidence from scoreProfile output
 * @returns {string}
 */
function buildMatchReason(evidence) {
  if (!evidence) return "Matched by general text and skill similarity.";

  const parts = [];

  const essentialMatches = (evidence.matched_skills ?? []).filter(
    (s) => s.relation === "essential"
  );
  if (essentialMatches.length > 0) {
    parts.push(
      `${essentialMatches.length} essential ESCO skill match${essentialMatches.length !== 1 ? "es" : ""} (score ${evidence.essential_skill_score})`
    );
  }

  if (evidence.sector_score > 0) {
    parts.push(`sector aligned (score ${evidence.sector_score})`);
  }

  if (evidence.text_score > 0) {
    parts.push(`text similarity ${evidence.text_score}`);
  }

  if (evidence.onet_score > 0) {
    parts.push(`O*NET task evidence ${evidence.onet_score}`);
  }

  if (evidence.country_priority_score > 0) {
    parts.push("country-priority ISCO group");
  }

  return parts.length
    ? `Matched via: ${parts.join("; ")}.`
    : "Matched by general text and skill similarity.";
}

/**
 * Assemble the final Module 1 profile object.
 *
 * Backward compatible with all fields consumed by client/lib/api.ts.
 * New fields (match_reason, match_score, reason, extraction_method,
 * country_adjustment) are additive and do not break existing consumers.
 *
 * @param {object} params
 * @param {object} params.answers
 * @param {object} params.country
 * @param {object} params.scoring   - output of scoreProfile()
 * @param {object} params.signals   - output of applyCountryAdjustments()
 * @param {object} params.aiSummary - output of summarizeProfile()
 */
export function buildProfile({ answers, country, scoring, signals = {}, aiSummary }) {
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
          // Traceable explanation of why this occupation was selected.
          match_reason: buildMatchReason(primary.evidence),
        }
      : null,

    alternative_occupations: scoring.alternatives.map(
      ({ occupation: alternative, score }) => ({
        occupation_id: alternative.id,
        title: alternative.label,
        esco_code: alternative.esco_code,
        isco_code: alternative.isco_code,
        score,
      })
    ),

    skills: {
      mapped: mappedSkills.map((skill) => ({
        id: skill.id,
        label: skill.label,
        plain_label: skill.plain_label,
        evidence_type:
          skill.relation === "essential"
            ? "demonstrated_or_core"
            : "supporting",
        // Added for explainability — not present in the original contract
        // but additive and safe for existing consumers.
        match_score: skill.match_score,
        reason:
          skill.relation === "essential"
            ? `Essential ESCO skill — token overlap score ${skill.match_score}.`
            : `Supporting ESCO skill — token overlap score ${skill.match_score}.`,
      })),
      local_unmapped: scoring.local_skills,
    },

    confidence: {
      level: scoring.confidence,
      caveat: buildCaveat(scoring.confidence),
      // Surface which extraction path was used (LLM or heuristic).
      extraction_method: signals.provider ?? "heuristic",
      extraction_provider:
        signals.provider === "openai"
          ? `openai/${signals.model ?? "unknown"}`
          : signals.provider ?? "heuristic",
      evidence: primary?.evidence,
      // Country adjustment reasons for full traceability.
      country_adjustments:
        signals.country_context?.adjustment_reasons ?? [],
    },

    task_enrichment: {
      source: "O*NET 30.2",
      link_method: "precomputed title/description similarity",
      note: "Used for task/tool/technology evidence only; ESCO/ISCO remains the occupation identity source.",
      onet_links: primary?.evidence.onet_links ?? [],
      matched_evidence: primary?.evidence.matched_onet_evidence ?? [],
    },

    human_summary:
      aiSummary?.summary || templateSummary(answers, primary, scoring.confidence),

    sources: getSourceRegistry()
      .sources.filter((source) =>
        ["tabiya_esco_1_1_1", "onet_30_2", "onetsoc_isco_crosswalks"].includes(
          source.id
        )
      )
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
