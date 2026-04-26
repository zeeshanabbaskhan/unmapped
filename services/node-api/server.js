import http from "node:http";
import {
  getConfigStats,
  getCountry,
  getFullConfig,
  getIntakeOptions,
  getModule1Metadata,
  getSupportedCountries,
  getI18nStrings,
} from "./lib/dataStore.js";
import { applyCountryAdjustments } from "./lib/country-adjuster.js";
import { extractSkills } from "./lib/llm-extractor.js";
import { summarizeProfile } from "./lib/nlp.js";
import { buildProfile } from "./lib/profile.js";
import { scoreProfile } from "./lib/scorer.js";
import { analyseRisk } from "./lib/risk-engine.js";
import { matchOpportunities } from "./lib/opportunity-engine.js";

const PORT = Number(process.env.PORT || 4000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:3000";

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json",
    "access-control-allow-origin": CLIENT_ORIGIN,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  response.end(JSON.stringify(payload));
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
}

function validateAnswers(answers) {
  const missing = [];
  if (!answers.work_description) missing.push("work_description");
  if (!answers.country_code) missing.push("country_code");
  if (!answers.sector) missing.push("sector");
  if (missing.length) return `Missing required fields: ${missing.join(", ")}`;
  return null;
}

// ── Module 1 ────────────────────────────────────────────────────────────────

async function createModule1Profile(request, response) {
  const body = await readBody(request);
  const answers = body.answers ?? body;
  const validationError = validateAnswers(answers);
  if (validationError) {
    sendJson(response, 400, { error: validationError });
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

  sendJson(response, 200, {
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

// ── Module 2 — takes full Module 1 profile, auto-extracts ISCO ──────────────

async function createModule2RiskAnalysis(request, response) {
  const body = await readBody(request);
  const profile = body.profile;
  const countryCode = body.country_code ?? profile?.country_context?.country_code;

  if (!profile || !profile.primary_occupation) {
    sendJson(response, 400, {
      error: "Missing or invalid profile. Provide a Module 1 profile with primary_occupation.",
    });
    return;
  }
  if (!countryCode) {
    sendJson(response, 400, { error: "Missing country_code" });
    return;
  }

  const country = getCountry(countryCode);
  const analysis = await analyseRisk({ profile, country });

  sendJson(response, 200, { analysis });
}

// ── Module 3 — takes Module 1 profile + optional Module 2 output ────────────

async function createModule3Opportunities(request, response) {
  const body = await readBody(request);
  const profile = body.profile ?? body.module1_output ?? body.module1Output;
  const module2 = body.module2 ?? null;
  const countryCode = body.country_code ?? profile?.country_context?.country_code;

  if (!profile || !profile.primary_occupation) {
    sendJson(response, 400, {
      error: "Missing or invalid profile. Provide a Module 1 profile with primary_occupation.",
    });
    return;
  }
  if (!countryCode) {
    sendJson(response, 400, { error: "Missing country_code" });
    return;
  }

  const country = getCountry(countryCode);
  const opportunities = await matchOpportunities({ profile, module2, country });

  sendJson(response, 200, { opportunities });
}

// ── Router ──────────────────────────────────────────────────────────────────

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (request.method === "OPTIONS") {
      sendJson(response, 204, {});
      return;
    }

    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, {
        ok: true,
        service: "unmapped-node-api",
        extraction_mode: process.env.OPENROUTER_API_KEY ? "llm" : "heuristic",
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/i18n") {
      const locale = url.searchParams.get("locale") ?? "en";
      sendJson(response, 200, getI18nStrings(locale));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/countries") {
      sendJson(response, 200, { countries: getSupportedCountries() });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/config/stats") {
      sendJson(response, 200, getConfigStats());
      return;
    }

    const configMatch = url.pathname.match(/^\/api\/config\/([A-Za-z]{2,3})$/);
    if (request.method === "GET" && configMatch) {
      const countryCode = configMatch[1].toUpperCase();
      const config = getFullConfig(countryCode);
      if (!config || !config.country_code) {
        sendJson(response, 404, { error: `No config found for country: ${countryCode}` });
        return;
      }
      sendJson(response, 200, config);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/module1/metadata") {
      sendJson(response, 200, getModule1Metadata());
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/module1/intake-options") {
      sendJson(response, 200, getIntakeOptions({
        sector: url.searchParams.get("sector"),
        limit: url.searchParams.get("limit") ?? "all",
      }));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/module1/profile") {
      await createModule1Profile(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/module2/risk-analysis") {
      await createModule2RiskAnalysis(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/module3/opportunities") {
      await createModule3Opportunities(request, response);
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    sendJson(response, 500, {
      error: "Internal server error",
      detail: process.env.NODE_ENV === "production" ? undefined : error.message,
    });
  }
});

server.listen(PORT, () => {
  const mode = process.env.OPENROUTER_API_KEY ? "llm (OpenRouter)" : "heuristic (no key)";
  console.log(`UNMAPPED API listening on http://localhost:${PORT}`);
  console.log(`Extraction mode: ${mode}`);
});
