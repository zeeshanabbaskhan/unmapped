import { normalizeText } from "./text.js";

/**
 * Build a short human-readable summary of a scored profile.
 *
 * Template-based and deterministic: produces stable output across runs, which
 * is required by the output consistency constraint. The LLM extraction path
 * feeds richer `mappedSkills` through scorer.js, so the summary naturally
 * improves without becoming non-deterministic.
 *
 * @param {object} params
 * @param {object} params.answers
 * @param {object} params.country
 * @param {object|null} params.primaryOccupation
 * @param {string} params.confidence          - "high" | "medium" | "low"
 * @param {object[]} params.mappedSkills      - matched skills from scorer
 * @param {object[]} params.localSkills       - local unmapped skills
 * @param {string} [params.extractionMethod]  - "openai" | "heuristic" | …
 */
export function summarizeProfile({
  answers,
  country,
  primaryOccupation,
  confidence,
  mappedSkills,
  localSkills,
  extractionMethod = "heuristic",
}) {
  const title = primaryOccupation?.label ?? "worker";
  const years = Number(answers.experience_years) || 0;
  const city = answers.city || country.default_city;
  const experience =
    years >= 3
      ? "more than three years"
      : years >= 1
        ? "one to three years"
        : "less than one year";

  const skillNames = mappedSkills
    .slice(0, 4)
    .map((skill) => skill.plain_label || skill.label)
    .filter(Boolean);

  let summary = `You are a ${title} in ${city}, ${country.country_name}, with ${experience} of hands-on experience.`;
  if (skillNames.length) {
    summary += ` Your profile shows practical ability to ${skillNames
      .slice(0, 3)
      .join(", ")
      .toLowerCase()}.`;
  }
  if (localSkills.length) {
    summary +=
      " It also records local skills that standard taxonomies often miss.";
  }

  const provider =
    extractionMethod === "openai" || extractionMethod === "llm"
      ? "llm_assisted"
      : "node_deterministic_nlp";

  return {
    summary,
    confidence_note: `This is a ${confidence}-confidence self-reported profile, not a verified credential.`,
    provider,
  };
}
