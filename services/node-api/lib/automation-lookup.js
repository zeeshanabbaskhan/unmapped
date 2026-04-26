/**
 * Frey-Osborne automation probability lookup.
 *
 * Loads the Frey & Osborne (2017) "The Future of Employment" dataset at
 * module initialisation (703 rows, ~50 KB — negligible startup cost).
 *
 * Provides three lookup tiers, applied in order by the caller:
 *   1. Direct SOC code match   → source: "frey_osborne_direct"
 *   2. Weighted average via O*NET links (already in taxonomy index)
 *                               → source: "frey_osborne_onet_weighted"
 *   3. ISCO major-group fallback → source: "isco_group_fallback_arntz_2016"
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..", "..", "..");
const CSV_PATH = join(root, "data", "jobautomationprobability", "job-automation-probability.csv");

function loadFreyOsborne() {
  if (!existsSync(CSV_PATH)) {
    console.warn(`[automation-lookup] CSV not found at ${CSV_PATH} — Frey-Osborne lookup disabled.`);
    return new Map();
  }
  const content = readFileSync(CSV_PATH, "utf-8");
  const lookup = new Map();

  for (const line of content.split("\n").slice(1)) {
    const c1 = line.indexOf(",");
    const c2 = line.indexOf(",", c1 + 1);
    const c3 = line.indexOf(",", c2 + 1);
    if (c1 < 0 || c2 < 0 || c3 < 0) continue;

    const code = line.slice(c1 + 1, c2).trim();
    const prob = parseFloat(line.slice(c2 + 1, c3).trim());

    if (code && !isNaN(prob)) {
      lookup.set(code, prob);
    }
  }

  return lookup;
}

const automationBySoc = loadFreyOsborne();

// ISCO major-group fallback rates (Arntz, Gregory & Zierahn 2016).
const ISCO_GROUP_RATES = {
  "1": { rate: 0.1,  label: "Managers" },
  "2": { rate: 0.15, label: "Professionals" },
  "3": { rate: 0.35, label: "Technicians and Associate Professionals" },
  "4": { rate: 0.65, label: "Clerical Support Workers" },
  "5": { rate: 0.42, label: "Services and Sales Workers" },
  "6": { rate: 0.55, label: "Skilled Agricultural, Forestry and Fishery Workers" },
  "7": { rate: 0.45, label: "Craft and Related Trades Workers" },
  "8": { rate: 0.72, label: "Plant and Machine Operators and Assemblers" },
  "9": { rate: 0.75, label: "Elementary Occupations" },
};

export function getBySOCCode(socCode) {
  if (!socCode) return null;
  const normalized = socCode.replace(/\.00$/, "").trim();
  const prob = automationBySoc.get(normalized);
  if (prob === undefined) return null;
  return { probability: prob, source: "frey_osborne_direct", soc_code: normalized };
}

export function getByONetLinks(onetLinks = []) {
  const matches = [];
  for (const link of onetLinks) {
    const result = getBySOCCode(link.soc_code);
    if (result) {
      matches.push({ probability: result.probability, link_score: link.link_score ?? 1, soc_code: link.soc_code });
    }
  }
  if (!matches.length) return null;

  const totalWeight = matches.reduce((s, m) => s + m.link_score, 0);
  const weightedProb = matches.reduce((s, m) => s + m.probability * m.link_score, 0) / totalWeight;

  return {
    probability: Number(weightedProb.toFixed(3)),
    source: "frey_osborne_onet_weighted",
    matched_soc_codes: matches.map((m) => m.soc_code),
    match_count: matches.length,
  };
}

export function getByISCOGroup(iscoCode) {
  if (!iscoCode) return null;
  const major = String(iscoCode)[0];
  const entry = ISCO_GROUP_RATES[major];
  if (!entry) return null;

  return {
    probability: entry.rate,
    source: "isco_group_fallback_arntz_2016",
    isco_major_group: major,
    isco_group_label: entry.label,
    confidence: "low",
    note: `Group-level fallback (Arntz et al. 2016). Direct SOC match unavailable for ISCO ${iscoCode}.`,
  };
}

export const LOADED_COUNT = automationBySoc.size;
