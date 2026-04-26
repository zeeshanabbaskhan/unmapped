import { getLocalInformalSkills, getTaxonomyIndex } from "./dataStore.js";
import { normalizeText, overlapScore, tokenSet, unique } from "./text.js";

function buildUserText(answers, aiSignals) {
  return normalizeText(
    [
      answers.work_description,
      answers.extra_skills,
      answers.sector,
      ...(answers.tools ?? []),
      ...(answers.selected_skills ?? []),
      // Flat skill/tool labels from both heuristic and LLM paths
      ...(aiSignals?.skills ?? []),
      ...(aiSignals?.tools ?? []),
      // LLM-extracted task phrases — broaden token coverage without changing
      // scoring weights; purely additive so determinism is preserved.
      ...(aiSignals?.extracted_tasks ?? []),
    ].join(" ")
  );
}

function experienceScore(years = 0) {
  const numericYears = Number(years) || 0;
  if (numericYears >= 3) return 1;
  if (numericYears >= 1) return 0.7;
  return 0.45;
}

function sectorScore(occupation, sector) {
  if (!sector) return 0.35;
  const sectorAliases = {
    construction: ["construction_manufacturing_transport"],
    transport: ["construction_manufacturing_transport"],
    garments: ["garments_craft"],
    food_services: ["food_hospitality"],
  };
  const accepted = new Set([sector, ...(sectorAliases[sector] ?? [])]);
  return occupation.sectors.some((occupationSector) => accepted.has(occupationSector)) ? 1 : 0;
}

function skillOverlap(occupation, userTokens, relation) {
  const skills = relation === "essential" ? occupation.essential_skills : occupation.optional_skills;
  if (!skills.length) return { score: 0, matches: [] };

  const matches = [];
  let total = 0;
  for (const skill of skills) {
    const score = Math.max(
      overlapScore(userTokens, skill.label),
      overlapScore(userTokens, skill.plain_label),
      overlapScore(userTokens, skill.description),
      overlapScore(userTokens, skill.alt_labels.join(" "))
    );
    if (score > 0) {
      total += Math.min(1, score);
      matches.push({
        id: skill.id,
        label: skill.label,
        plain_label: skill.plain_label,
        match_score: Number(score.toFixed(3)),
        relation,
      });
    }
  }

  return {
    score: Math.min(1, total / Math.max(4, skills.length * 0.18)),
    matches: matches.sort((a, b) => b.match_score - a.match_score).slice(0, 12),
  };
}

function textSimilarity(occupation, userTokens) {
  return Math.max(
    overlapScore(userTokens, occupation.label),
    overlapScore(userTokens, occupation.alt_labels.join(" ")),
    overlapScore(userTokens, occupation.description),
    overlapScore(userTokens, occupation.search_text)
  );
}

function onetOverlap(occupation, userTokens) {
  const enrichments = occupation.onet?.enrichments ?? [];
  const matches = [];
  let total = 0;

  for (const enrichment of enrichments.slice(0, 2)) {
    for (const task of enrichment.tasks ?? []) {
      const score = overlapScore(userTokens, task.task);
      if (score > 0) {
        total += Math.min(1, score);
        matches.push({
          type: "task",
          label: task.task,
          source_title: enrichment.title,
          soc_code: enrichment.soc_code,
          match_score: Number(score.toFixed(3)),
        });
      }
    }

    for (const tool of enrichment.tools ?? []) {
      const label = [tool.example, tool.commodity_title].filter(Boolean).join(" - ");
      const score = overlapScore(userTokens, label);
      if (score > 0) {
        total += Math.min(1, score);
        matches.push({
          type: "tool",
          label,
          source_title: enrichment.title,
          soc_code: enrichment.soc_code,
          match_score: Number(score.toFixed(3)),
        });
      }
    }

    for (const technology of enrichment.technology_skills ?? []) {
      const label = [technology.example, technology.commodity_title].filter(Boolean).join(" - ");
      const score = overlapScore(userTokens, label);
      if (score > 0) {
        total += Math.min(1, score);
        matches.push({
          type: "technology",
          label,
          source_title: enrichment.title,
          soc_code: enrichment.soc_code,
          match_score: Number(score.toFixed(3)),
        });
      }
    }
  }

  return {
    score: Math.min(1, total / 5),
    matches: matches.sort((a, b) => b.match_score - a.match_score).slice(0, 10),
  };
}

