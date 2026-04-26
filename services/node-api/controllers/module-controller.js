import { getCountry } from "../lib/dataStore.js";
import { applyCountryAdjustments } from "../lib/country-adjuster.js";
import { extractSkills } from "../lib/llm-extractor.js";
import { summarizeProfile } from "../lib/nlp.js";
import { buildProfile } from "../lib/profile.js";
import { scoreProfile } from "../lib/scorer.js";
import { analyseRisk } from "../lib/risk-engine.js";
import { matchOpportunities } from "../lib/opportunity-engine.js";
import { validateModule1Answers } from "../validators/intake-validator.js";

export async function createModule1Profile(req, res) {
  const body = req.body ?? {};
  const answers = body.answers ?? body;
  const validationError = validateModule1Answers(answers);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const country = getCountry(answers.country_code);
  const rawSignals = await extractSkills(answers);
  const signals = applyCountryAdjustments(rawSignals, answers, country);
  const scoring = scoreProfile(answers, country, signals);
  const summary = summarizeProfile({
    answers,
    country,
    primaryOccupation: scoring.primary?.occupation,
    confidence: scoring.confidence,
    mappedSkills: scoring.primary?.evidence.matched_skills ?? [],
    localSkills: scoring.local_skills,
    extractionMethod: signals.provider,
  });

  const profile = buildProfile({ answers, country, scoring, signals, aiSummary: summary });

  res.status(200).json({
    profile,
    debug: {
      extraction: {
        provider: signals.provider,
        model: signals.model ?? null,
        notes: signals.notes,
        skill_count: signals.extracted_skills?.length ?? 0,
        task_count: signals.extracted_tasks?.length ?? 0,
      },
      country_adjustments: signals.country_context?.adjustment_reasons ?? [],
      candidate_count: 1 + scoring.alternatives.length,
      deterministic_scoring: true,
    },
  });
}

export async function createModule2RiskAnalysis(req, res) {
  const body = req.body ?? {};
  const profile = body.profile;
  const countryCode = body.country_code ?? profile?.country_context?.country_code;

  if (!profile || !profile.primary_occupation) {
    res.status(400).json({
      error: "Missing or invalid profile. Provide a Module 1 profile with primary_occupation.",
    });
    return;
  }
  if (!countryCode) {
    res.status(400).json({ error: "Missing country_code" });
    return;
  }

  const country = getCountry(countryCode);
  const analysis = await analyseRisk({ profile, country });
  res.status(200).json({ analysis });
}

export async function createModule3Opportunities(req, res) {
  const body = req.body ?? {};
  const profile = body.profile ?? body.module1_output ?? body.module1Output;
  const module2 = body.module2 ?? null;
  const countryCode = body.country_code ?? profile?.country_context?.country_code;

  if (!profile || !profile.primary_occupation) {
    res.status(400).json({
      error: "Missing or invalid profile. Provide a Module 1 profile with primary_occupation.",
    });
    return;
  }
  if (!countryCode) {
    res.status(400).json({ error: "Missing country_code" });
    return;
  }

  const country = getCountry(countryCode);
  const opportunities = await matchOpportunities({ profile, module2, country });
  res.status(200).json({ opportunities });
}
