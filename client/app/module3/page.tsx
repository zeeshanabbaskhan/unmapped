"use client";

import { useMemo, useState } from "react";
import { getModule3Opportunities, Module3Module1Output, Module3Response } from "@/lib/api";

const EXAMPLE_INPUT: Module3Module1Output = {
  input_summary: {
    original_text: "I repair phones, help customers, and run a small shop",
    detected_language: "en",
  },
  skills: [
    { name: "mobile device repair", confidence: 0.92, source: "LLM extraction + normalization" },
    { name: "customer service", confidence: 0.88, source: "LLM extraction + normalization" },
    { name: "small business operations", confidence: 0.81, source: "LLM extraction + normalization" },
  ],
  occupation_candidates: [
    {
      isco_code: "7421",
      title: "Electronics and Telecommunications Installers and Repairers",
      confidence: 0.86,
      matched_skills: ["mobile device repair"],
      reason: "Strong alignment with hands-on device repair and troubleshooting tasks",
    },
    {
      isco_code: "5223",
      title: "Shop Salespersons",
      confidence: 0.71,
      matched_skills: ["customer service", "sales"],
      reason: "Matches customer interaction and retail environment tasks",
    },
  ],
  final_selection: {
    isco_code: "7421",
    title: "Electronics and Telecommunications Installers and Repairers",
    confidence: 0.86,
    reason: "Primary activity is technical repair of mobile devices.",
  },
  country_context: {
    country: "Ghana",
    labor_structure: "high informal sector dominance",
  },
  adjusted_readiness: {
    automation_risk_base: 0.72,
    automation_risk_adjusted: 0.61,
    interpretation: "Moderate risk due to manual nature of repair work and slower automation adoption in local context",
  },
};

export default function Module3Page() {
  const [countryCode, setCountryCode] = useState("GH");
  const [jsonInput, setJsonInput] = useState(JSON.stringify(EXAMPLE_INPUT, null, 2));
  const [result, setResult] = useState<Module3Response | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const parsedInput = useMemo(() => {
    try {
      return JSON.parse(jsonInput) as Module3Module1Output;
    } catch {
      return null;
    }
  }, [jsonInput]);

  async function runModule3() {
    if (!parsedInput) {
      setError("Invalid JSON input");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await getModule3Opportunities({
        module1Output: parsedInput,
        countryCode,
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not run Module 3");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-stone-50 text-stone-950">
      <section className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-6 lg:px-8">
        <header className="rounded-3xl bg-stone-950 p-6 text-white">
          <p className="text-sm uppercase tracking-[0.25em] text-emerald-300">Module 03</p>
          <h1 className="mt-2 text-3xl font-semibold md:text-4xl">Opportunity Matching & Econometric Dashboard</h1>
          <p className="mt-3 max-w-3xl text-stone-300">
            Honest opportunity matching using real labor market/econometric signals visible to youth and policymakers.
          </p>
        </header>

        <section className="rounded-3xl border border-stone-200 bg-white p-6">
          <div className="grid gap-4 md:grid-cols-[220px_1fr]">
            <label className="grid gap-2">
              <span className="text-sm font-medium">Country code (ISO-2)</span>
              <input
                className="rounded-xl border border-stone-300 px-3 py-2 uppercase"
                value={countryCode}
                maxLength={2}
                onChange={(event) => setCountryCode(event.target.value.toUpperCase())}
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium">Module 1 output JSON</span>
              <textarea
                className="min-h-72 rounded-xl border border-stone-300 px-3 py-2 font-mono text-xs"
                value={jsonInput}
                onChange={(event) => setJsonInput(event.target.value)}
              />
            </label>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              className="rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white disabled:bg-stone-400"
              onClick={runModule3}
              disabled={loading}
            >
              {loading ? "Running..." : "Run Module 3"}
            </button>
            {error ? <p className="text-sm text-red-700">{error}</p> : null}
          </div>
        </section>

        {result ? (
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="rounded-3xl border border-stone-200 bg-white p-6">
              <h2 className="text-2xl font-semibold">Youth-facing visible econometric signals</h2>
              <p className="mt-1 text-sm text-stone-600">{result.econometric_dashboard.youth_view.signal_note}</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {result.econometric_dashboard.youth_view.visible_signals.map((signal) => (
                  <div key={signal.id} className="rounded-2xl border border-stone-200 p-4">
                    <p className="text-xs uppercase text-stone-500">{signal.label}</p>
                    <p className="mt-1 text-2xl font-semibold">
                      {signal.value ?? "N/A"} {signal.unit}
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      {signal.source} · {signal.year ?? "n/a"} · trend {signal.trend}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-stone-200 bg-white p-6">
              <h2 className="text-2xl font-semibold">Top opportunities</h2>
              <div className="mt-4 grid gap-3">
                {result.opportunities.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-stone-200 p-4">
                    <p className="text-sm text-stone-600">{item.type}</p>
                    <h3 className="text-lg font-semibold">{item.title}</h3>
                    <p className="text-sm">Match: {Math.round(item.match_score * 100)}% · {item.confidence}</p>
                    <ul className="mt-2 list-disc pl-5 text-sm text-stone-700">
                      {item.rationale.slice(0, 2).map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : null}

        {result ? (
          <section className="rounded-3xl border border-stone-200 bg-white p-6">
            <h2 className="text-2xl font-semibold">Policymaker panel</h2>
            <p className="mt-2 text-sm text-stone-600">
              {result.econometric_dashboard.policymaker_view.country.name} ·{" "}
              {result.econometric_dashboard.policymaker_view.country.income_level}
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <MetricCard
                label="Total econometric signals"
                value={String(result.econometric_dashboard.policymaker_view.diagnostics.total_econometric_signals)}
              />
              <MetricCard
                label="Visible to youth"
                value={String(result.econometric_dashboard.policymaker_view.diagnostics.visible_to_youth_count)}
              />
              <MetricCard
                label="Infrastructure level"
                value={result.econometric_dashboard.policymaker_view.diagnostics.infrastructure_level ?? "n/a"}
              />
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 p-4">
      <p className="text-xs uppercase text-stone-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
