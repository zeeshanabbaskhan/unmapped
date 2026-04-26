/**
 * LLM-based skill extractor — powered by OpenRouter.
 *
 * Uses the @openrouter/sdk to call any model available on OpenRouter.
 * Falls back to deterministic heuristic extraction when OPENROUTER_API_KEY
 * is absent or the LLM call fails, so the system runs fully offline.
 *
 * Output is a strict superset of the legacy extractSignals() shape so
 * scorer.js and the rest of the pipeline remain unchanged.
 *
 * Environment variables (set in .env):
 *   OPENROUTER_API_KEY   — required to enable the LLM path
 *   OPENROUTER_MODEL     — model slug, default "openai/gpt-oss-120b:free"
 *   LLM_TIMEOUT_MS       — request timeout in ms, default 8000
 */

import { OpenRouter } from "@openrouter/sdk";
import { normalizeText } from "./text.js";

const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL ?? "openai/gpt-oss-120b:free";
// Reasoning models can take 10-20s on free tier — give them enough headroom.
const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS ?? 20000);

// ---------------------------------------------------------------------------
// Heuristic fallback — runs when no API key is set or on LLM failure.
// Preserved verbatim from original nlp.js so behavior is identical.
// ---------------------------------------------------------------------------

const SKILL_KEYWORDS = {
  "repair mobile devices": [
    "fix phone",
    "repair phone",
    "replace screen",
    "battery",
    "lcd",
    "keypad",
    "mobile",
  ],
  troubleshoot: ["diagnose", "fault", "problem", "not working", "troubleshoot"],
  "maintain customer service": ["customer", "client", "explain", "advise"],
  "manage inventory": ["stock", "inventory", "parts", "supplies"],
  "use digital tools": [
    "internet",
    "youtube",
    "whatsapp",
    "computer",
    "mobile money",
    "bkash",
  ],
  "train others informally": [
    "teach",
    "train",
    "apprentice",
    "helper",
    "cousin",
  ],
};

const TOOL_KEYWORDS = {
  "mobile phone": ["phone", "mobile", "cell"],
  "small repair tools": ["screwdriver", "tool", "pliers", "solder"],
  internet: ["internet", "youtube", "online", "whatsapp"],
  "payment tools": ["mobile money", "momo", "bkash", "cash"],
};

const SECTOR_KEYWORDS = {
  technical_services: [
    "repair",
    "phone",
    "electronics",
    "device",
    "technical",
    "software",
  ],
  retail_trade: ["sell", "shop", "customer", "cashier", "stock"],
  construction: [
    "build",
    "construction",
    "carpenter",
    "weld",
    "electrician",
    "plumb",
  ],
  garments: ["sew", "tailor", "garment", "dress", "fabric"],
  transport: ["drive", "deliver", "motorbike", "taxi", "van"],
  food_services: ["cook", "kitchen", "food", "restaurant"],
};

function countMatches(text, keywords) {
  return keywords.reduce(
    (count, kw) => count + (text.includes(normalizeText(kw)) ? 1 : 0),
    0
  );
}

function heuristicExtract(answers) {
  const text = normalizeText(
    [
      answers.work_description,
      answers.extra_skills,
      ...(answers.tools ?? []),
      ...(answers.selected_skills ?? []),
    ].join(" ")
  );

  const skills = Object.entries(SKILL_KEYWORDS)
    .filter(([, kws]) => countMatches(text, kws) > 0)
    .map(([skill]) => skill);

  const tools = Object.entries(TOOL_KEYWORDS)
    .filter(([, kws]) => countMatches(text, kws) > 0)
    .map(([tool]) => tool);

  const sectorScores = Object.fromEntries(
    Object.entries(SECTOR_KEYWORDS).map(([sector, kws]) => [
      sector,
      countMatches(text, kws),
    ])
  );
  const likelySector = Object.entries(sectorScores).sort(
    (a, b) => b[1] - a[1]
  )[0];

  return {
    skills,
    tools,
    extracted_skills: skills.map((s) => ({
      label: s,
      confidence: 0.6,
      esco_hint: null,
      source: "heuristic",
    })),
    extracted_tasks: [],
    likely_sector:
      likelySector?.[1] > 0 ? likelySector[0] : (answers.sector ?? null),
    confidence: "heuristic",
    notes: ["node_deterministic_nlp"],
    provider: "heuristic",
  };
}

// ---------------------------------------------------------------------------
// LLM extraction via OpenRouter SDK
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a labor market analyst specializing in the ESCO (European Skills, Competencies, Qualifications and Occupations) taxonomy.

Your job: analyze informal work descriptions from workers in developing economies and extract structured occupational skill and task information.

