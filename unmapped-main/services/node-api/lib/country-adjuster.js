/**
 * Country Adjustment Layer.
 *
 * The explicit pipeline step between LLM extraction and ISCO matching.
 * Applies country-specific context — sector resolution, ISCO priority groups,
 * and any sector boosts — to the extraction signals before they reach scorer.js.
 *
 * Country configs (GH.json, BD.json, ...) and the generated country_registry
 * remain the sole source of truth. No country logic is hardcoded here.
 *
 * Input:  raw signals from llm-extractor.js + intake answers + country config
 * Output: enriched signals object that scorer.js consumes via its `aiSignals`
 *         parameter, extended with a `country_context` block for full
 *         traceability.
 */

/**
 * Resolve the working sector for scoring.
 *
 * If the country config ships a `sector_map` (e.g. to alias user-facing names
 * to internal taxonomy IDs), that mapping is applied first. Falls back to the
 * LLM-inferred sector, then the user-provided sector.
 *
 * @param {string|null} signalSector - Sector inferred by LLM (or heuristics)
 * @param {string|null} answerSector - Raw sector from intake answers
 * @param {object}      country      - Country config from country_registry
 * @returns {string|null}
 */
function resolveActiveSector(signalSector, answerSector, country) {
  const sectorMap = country.sector_map ?? {};
  const candidate = signalSector ?? answerSector ?? null;
  return (candidate && sectorMap[candidate]) ? sectorMap[candidate] : candidate;
}

/**
 * Build a human-readable list of the adjustments this layer applied so that
 * the profile can surface them in its `reason` fields.
 *
 * @param {object} country
 * @param {string|null} originalSector
 * @param {string|null} resolvedSector
 * @returns {string[]}
 */
function buildAdjustmentReasons(country, originalSector, resolvedSector) {
  const reasons = [];

  if (resolvedSector && resolvedSector !== originalSector) {
    reasons.push(
      `Sector remapped from "${originalSector}" to "${resolvedSector}" per ${country.country_code} config.`
    );
  }

  const priorityIsco = country.priority_isco_groups ?? [];
  if (priorityIsco.length) {
    reasons.push(
      `${country.country_code} applies scoring boost to ${priorityIsco.length} priority ISCO group(s): ${priorityIsco.slice(0, 4).join(", ")}${priorityIsco.length > 4 ? "…" : ""}.`
    );
  }

  const prioritySectors = country.priority_sectors ?? [];
  if (prioritySectors.length && resolvedSector) {
    const isPriority = prioritySectors.includes(resolvedSector);
    if (isPriority) {
      reasons.push(
        `Sector "${resolvedSector}" is a priority sector for ${country.country_code}.`
      );
    }
  }

  const sectorBoosts = country.sector_boosts ?? {};
  const boostKeys = Object.keys(sectorBoosts);
  if (boostKeys.length) {
    reasons.push(
      `${country.country_code} applies ${boostKeys.length} sector weight override(s).`
    );
  }

  return reasons;
}

/**
 * Apply country adjustments to extraction signals.
 *
 * The returned object is a strict superset of the input `signals` object —
 * no fields are removed, only `likely_sector` may be overwritten and a
 * `country_context` block is appended. This guarantees scorer.js backward
 * compatibility.
 *
 * @param {object} signals  - Output from extractSkills() in llm-extractor.js
 * @param {object} answers  - Raw Module1 intake answers
 * @param {object} country  - Country config object from country_registry
 * @returns {object}        - Adjusted signals with country_context attached
 */
export function applyCountryAdjustments(signals, answers, country) {
  const resolvedSector = resolveActiveSector(
    signals.likely_sector,
    answers.sector,
    country
  );

  const adjustmentReasons = buildAdjustmentReasons(
    country,
    signals.likely_sector ?? answers.sector,
    resolvedSector
  );

  const countryContext = {
    country_code: country.country_code,
    priority_isco_groups: country.priority_isco_groups ?? [],
    priority_sectors: country.priority_sectors ?? [],
    sector_boosts: country.sector_boosts ?? {},
    sector_map: country.sector_map ?? {},
    resolved_sector: resolvedSector,
    adjustment_reasons: adjustmentReasons,
  };

  return {
    ...signals,
    // Overwrite likely_sector with the country-resolved value so that
    // scorer.js picks up the correct sector without any extra logic.
    likely_sector: resolvedSector,
    country_context: countryContext,
  };
}