function detectLocalSkills(userText) {
  const normalized = normalizeText(userText);
  return getLocalInformalSkills()
    .filter((skill) => skill.keywords.some((keyword) => normalized.includes(normalizeText(keyword))))
    .map((skill) => ({
      id: skill.id,
      label: skill.label,
      plain_label: skill.plain_label,
      taxonomy_status: "local_unmapped",
    }));
}

function confidenceFor(score, topTwoGap, essentialMatches, years) {
  if (score >= 0.78 && essentialMatches >= 3 && years >= 1) return "high";
  if (score >= 0.72 && topTwoGap >= 0.08 && essentialMatches >= 3 && years >= 1) return "high";
  if (score >= 0.48 && essentialMatches >= 1) return "medium";
  return "low";
}

export function scoreProfile(answers, country, aiSignals = {}) {
  const taxonomy = getTaxonomyIndex();
  const userText = buildUserText(answers, aiSignals);
  const userTokens = tokenSet(userText);

  // Priority ISCO groups: prefer pre-resolved set from country-adjuster if
  // present (placed in aiSignals.country_context), else read from country config
  // directly. Both paths are equivalent — the adjuster just makes it explicit.
  const priorityIsco = new Set(
    aiSignals.country_context?.priority_isco_groups ??
      country.priority_isco_groups ??
      []
  );

  // Preferred sector: use the country-adjuster's resolved sector if available
  // (it may have applied a country sector_map), then the LLM inferred sector,
  // then the raw user-provided sector. Never null — defaults to empty string.
  const preferredSector =
    aiSignals.country_context?.resolved_sector ??
    aiSignals.likely_sector ??
    answers.sector ??
    "";

  const scored = Object.values(taxonomy.occupations)
    .map((occupation) => {
      const essential = skillOverlap(occupation, userTokens, "essential");
      const optional = skillOverlap(occupation, userTokens, "optional");
      const sector = sectorScore(occupation, preferredSector);
      const text = textSimilarity(occupation, userTokens);
      const exp = experienceScore(answers.experience_years);
      const countryPriority = priorityIsco.has(occupation.isco_code) ? 1 : 0;
      const onet = onetOverlap(occupation, userTokens);

      const score =
        essential.score * 0.33 +
        optional.score * 0.13 +
        sector * 0.13 +
        text * 0.2 +
        onet.score * 0.1 +
        exp * 0.06 +
        countryPriority * 0.05;

      return {
        occupation,
        score: Number(score.toFixed(4)),
        evidence: {
          essential_skill_score: Number(essential.score.toFixed(4)),
          optional_skill_score: Number(optional.score.toFixed(4)),
          sector_score: Number(sector.toFixed(4)),
          text_score: Number(text.toFixed(4)),
          onet_score: Number(onet.score.toFixed(4)),
          experience_score: Number(exp.toFixed(4)),
          country_priority_score: countryPriority,
          matched_skills: unique([...essential.matches, ...optional.matches]),
          matched_onet_evidence: onet.matches,
          onet_links: occupation.onet?.matches ?? [],
        },
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const primary = scored[0];
  const second = scored[1];
  const topTwoGap = primary && second ? primary.score - second.score : primary?.score ?? 0;
  const essentialMatches = primary?.evidence.matched_skills.filter((skill) => skill.relation === "essential").length ?? 0;

  return {
    primary,
    alternatives: scored.slice(1, 4),
    confidence: confidenceFor(primary?.score ?? 0, topTwoGap, essentialMatches, Number(answers.experience_years) || 0),
    local_skills: detectLocalSkills(userText),
    user_text: userText,
  };
}