Rules:
- Extract ONLY skills and tasks explicitly evidenced in the text. Do not infer or invent.
- Phrase skills in ESCO verb-object style: e.g. "repair electronic equipment", "manage customer interactions", "operate hand tools".
- Include occupational skills only — not personality traits or soft-skill generics.
- Confidence (0.0–1.0): how certain you are the skill is evidenced by the text.
- Output valid JSON only. No markdown fences, no prose outside the JSON object.`;

function buildUserPrompt(answers) {
  const lines = [
    `Work description: ${answers.work_description || "(not provided)"}`,
    `Sector: ${answers.sector || "(not provided)"}`,
    answers.extra_skills ? `Additional skills stated: ${answers.extra_skills}` : null,
    answers.tools?.length ? `Tools mentioned: ${answers.tools.join(", ")}` : null,
    answers.selected_skills?.length
      ? `Self-selected skills: ${answers.selected_skills.join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `${lines}

Extract structured skills and tasks. Return ONLY this JSON object (no extra keys):
{
  "extracted_skills": [
    { "label": "<ESCO-phrased skill>", "confidence": <0.0-1.0>, "esco_hint": "<nearest ESCO skill label or null>" }
  ],
  "extracted_tasks": ["<concrete task verb phrase>"],
  "likely_sector": "<one of: technical_services | retail_trade | construction | garments | transport | food_services | agriculture | personal_services | professional_services | other>",
  "extraction_notes": "<one sentence, optional, or null>"
}

Constraints: up to 8 skills, up to 6 tasks. Do not guess the sector beyond what the text implies.`;
}

/**
 * Strip markdown code fences if the model wraps its JSON output in them.
 * Some models return ```json ... ``` even when instructed not to.
 */
function stripCodeFences(raw) {
  return raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
}

let _openRouterClient = null;
function getClient() {
  if (!_openRouterClient) {
    _openRouterClient = new OpenRouter({
      apiKey: process.env.OPENROUTER_API_KEY,
    });
  }
  return _openRouterClient;
}

/**
 * Wrap a promise with a clean timeout using Promise.race.
 * Uses a plain setTimeout (no AbortController) so there are no dangling
 * signal listeners after the race resolves.
 */
function withTimeout(promise, ms) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`LLM request timed out after ${ms}ms`)),
      ms
    );
  });
  // Clear the timer whichever branch wins.
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

async function callLLM(answers) {
  const client = getClient();

  // Non-streaming call — structured JSON extraction doesn't benefit from
  // streaming and keeps error handling simple.
  // Note: gpt-oss-120b is a reasoning model; temperature/responseFormat
  // flags are set conservatively to maximise cross-model compatibility.
  const result = await client.chat.send({
    chatRequest: {
      model: OPENROUTER_MODEL,
      maxTokens: 800,
      // Request JSON output. Not all models honour this; robust parsing
      // (stripCodeFences) handles the fallback cases.
      responseFormat: { type: "json_object" },
      stream: false,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(answers) },
      ],
    },
  });

  const raw = result.choices?.[0]?.message?.content ?? "";
  if (!raw.trim()) {
    throw new Error("OpenRouter returned an empty response");
  }

  const parsed = JSON.parse(stripCodeFences(raw));

  const extractedSkills = (parsed.extracted_skills ?? [])
    .filter((s) => s && typeof s.label === "string" && s.label.trim())
    .slice(0, 8)
    .map((s) => ({
      label: s.label.trim().toLowerCase(),
      confidence: Math.min(1, Math.max(0, Number(s.confidence) || 0.7)),
      esco_hint: typeof s.esco_hint === "string" ? s.esco_hint : null,
      source: "llm",
    }));

  const extractedTasks = (parsed.extracted_tasks ?? [])
    .filter((t) => typeof t === "string" && t.trim())
    .slice(0, 6)
    .map((t) => t.trim().toLowerCase());

  const likelySector =
    typeof parsed.likely_sector === "string" && parsed.likely_sector.trim()
      ? parsed.likely_sector.trim()
      : answers.sector ?? null;

  const modelSlug = OPENROUTER_MODEL.replace(/[^a-z0-9]/gi, "_");

  return {
    skills: extractedSkills.map((s) => s.label),
    tools: answers.tools ?? [],
    extracted_skills: extractedSkills,
    extracted_tasks: extractedTasks,
    likely_sector: likelySector,
    confidence: "llm",
    notes: [`llm_openrouter_${modelSlug}`],
    provider: "openrouter",
    model: OPENROUTER_MODEL,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract skills, tasks, and sector signal from Module1 intake answers.
 *
 * Uses OpenRouter (via @openrouter/sdk) when OPENROUTER_API_KEY is set;
 * otherwise falls back to deterministic heuristic extraction at zero cost.
 * LLM failures also fall back automatically — the pipeline never breaks.
 *
 * Returned shape is backward compatible with scorer.js `aiSignals` parameter.
 *
 * @param {object} answers - Module1 intake answers
 * @returns {Promise<object>}
 */
export async function extractSkills(answers) {
  if (!process.env.OPENROUTER_API_KEY) {
    return heuristicExtract(answers);
  }

  try {
    return await withTimeout(callLLM(answers), LLM_TIMEOUT_MS);
  } catch (err) {
    console.warn(
      `[llm-extractor] OpenRouter call failed — using heuristic fallback. Reason: ${err.message}`
    );
    const fallback = heuristicExtract(answers);
    return {
      ...fallback,
      notes: [...fallback.notes, "llm_fallback_used"],
    };
  }
}
