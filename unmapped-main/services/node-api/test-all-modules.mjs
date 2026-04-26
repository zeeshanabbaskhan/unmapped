/**
 * End-to-end smoke test — Modules 1, 2, and 3.
 *
 * Runs sequentially:
 *   1. POST /api/module1/profile      → generates a worker profile
 *   2. POST /api/module2/risk-analysis → automation risk from profile
 *   3. POST /api/module3/opportunities → opportunity map from profile + risk
 *
 * Usage:  node test-all-modules.mjs
 * Env:    reads .env via --env-file flag (see package.json scripts)
 */

const BASE = "http://localhost:4000";

const SAMPLE_ANSWERS = {
  country_code: "GH",
  city: "Accra",
  education: "tvet",
  work_description: "I repair mobile phones and electronics. I fix cracked screens, replace batteries, diagnose faults, and do soldering. I've been doing this for 5 years in my own small workshop.",
  sector: "technical_services",
  experience_years: 5,
  employment_type: "self_employed",
  tools: ["soldering iron", "multimeter", "screwdrivers"],
  selected_skills: ["electronics repair", "fault diagnosis", "soldering"],
  languages: ["English", "Twi"],
  aspiration: "grow my repair business or find stable employment",
  extra_skills: "I also fix laptops and do basic data recovery",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function pass(label)  { console.log(`  ✓ ${label}`); }
function fail(label)  { console.error(`  ✗ ${label}`); }

function assertField(obj, path, label) {
  const keys = path.split(".");
  let cur = obj;
  for (const k of keys) {
    if (cur == null || !(k in cur)) { fail(`${label} — missing field: ${path}`); return false; }
    cur = cur[k];
  }
  if (cur === null || cur === undefined || cur === "") {
    fail(`${label} — empty field: ${path}`);
    return false;
  }
  pass(label);
  return true;
}

async function postJSON(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

// ─── Module 1 ────────────────────────────────────────────────────────────────

async function testModule1() {
  console.log("\n── MODULE 1: Skill Extraction + Profile ──────────────────────");
  console.log("  Calling POST /api/module1/profile …");

  const data = await postJSON("/api/module1/profile", { answers: SAMPLE_ANSWERS });
  const p = data.profile;

  assertField(p, "id", "profile.id exists");
  assertField(p, "primary_occupation.title", "primary_occupation.title");
  assertField(p, "primary_occupation.isco_code", "primary_occupation.isco_code");
  assertField(p, "primary_occupation.confidence", "primary_occupation.confidence");
  assertField(p, "skills.mapped", "skills.mapped is present");
  assertField(p, "confidence.level", "confidence.level");

  const skillCount = p.skills?.mapped?.length ?? 0;
  if (skillCount > 0) pass(`${skillCount} mapped skills`);
  else fail("No mapped skills returned");

  const method = p.confidence?.extraction_method;
  pass(`Extraction method: ${method ?? "not set"}`);

  if (p.primary_occupation?.match_reason) pass(`match_reason: "${p.primary_occupation.match_reason.slice(0, 60)}…"`);

  console.log(`\n  → ISCO: ${p.primary_occupation?.isco_code} — ${p.primary_occupation?.title}`);
  console.log(`  → Confidence: ${p.primary_occupation?.confidence} (score ${p.primary_occupation?.score})`);
  console.log(`  → Provider: ${method}`);

  return p;
}

// ─── Module 2 ────────────────────────────────────────────────────────────────

async function testModule2(profile) {
  console.log("\n── MODULE 2: Automation Risk Analysis ────────────────────────");
  console.log("  Calling POST /api/module2/risk-analysis …");

  const data = await postJSON("/api/module2/risk-analysis", {
    profile,
    country_code: SAMPLE_ANSWERS.country_code,
  });
  const a = data.analysis;

  assertField(a, "isco_code", "isco_code");
  assertField(a, "automation_analysis.base_automation_probability", "base_automation_probability");
  assertField(a, "automation_analysis.adjusted_automation_probability", "adjusted_automation_probability");
  assertField(a, "automation_analysis.adjustment_factor", "adjustment_factor");
  assertField(a, "task_breakdown.high_risk_tasks", "task_breakdown.high_risk_tasks");
  assertField(a, "task_breakdown.low_risk_tasks", "task_breakdown.low_risk_tasks");
  assertField(a, "skill_resilience_analysis.durable_skills", "durable_skills");
  assertField(a, "final_readiness_profile.risk_level", "risk_level");
  assertField(a, "economic_context.informality_level", "informality_level");

  const base = a.automation_analysis?.base_automation_probability;
  const adj  = a.automation_analysis?.adjusted_automation_probability;
  const factor = a.automation_analysis?.adjustment_factor;
  if (adj <= base) pass(`LMIC adjustment reduces risk: ${base} → ${adj} (factor ${factor})`);
  else fail(`LMIC adjustment should not increase risk: ${base} → ${adj}`);

  const provider = a._meta?.analysis_provider;
  pass(`Analysis provider: ${provider}`);

  console.log(`\n  → Base probability:     ${base}`);
  console.log(`  → Adjusted probability: ${adj} (LMIC factor ${factor})`);
  console.log(`  → Risk level:           ${a.final_readiness_profile?.risk_level}`);
  console.log(`  → Resilience:           ${a.final_readiness_profile?.resilience_level}`);
  console.log(`  → Provider:             ${provider}`);

  return a;
}

// ─── Module 3 ────────────────────────────────────────────────────────────────

async function testModule3(profile, module2) {
  console.log("\n── MODULE 3: Opportunity Matching ────────────────────────────");
  console.log("  Calling POST /api/module3/opportunities …");

  const data = await postJSON("/api/module3/opportunities", {
    profile,
    module2,
    country_code: SAMPLE_ANSWERS.country_code,
  });
  const o = data.opportunities;

  assertField(o, "isco_code", "isco_code");
  assertField(o, "labor_market_context.informality_level", "informality_level");
  assertField(o, "labor_market_context.key_economic_signals.wage_floor", "wage_floor");
  assertField(o, "labor_market_context.key_economic_signals.sector_employment_share", "sector_employment_share");
  assertField(o, "labor_market_context.key_economic_signals.youth_unemployment_rate", "youth_unemployment_rate");
  assertField(o, "opportunities.direct", "direct opportunities");
  assertField(o, "opportunities.adjacent", "adjacent opportunities");
  assertField(o, "opportunities.micro_enterprise", "micro_enterprise opportunities");
  assertField(o, "ranking", "ranking list");
  assertField(o, "policy_view.labor_gap_identified", "labor_gap_identified");
  assertField(o, "policy_view.recommendation_for_government_or_ngos", "policy recommendation");
  assertField(o, "explainability.key_drivers", "key_drivers");

  const directCount   = o.opportunities?.direct?.length ?? 0;
  const adjacentCount = o.opportunities?.adjacent?.length ?? 0;
  const microCount    = o.opportunities?.micro_enterprise?.length ?? 0;
  const rankCount     = o.ranking?.length ?? 0;

  pass(`${directCount} direct + ${adjacentCount} adjacent + ${microCount} micro opportunities`);
  pass(`${rankCount} ranked items`);

  // Verify at least two real economic signals are non-empty
  const signals = o.labor_market_context?.key_economic_signals ?? {};
  const populated = Object.values(signals).filter((v) => v && !v.includes("not available")).length;
  if (populated >= 2) pass(`${populated}/3 economic signals populated from ILOSTAT/config`);
  else fail(`Only ${populated} economic signals populated — need at least 2`);

  const provider = o._meta?.analysis_provider;
  pass(`Analysis provider: ${provider}`);

  console.log(`\n  → Informality: ${o.labor_market_context?.informality_level}`);
  console.log(`  → Wage floor:  ${signals.wage_floor}`);
  console.log(`  → Youth unemp: ${signals.youth_unemployment_rate}`);
  console.log(`  → Top opportunity: ${o.ranking?.[0]?.opportunity} (score ${o.ranking?.[0]?.score})`);
  console.log(`  → Provider: ${provider}`);

  return o;
}

// ─── Main ────────────────────────────────────────────────────────────────────

(async () => {
  console.log("=== UNMAPPED — Full Pipeline Smoke Test ===");
  console.log(`Server: ${BASE}  |  Country: ${SAMPLE_ANSWERS.country_code}`);
  console.log(`Note: LLM calls may take up to 60 s each.\n`);

  // Health check
  const health = await fetch(`${BASE}/health`).then((r) => r.json()).catch(() => null);
  if (!health?.ok) {
    console.error("✗ Server not reachable — is it running? (npm run dev in services/node-api)");
    process.exit(1);
  }
  console.log(`Health: OK  |  extraction_mode=${health.extraction_mode}`);

  let profile, module2;
  const startAll = Date.now();

  try {
    const t1 = Date.now();
    profile = await testModule1();
    console.log(`  Elapsed: ${((Date.now() - t1) / 1000).toFixed(1)}s`);
  } catch (err) {
    console.error(`\n✗ Module 1 FAILED: ${err.message}`);
    process.exit(1);
  }

  try {
    const t2 = Date.now();
    module2 = await testModule2(profile);
    console.log(`  Elapsed: ${((Date.now() - t2) / 1000).toFixed(1)}s`);
  } catch (err) {
    console.error(`\n✗ Module 2 FAILED: ${err.message}`);
    process.exit(1);
  }

  try {
    const t3 = Date.now();
    await testModule3(profile, module2);
    console.log(`  Elapsed: ${((Date.now() - t3) / 1000).toFixed(1)}s`);
  } catch (err) {
    console.error(`\n✗ Module 3 FAILED: ${err.message}`);
    process.exit(1);
  }

  console.log(`\n=== ALL TESTS PASSED  (total ${((Date.now() - startAll) / 1000).toFixed(1)}s) ===\n`);
})();
