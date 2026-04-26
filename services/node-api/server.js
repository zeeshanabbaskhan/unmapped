import http from "node:http";
import { getConfigStats, getCountry, getFullConfig, getIntakeOptions, getModule1Metadata, getSupportedCountries } from "./lib/dataStore.js";
import { extractSignals, summarizeProfile } from "./lib/nlp.js";
import { generateModule3Opportunities } from "./lib/opportunityEngine.js";
import { buildProfile } from "./lib/profile.js";
import { scoreProfile } from "./lib/scorer.js";

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
  if (missing.length) {
    return `Missing required fields: ${missing.join(", ")}`;
  }
  return null;
}

async function createModule1Profile(request, response) {
  const body = await readBody(request);
  const answers = body.answers ?? body;
  const validationError = validateAnswers(answers);
  if (validationError) {
    sendJson(response, 400, { error: validationError });
    return;
  }

  const country = getCountry(answers.country_code);
  const aiSignals = extractSignals(answers);

  const scoring = scoreProfile(answers, country, aiSignals);
  const summary = summarizeProfile({
    answers,
    country,
    primaryOccupation: scoring.primary?.occupation,
    confidence: scoring.confidence,
    mappedSkills: scoring.primary?.evidence.matched_skills ?? [],
    localSkills: scoring.local_skills,
  });

  const profile = buildProfile({
    answers,
    country,
    scoring,
    aiSummary: summary,
  });

  sendJson(response, 200, {
    profile,
    debug: {
      ai_signals: aiSignals,
      candidate_count: 1 + scoring.alternatives.length,
      deterministic_scoring: true,
    },
  });
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (request.method === "OPTIONS") {
      sendJson(response, 204, {});
      return;
    }

    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, { ok: true, service: "unmapped-node-api" });
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

    // /api/config/:country — full resolved config for a country (ISO-2 or ISO-3)
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
      sendJson(
        response,
        200,
        getIntakeOptions({
          sector: url.searchParams.get("sector"),
          limit: url.searchParams.get("limit") ?? "all",
        })
      );
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/module1/profile") {
      await createModule1Profile(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/module3/opportunities") {
      const body = await readBody(request);
      const module1Output = body.module1_output ?? body.profile ?? body.module1Output;
      if (!module1Output || typeof module1Output !== "object") {
        sendJson(response, 400, {
          error: "Missing module1 output. Provide `module1_output` in request body.",
        });
        return;
      }

      const requestCountry = body.country_code ?? module1Output?.country_context?.country_code ?? module1Output?.country_context?.country ?? "GH";
      const country = getCountry(requestCountry);

      const includeTypes = Array.isArray(body.include_types)
        ? body.include_types.map((type) => String(type))
        : undefined;
      const limit = body.limit ?? 8;

      const result = generateModule3Opportunities({
        module1Output,
        countryConfig: country,
        limit,
        includeTypes,
      });
      sendJson(response, 200, result);
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
  console.log(`Module 1 Node API listening on http://localhost:${PORT}`);
});
