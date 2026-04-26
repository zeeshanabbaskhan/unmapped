"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createModule1Profile,
  createModule2RiskAnalysis,
  getModule1Metadata,
  getSupportedCountries,
  matchOpportunities,
  Module1Answers,
  Module1Metadata,
  Module2Analysis,
  Module3Analysis,
  SupportedCountry,
} from "@/lib/api";

function seededPolicyAnswers(country: SupportedCountry): Module1Answers {
  const language = country.supported_languages?.[0] ?? country.language ?? "English";
  const city = country.default_city ?? "Capital";
  return {
    country_code: country.country_code,
    city,
    education: "upper_secondary",
    sector: "technical_services",
    employment_type: "employed",
    experience_years: 4,
    tools: ["Spreadsheet software", "Smartphone", "Point of sale systems"],
    selected_skills: ["Customer service", "Record keeping", "Problem solving", "Quality control"],
    languages: [language],
    aspiration: "higher income and stable growth path",
    extra_skills: "coordination, basic digital reporting",
    work_description:
      "Representative worker cohort in urban services handling operations, customer support, inventory, and routine digital workflows.",
  };
}

function pct(n: number | null | undefined) {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function hasMacroValue(value: string | null | undefined) {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return !normalized.includes("not available");
}

export default function Home() {
  const [countries, setCountries] = useState<SupportedCountry[]>([]);
  const [countryCode, setCountryCode] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [risk, setRisk] = useState<Module2Analysis | null>(null);
  const [opps, setOpps] = useState<Module3Analysis | null>(null);
  const [metadata, setMetadata] = useState<Module1Metadata | null>(null);

  const country = useMemo(
    () => countries.find((c) => c.country_code === countryCode) ?? null,
    [countries, countryCode]
  );

  async function loadPolicyDashboard(code: string) {
    const selectedCountry = countries.find((c) => c.country_code === code);
    if (!selectedCountry) return;
    setLoading(true);
    setError(null);
    setRisk(null);
    setOpps(null);
    try {
      const [meta, profile] = await Promise.all([
        getModule1Metadata().catch(() => null),
        createModule1Profile(seededPolicyAnswers(selectedCountry)),
      ]);
      if (meta) setMetadata(meta);
      const riskAnalysis = await createModule2RiskAnalysis(profile, code);
      setRisk(riskAnalysis);
      const opportunities = await matchOpportunities(profile, riskAnalysis, code);
      setOpps(opportunities);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load policy dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    getSupportedCountries()
      .then((list) => {
        setCountries(list);
        if (!countryCode && list.length > 0) {
          setCountryCode(list[0].country_code);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load countries"));
  }, []);

  useEffect(() => {
    if (!countryCode || countries.length === 0) return;
    loadPolicyDashboard(countryCode);
  }, [countryCode, countries]);

  const signalItems = useMemo(() => {
    const signals = opps?.labor_market_context.key_economic_signals;
    if (!signals) return [];
    return [
      { label: "Wage floor", value: signals.wage_floor },
      { label: "Sector employment", value: signals.sector_employment_share },
      { label: "Youth unemployment", value: signals.youth_unemployment_rate },
      { label: "NEET rate", value: signals.neet_rate },
      { label: "GDP per capita", value: signals.gdp_per_capita },
      { label: "Self-employment share", value: signals.self_employed_share },
      { label: "Digital infrastructure", value: signals.digital_infrastructure },
    ].filter((s) => s.value && s.value !== "Not available");
  }, [opps]);

  const educationProjection = risk?.macro_signals.education_projection ?? null;
  const laborShiftTrend = risk?.macro_signals.labor_shift_trend ?? null;
  const hasEducationProjection = hasMacroValue(educationProjection);
  const hasLaborShiftTrend = hasMacroValue(laborShiftTrend);
  const hasMacroCards = hasEducationProjection || hasLaborShiftTrend;

  return (
    <main className="min-h-screen bg-stone-50 text-stone-950">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-stone-950 text-white shadow-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3 lg:px-8">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Vectra Policy Dashboard</h1>
            <p className="text-xs text-stone-400">Labor market signals, automation risk, and actionable pathways</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-stone-400">Country</label>
            <select
              className="rounded-xl bg-white/10 px-3 py-1.5 text-sm font-medium text-white outline-none"
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
            >
              {countries.map((c) => (
                <option
                  key={c.country_code}
                  value={c.country_code}
                  style={{ color: "#111827", backgroundColor: "#ffffff" }}
                >
                  {c.country_name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="rounded-xl bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700"
              onClick={() => loadPolicyDashboard(countryCode)}
              disabled={loading}
            >
              Refresh
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-8 lg:px-8">
        <section className="rounded-3xl bg-stone-950 p-6 text-white">
          <p className="text-sm uppercase tracking-[0.3em] text-emerald-300">Policy View</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
            {country?.country_name ?? "Selected country"} labor intelligence overview
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-stone-300">
            Grounded dashboard for policymakers. No individual profile interaction is shown; results reflect a representative labor cohort.
          </p>
        </section>

        {loading && (
          <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
            <p className="font-medium">Building policy dashboard...</p>
            <p className="text-sm text-stone-500">
              Running data + model pipeline for {country?.country_name ?? "selected country"}.
            </p>
          </section>
        )}

        {error && (
          <section className="rounded-3xl border border-red-200 bg-red-50 p-6 text-red-800 shadow-sm">
            <p className="font-semibold">Dashboard load failed</p>
            <p className="text-sm">{error}</p>
          </section>
        )}

        {risk && (
          <section className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Base automation risk</p>
              <p className="mt-2 text-3xl font-bold text-stone-900">{pct(risk.automation_analysis.base_automation_probability)}</p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">LMIC-adjusted risk</p>
              <p className="mt-2 text-3xl font-bold text-stone-900">{pct(risk.automation_analysis.adjusted_automation_probability)}</p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Readiness profile</p>
              <p className="mt-2 text-3xl font-bold text-stone-900">{risk.final_readiness_profile.risk_level}</p>
            </div>
          </section>
        )}

        {signalItems.length > 0 && (
          <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold">Economic signals</h3>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {signalItems.map((item) => (
                <div key={item.label} className="rounded-2xl border border-stone-200 bg-stone-50 p-3">
                  <p className="text-xs font-medium text-stone-500">{item.label}</p>
                  <p className="mt-1 text-sm font-semibold text-stone-950">{item.value}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {opps && (
          <>
            <section className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Labor gap identified</p>
                <p className="mt-2 text-sm text-blue-950">{opps.policy_view.labor_gap_identified}</p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">Sector shortage signal</p>
                <p className="mt-2 text-sm text-amber-950">{opps.policy_view.sector_shortage_signal}</p>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Recommendation</p>
                <p className="mt-2 text-sm text-emerald-950">{opps.policy_view.recommendation_for_government_or_ngos}</p>
              </div>
            </section>

            <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold">Priority opportunity pathways</h3>
              <p className="mt-1 text-sm text-stone-500">Ranked by feasibility and labor market relevance.</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {opps.ranking.slice(0, 8).map((r, i) => (
                  <div key={`${r.opportunity}-${i}`} className="rounded-2xl border border-stone-200 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-stone-900">{r.opportunity}</p>
                      <span className="text-xs font-semibold text-stone-600">{r.score.toFixed(2)}</span>
                    </div>
                    <p className="mt-1 text-sm text-stone-600">{r.reason}</p>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {risk && hasMacroCards && (
          <section className="grid gap-4 sm:grid-cols-2">
            {hasEducationProjection && (
              <div className="rounded-3xl border border-blue-200 bg-blue-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">Education projection</p>
                <p className="mt-2 text-sm leading-relaxed text-blue-900">{educationProjection}</p>
              </div>
            )}
            {hasLaborShiftTrend && (
              <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-widest text-amber-600">Labor shift trend</p>
                <p className="mt-2 text-sm leading-relaxed text-amber-900">{laborShiftTrend}</p>
              </div>
            )}
          </section>
        )}

        {risk && !hasMacroCards && (
          <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
            <p className="text-sm font-semibold">Limited macro data coverage for this country</p>
            <p className="mt-1 text-sm">
              Education projection and labor-shift trend are not currently available for this country in the loaded datasets.
            </p>
          </section>
        )}

        {metadata && (
          <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold">Data transparency</h3>
            <p className="mt-1 text-sm text-stone-500">{metadata.note}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["Occupations", metadata.stats.occupations],
                ["Skills", metadata.stats.all_skills],
                ["Skill relations", metadata.stats.occupation_skill_relations],
                ["ISCO groups", metadata.stats.isco_groups],
                ["O*NET occupations", metadata.stats.onet_occupations],
                ["O*NET-enriched ESCO", metadata.stats.occupations_with_onet_enrichment],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-2xl bg-stone-50 p-4">
                  <p className="text-2xl font-bold text-stone-950">{Number(value).toLocaleString()}</p>
                  <p className="mt-0.5 text-sm text-stone-500">{label as string}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
