"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createModule1Profile,
  createModule2RiskAnalysis,
  matchOpportunities,
  getModule1IntakeOptions,
  getModule1Metadata,
  getI18nStrings,
  Module1Answers,
  Module1IntakeOptions,
  Module1Metadata,
  Module1Profile,
  Module2Analysis,
  Module3Analysis,
} from "@/lib/api";

// ─── Country config ──────────────────────────────────────────────────────────

const COUNTRIES = {
  GH: {
    label: "Ghana",
    city: "Accra",
    locale: "en-GH",
    lang: "en",
    currency: "GHS",
    languages: ["English", "Twi", "Ga", "Hausa", "Ewe"],
    education: [
      ["none", "No formal education"],
      ["primary", "Primary school"],
      ["lower_secondary", "Lower secondary / JHS"],
      ["upper_secondary", "SHS / WASSCE"],
      ["tvet", "TVET certificate"],
      ["tertiary", "Tertiary / university"],
    ],
  },
  BD: {
    label: "Bangladesh",
    city: "Dhaka",
    locale: "bn",
    lang: "bn",
    currency: "BDT",
    languages: ["Bengali", "English"],
    education: [
      ["none", "No formal education"],
      ["jsc", "JSC / lower secondary"],
      ["ssc", "SSC"],
      ["hsc", "HSC"],
      ["tvet", "TVET / technical certificate"],
      ["tertiary", "Tertiary / university"],
    ],
  },
} as const;

type CountryCode = keyof typeof COUNTRIES;
type Phase = "idle" | "m1_loading" | "m1_done" | "m2_loading" | "m2_done" | "m3_loading" | "m3_done";

// ─── i18n helper ─────────────────────────────────────────────────────────────

const EN_FALLBACK: Record<string, string> = {
  "intake.welcome": "Build your skills profile",
  "intake.subtitle": "Tell us about the work you already do. We will translate it into a portable, internationally recognised skills profile.",
  "intake.work_label": "Describe your work in your own words",
  "intake.work_placeholder": "Example: I repair phones, replace screens, buy parts, and explain problems to customers.",
  "intake.submit": "Generate portable skills profile",
  "intake.submitting": "Generating profile...",
  "profile.subtitle": "Portable profile",
  "profile.occupation_unknown": "Uncertain occupation",
  "profile.mapped_skills": "Mapped skills",
  "profile.local_skills": "Local skills not fully captured by ESCO",
  "profile.honest_caveat": "Honest caveat",
  "profile.data_sources": "Data sources",
  "profile.download_json": "Download profile JSON",
  "profile.print_pdf": "Print / save as PDF",
  "risk.title": "Automation Risk",
  "risk.subtitle": "AI Readiness & Displacement Risk Lens",
  "risk.durable_skills": "Durable skills",
  "risk.adjacent_skills": "Adjacent skills to build",
  "opp.title": "Opportunities",
  "opp.subtitle": "Matched opportunities for your skills profile",
  "opp.wage_signal": "Wage floor",
  "country.switch_label": "Viewing context",
  "nav.module1": "Skills Profile",
  "nav.module2": "Risk Lens",
  "nav.module3": "Opportunities",
};

// ─── Utility helpers ─────────────────────────────────────────────────────────

function toggleValue(arr: string[], v: string) {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

function pct(n: number | null | undefined) {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function riskColors(level: string) {
  switch (level) {
    case "very high": return { bg: "bg-red-50", border: "border-red-200", text: "text-red-800", badge: "bg-red-600 text-white" };
    case "high":      return { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-800", badge: "bg-orange-500 text-white" };
    case "medium":    return { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-800", badge: "bg-amber-500 text-white" };
    default:          return { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-800", badge: "bg-emerald-600 text-white" };
  }
}

function demandColor(d: string) {
  if (d === "high") return "bg-emerald-100 text-emerald-800";
  if (d === "medium") return "bg-amber-100 text-amber-800";
  return "bg-stone-100 text-stone-600";
}

function stabilityColor(s: string) {
  if (s === "stable") return "bg-emerald-100 text-emerald-800";
  if (s === "moderate") return "bg-amber-100 text-amber-800";
  return "bg-red-100 text-red-800";
}

// ─── Small shared components ──────────────────────────────────────────────────

function Badge({ label, className }: { label: string; className: string }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>{label}</span>;
}

function ProbBar({ value, max = 1, color }: { value: number; max?: number; color: string }) {
  const w = Math.round((value / max) * 100);
  return (
    <div className="h-2.5 w-full rounded-full bg-stone-200">
      <div className={`h-2.5 rounded-full transition-all ${color}`} style={{ width: `${w}%` }} />
    </div>
  );
}

function SignalCard({ label, value, source }: { label: string; value: string; source?: string }) {
  return (
    <div className="flex min-w-0 flex-col rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
      <p className="truncate text-xs font-medium text-stone-500">{label}</p>
      <p className="mt-1 text-sm font-semibold leading-tight text-stone-950">{value}</p>
      {source && <p className="mt-1 truncate text-[10px] text-stone-400">{source}</p>}
    </div>
  );
}

function SectionHeader({ number, title, subtitle, providerBadge }: { number: string; title: string; subtitle: string; providerBadge?: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-3xl bg-stone-950 p-6 text-white">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-emerald-300">{number}</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm text-stone-300">{subtitle}</p>
      </div>
      {providerBadge && (
        <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-stone-300">
          {providerBadge}
        </span>
      )}
    </div>
  );
}

function LoadingCard({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-4 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-stone-200 border-t-emerald-500" />
      <div>
        <p className="font-medium text-stone-950">{message}</p>
        <p className="mt-0.5 text-sm text-stone-500">This may take 20–40 seconds via OpenRouter AI</p>
      </div>
    </div>
  );
}

function SkillChip({ label, type }: { label: string; type: "risk" | "durable" | "adjacent" }) {
  const colors = {
    risk:     "bg-red-50 border-red-200 text-red-800",
    durable:  "bg-emerald-50 border-emerald-200 text-emerald-800",
    adjacent: "bg-blue-50 border-blue-200 text-blue-800",
  };
  return <span className={`rounded-full border px-3 py-1.5 text-sm ${colors[type]}`}>{label}</span>;
}

function OpportunityCard({
  title, iscoCode, incomeRange, demandStrength, entryBarrier, stability, reason, requiredUpskilling,
}: {
  title: string; iscoCode?: string; incomeRange: string; demandStrength?: string;
  entryBarrier: string; stability: string; reason: string; requiredUpskilling?: string[];
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-semibold text-stone-950">{title}</h4>
        {iscoCode && <span className="shrink-0 rounded-lg bg-stone-100 px-2 py-0.5 text-xs font-mono text-stone-600">ISCO {iscoCode}</span>}
      </div>
      <p className="mt-2 text-sm font-medium text-emerald-700">{incomeRange}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {demandStrength && <Badge label={`${demandStrength} demand`} className={demandColor(demandStrength)} />}
        <Badge label={`${entryBarrier} barrier`} className="bg-stone-100 text-stone-700" />
        <Badge label={stability} className={stabilityColor(stability)} />
      </div>
      {requiredUpskilling && requiredUpskilling.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {requiredUpskilling.map((s) => (
            <span key={s} className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">+{s}</span>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs leading-relaxed text-stone-500">{reason}</p>
    </div>
  );
}

// ─── Module 2 Panel ───────────────────────────────────────────────────────────

function Module2Panel({ risk, t }: { risk: Module2Analysis; t: (k: string) => string }) {
  const [showExplanation, setShowExplanation] = useState(false);
  const aa = risk.automation_analysis;
  const fp = risk.final_readiness_profile;
  const sr = risk.skill_resilience_analysis;
  const tb = risk.task_breakdown;
  const riskC = riskColors(fp.risk_level);
  const base = aa.base_automation_probability ?? 0;
  const adj = aa.adjusted_automation_probability ?? 0;
  const band = aa.uncertainty_band ?? 0.15;

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        number="MODULE 02"
        title={t("risk.title")}
        subtitle={t("risk.subtitle")}
        providerBadge={risk._meta?.analysis_provider?.replace("openrouter/", "") ?? undefined}
      />

      {/* Risk Overview */}
      <div className={`rounded-3xl border p-6 ${riskC.bg} ${riskC.border}`}>
        <div className="grid gap-6 md:grid-cols-2">
          {/* Probability comparison */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-stone-500">Automation Probability</p>
            <div className="mt-4 flex items-center gap-4">
              <div className="text-center">
                <p className="text-xs text-stone-500">OECD baseline</p>
                <p className="mt-1 text-4xl font-bold text-stone-800">{pct(base)}</p>
                <ProbBar value={base} color="bg-stone-400" />
              </div>
              <div className="text-2xl text-stone-400">→</div>
              <div className="text-center">
                <p className="text-xs text-stone-500">LMIC-adjusted for {risk.economic_context.country}</p>
                <p className={`mt-1 text-4xl font-bold ${riskC.text}`}>{pct(adj)}</p>
                <ProbBar value={adj} color={fp.risk_level === "low" ? "bg-emerald-500" : fp.risk_level === "medium" ? "bg-amber-500" : "bg-red-500"} />
              </div>
            </div>
            <p className="mt-2 text-xs text-stone-500">
              ±{pct(band)} uncertainty band · LMIC factor {aa.adjustment_factor}
            </p>
          </div>

          {/* Readiness profile */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className={`rounded-full px-4 py-1.5 text-sm font-bold ${riskC.badge}`}>
                {fp.risk_level.toUpperCase()} RISK
              </span>
              <span className="rounded-full bg-stone-950 px-4 py-1.5 text-sm font-bold text-white">
                {fp.resilience_level.toUpperCase()} RESILIENCE
              </span>
            </div>
            <p className="text-sm leading-relaxed text-stone-700">{fp.summary}</p>
            <div className="rounded-xl border border-stone-200 bg-white/60 p-3">
              <p className="text-xs font-medium text-stone-500">Opportunity type</p>
              <p className="mt-0.5 font-medium text-stone-950">{fp.opportunity_type.replace(/_/g, " ")}</p>
            </div>
          </div>
        </div>

        {/* Scenario toggles */}
        {aa.scenario_toggles && aa.scenario_toggles.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            <p className="w-full text-xs font-medium text-stone-500">Scenario range</p>
            {aa.scenario_toggles.map((sc) => {
              const scenAdj = Math.max(0, Math.min(1, adj + sc.multiplier_adjustment));
              return (
                <div key={sc.id} className="rounded-xl border border-stone-200 bg-white/70 px-3 py-2 text-xs">
                  <span className="text-stone-600">{sc.label}: </span>
                  <span className="font-semibold text-stone-950">{pct(scenAdj)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Task breakdown + Skill resilience */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Task breakdown */}
        <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-stone-950">Task breakdown</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-red-600">High risk</p>
              <div className="flex flex-col gap-2">
                {tb.high_risk_tasks.slice(0, 4).map((t, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="mt-0.5 flex h-5 w-14 shrink-0 items-center">
                      <div className="h-1.5 rounded-full bg-red-200" style={{ width: "100%" }}>
                        <div className="h-1.5 rounded-full bg-red-500" style={{ width: `${t.risk_score * 100}%` }} />
                      </div>
                    </div>
                    <p className="text-xs leading-relaxed text-stone-700">{t.task}</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-emerald-600">Low risk</p>
              <div className="flex flex-col gap-2">
                {tb.low_risk_tasks.slice(0, 4).map((t, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="mt-0.5 flex h-5 w-14 shrink-0 items-center">
                      <div className="h-1.5 rounded-full bg-emerald-200" style={{ width: "100%" }}>
                        <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${t.risk_score * 100}%` }} />
                      </div>
                    </div>
                    <p className="text-xs leading-relaxed text-stone-700">{t.task}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Skill resilience */}
        <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-stone-950">Skill resilience</h3>
          <div className="mt-4 flex flex-col gap-4">
            {sr.at_risk_skills.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-red-600">At risk</p>
                <div className="flex flex-wrap gap-1.5">{sr.at_risk_skills.map((s) => <SkillChip key={s} label={s} type="risk" />)}</div>
              </div>
            )}
            {sr.durable_skills.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-emerald-600">{t("risk.durable_skills")}</p>
                <div className="flex flex-wrap gap-1.5">{sr.durable_skills.map((s) => <SkillChip key={s} label={s} type="durable" />)}</div>
              </div>
            )}
            {sr.adjacent_skills.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-blue-600">{t("risk.adjacent_skills")}</p>
                <div className="flex flex-wrap gap-1.5">{sr.adjacent_skills.map((s) => <SkillChip key={s} label={s} type="adjacent" />)}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* LMIC explanation (expandable) */}
      <div className="rounded-3xl border border-stone-200 bg-white shadow-sm">
        <button
          type="button"
          className="flex w-full items-center justify-between p-5 text-left"
          onClick={() => setShowExplanation(!showExplanation)}
        >
          <div>
            <h3 className="font-semibold text-stone-950">LMIC calibration explanation</h3>
            <p className="mt-0.5 text-sm text-stone-500">Why the risk was adjusted from {pct(base)} → {pct(adj)}</p>
          </div>
          <span className="text-stone-400">{showExplanation ? "▲" : "▼"}</span>
        </button>
        {showExplanation && (
          <div className="border-t border-stone-100 p-5">
            <div className="flex flex-col gap-2">
              {aa.lmic_adjustment_explanation.map((line, i) => (
                <p key={i} className="text-sm text-stone-700">{line}</p>
              ))}
            </div>
            <div className="mt-4 flex flex-col gap-1">
              {aa.sources?.slice(0, 4).map((src, i) => (
                <p key={i} className="text-xs text-stone-400">[{i + 1}] {src}</p>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Macro signals */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-3xl border border-blue-200 bg-blue-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">Education projection</p>
          <p className="mt-2 text-sm leading-relaxed text-blue-900">{risk.macro_signals.education_projection}</p>
        </div>
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-600">Labor shift trend</p>
          <p className="mt-2 text-sm leading-relaxed text-amber-900">{risk.macro_signals.labor_shift_trend}</p>
        </div>
      </div>

      {/* Key drivers */}
      <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
        <h3 className="font-semibold text-stone-950">Key drivers</h3>
        <ol className="mt-3 flex flex-col gap-2">
          {risk.explainability.key_drivers.map((d, i) => (
            <li key={i} className="flex gap-3 text-sm text-stone-700">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-stone-950 text-xs text-white">{i + 1}</span>
              {d}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

// ─── Module 3 Panel ───────────────────────────────────────────────────────────

function Module3Panel({ opp, t }: { opp: Module3Analysis; t: (k: string) => string }) {
  const [oppTab, setOppTab] = useState<"direct" | "adjacent" | "micro_enterprise">("direct");
  const signals = opp.labor_market_context.key_economic_signals;

  const signalItems = [
    { label: "Wage floor", value: signals.wage_floor, source: "national minimum wage" },
    { label: "Sector employment", value: signals.sector_employment_share?.split("(")[0]?.trim() ?? "—", source: signals.sector_employment_share?.match(/\(([^)]+)\)/)?.[1] },
    { label: "Youth unemployment", value: signals.youth_unemployment_rate, source: "WDI ILO modeled" },
    { label: "NEET rate", value: signals.neet_rate?.split("—")[0]?.trim() ?? "—", source: "WDI SL.UEM.NEET.ZS" },
    { label: "GDP per capita", value: signals.gdp_per_capita, source: "World Bank WDI 2024" },
    { label: "Self-employed", value: signals.self_employed_share?.split("of")[0]?.trim() ?? "—", source: signals.self_employed_share?.includes("WDI") ? "WDI SL.EMP.SELF.ZS" : "ILOSTAT" },
    { label: "Digital infrastructure", value: signals.digital_infrastructure?.split("—")[0]?.trim() ?? "—", source: "ITU 2024" },
  ].filter((s) => s.value && s.value !== "Not available" && s.value !== "—");

  const tabs = [
    { id: "direct" as const, label: "Direct", count: opp.opportunities.direct.length },
    { id: "adjacent" as const, label: "Adjacent", count: opp.opportunities.adjacent.length },
    { id: "micro_enterprise" as const, label: "Micro / self-employment", count: opp.opportunities.micro_enterprise.length },
  ];

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        number="MODULE 03"
        title={t("opp.title")}
        subtitle={t("opp.subtitle")}
        providerBadge={opp._meta?.analysis_provider?.replace("openrouter/", "") ?? undefined}
      />

      {/* Economic Signals */}
      <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-stone-950">Real economic signals</h3>
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
            {signalItems.length} indicators · ILOSTAT + WDI + ITU
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {signalItems.map((s) => (
            <SignalCard key={s.label} label={s.label} value={s.value} source={s.source} />
          ))}
        </div>
        <p className="mt-3 text-xs text-stone-400">
          Country: {opp.labor_market_context.country} · Formality: {opp.labor_market_context.informality_level} ·
          Sources: World Bank WDI 2024, ILO ILOSTAT 2024, ITU 2024, {opp._meta?.data_sources?.wage_floor}
        </p>
      </div>

      {/* Opportunity tabs */}
      <div className="rounded-3xl border border-stone-200 bg-white shadow-sm">
        <div className="flex gap-0 overflow-x-auto border-b border-stone-100 p-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setOppTab(tab.id)}
              className={`flex-shrink-0 rounded-2xl px-4 py-2.5 text-sm font-medium transition ${
                oppTab === tab.id
                  ? "bg-stone-950 text-white"
                  : "text-stone-600 hover:bg-stone-100"
              }`}
            >
              {tab.label}
              <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs ${oppTab === tab.id ? "bg-white/20" : "bg-stone-100 text-stone-500"}`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {opp.opportunities[oppTab].map((o, i) => (
            <OpportunityCard
              key={i}
              title={o.title}
              iscoCode={o.isco_code}
              incomeRange={o.income_range}
              demandStrength={o.demand_strength}
              entryBarrier={o.entry_barrier}
              stability={o.stability}
              reason={o.reason}
              requiredUpskilling={o.required_upskilling}
            />
          ))}
        </div>
      </div>

      {/* Ranked opportunities */}
      <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
        <h3 className="font-semibold text-stone-950">Ranked by feasibility</h3>
        <p className="mt-1 text-sm text-stone-500">Ranked by skill match, local demand, and income stability — not prestige</p>
        <div className="mt-4 flex flex-col gap-3">
          {opp.ranking.map((r, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-950 text-xs font-bold text-white">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium text-stone-950">{r.opportunity}</p>
                  <span className="shrink-0 text-xs font-semibold text-stone-600">{r.score}</span>
                </div>
                <div className="mt-1 h-1.5 w-full rounded-full bg-stone-100">
                  <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${r.score * 100}%` }} />
                </div>
                <p className="mt-1 text-xs text-stone-500">{r.reason}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Policymaker view */}
      <div className="rounded-3xl border border-blue-200 bg-gradient-to-br from-blue-50 to-stone-50 p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white">Policymaker View</span>
          <span className="text-xs text-stone-500">Aggregate signals for programme officers and governments</span>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-blue-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">Labor gap identified</p>
            <p className="mt-2 text-sm leading-relaxed text-stone-800">{opp.policy_view.labor_gap_identified}</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-amber-600">Sector shortage signal</p>
            <p className="mt-2 text-sm leading-relaxed text-stone-800">{opp.policy_view.sector_shortage_signal}</p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600">Recommendation</p>
            <p className="mt-2 text-sm leading-relaxed text-stone-800">{opp.policy_view.recommendation_for_government_or_ngos}</p>
          </div>
        </div>
        <p className="mt-4 text-xs text-stone-400">
          Key drivers: {opp.explainability.key_drivers.join(" · ")}
        </p>
      </div>
    </div>
  );
}

// ─── Checklist component ─────────────────────────────────────────────────────

function Checklist({
  title, options, values, onToggle, totalCount, visibleCount, searchValue, onSearchChange,
}: {
  title: string; options: readonly string[]; values: string[]; onToggle: (v: string) => void;
  totalCount?: number; visibleCount?: number; searchValue?: string; onSearchChange?: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
        <span className="text-sm font-medium">{title}</span>
        {typeof totalCount === "number" && (
          <span className="text-xs text-stone-500">Showing {visibleCount ?? options.length} of {totalCount.toLocaleString()}</span>
        )}
      </div>
      {onSearchChange && (
        <input
          className="rounded-2xl border border-stone-300 px-4 py-2 text-sm outline-none focus:border-stone-950"
          placeholder={`Search ${title.toLowerCase()}...`}
          value={searchValue ?? ""}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      )}
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onToggle(o)}
            className={`rounded-full border px-3 py-1.5 text-sm ${values.includes(o) ? "border-emerald-700 bg-emerald-50 text-emerald-900" : "border-stone-200 bg-stone-50 text-stone-700"}`}
          >
            {o}
          </button>
        ))}
        {!options.length && <p className="text-sm text-stone-500">No options found.</p>}
      </div>
    </div>
  );
}

// ─── Profile panel ────────────────────────────────────────────────────────────

function ProfilePanel({ profile, t }: { profile: Module1Profile; t: (k: string) => string }) {
  function download() {
    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${profile.id.toLowerCase()}-skills-profile.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <aside className="flex flex-col gap-4 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-emerald-700">{t("profile.subtitle")}</p>
          <h2 className="mt-2 text-2xl font-semibold leading-tight">
            {profile.primary_occupation?.isco_title ?? profile.primary_occupation?.title ?? t("profile.occupation_unknown")}
          </h2>
          {profile.primary_occupation?.isco_title && profile.primary_occupation?.title !== profile.primary_occupation?.isco_title && (
            <p className="mt-0.5 text-sm text-stone-400">ESCO: {profile.primary_occupation.title}</p>
          )}
        </div>
        <span className="shrink-0 rounded-full bg-stone-950 px-3 py-1 text-sm font-medium text-white">
          {profile.confidence.level} confidence
        </span>
      </div>

      <div className="grid gap-2 print:hidden sm:grid-cols-2">
        <button type="button" onClick={download} className="rounded-2xl bg-stone-950 px-4 py-2.5 text-sm font-semibold text-white">
          {t("profile.download_json")}
        </button>
        <button type="button" onClick={() => window.print()} className="rounded-2xl border border-stone-300 px-4 py-2.5 text-sm font-semibold text-stone-950">
          {t("profile.print_pdf")}
        </button>
      </div>

      <p className="rounded-2xl bg-emerald-50 p-4 text-sm leading-relaxed text-emerald-950">{profile.human_summary}</p>

      <div className="grid gap-2 rounded-2xl border border-stone-200 p-4 text-sm">
        {[
          ["Profile ID", profile.id],
          ["ISCO-08", `${profile.primary_occupation?.isco_code ?? "—"} — ${profile.primary_occupation?.isco_title ?? "—"}`],
          ["ESCO code", profile.primary_occupation?.esco_code ?? "—"],
          ["Education", `${profile.education.local_label} → ISCED ${profile.education.isced}`],
          ["Match score", profile.primary_occupation?.score?.toFixed(3) ?? "—"],
        ].map(([label, value]) => (
          <div key={label} className="grid gap-1 sm:grid-cols-[130px_1fr]">
            <span className="font-medium text-stone-400">{label}</span>
            <span className="break-all text-stone-950">{value}</span>
          </div>
        ))}
        {profile.primary_occupation?.match_reason && (
          <div className="col-span-2 mt-1 rounded-xl bg-stone-50 p-2 text-xs text-stone-600">
            {profile.primary_occupation.match_reason}
          </div>
        )}
      </div>

      <div>
        <h3 className="font-semibold">{t("profile.mapped_skills")}</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {profile.skills.mapped.slice(0, 12).map((s) => (
            <span key={`${s.id}-${s.evidence_type}`} className="rounded-full bg-stone-100 px-3 py-1.5 text-sm text-stone-800">
              {s.plain_label}
            </span>
          ))}
          {profile.skills.mapped.length > 12 && (
            <span className="rounded-full bg-stone-100 px-3 py-1.5 text-sm text-stone-500">+{profile.skills.mapped.length - 12} more</span>
          )}
        </div>
      </div>

      {profile.skills.local_unmapped.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="font-semibold text-amber-950">{t("profile.local_skills")}</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {profile.skills.local_unmapped.map((s) => (
              <span key={s.id} className="rounded-full border border-amber-200 bg-white px-3 py-1.5 text-sm text-amber-900">{s.plain_label}</span>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-stone-50 p-4">
        <h3 className="font-semibold text-stone-900">{t("profile.honest_caveat")}</h3>
        <p className="mt-1 text-sm text-stone-600">{profile.confidence.caveat}</p>
      </div>

      <details className="rounded-2xl border border-stone-200 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-stone-700">Machine-readable JSON</summary>
        <pre className="mt-3 max-h-64 overflow-auto rounded-xl bg-stone-950 p-3 text-xs text-stone-100">
          {JSON.stringify(profile, null, 2)}
        </pre>
      </details>
    </aside>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const initialAnswers: Module1Answers = {
  country_code: "GH",
  city: "Accra",
  education: "upper_secondary",
  work_description: "",
  sector: "technical_services",
  experience_years: 3,
  employment_type: "self-employed",
  tools: [],
  selected_skills: [],
  languages: ["English"],
  aspiration: "",
  extra_skills: "",
};

export default function Home() {
  const [answers, setAnswers] = useState<Module1Answers>(() => {
    if (typeof window === "undefined") return initialAnswers;
    const saved = window.sessionStorage.getItem("m1_answers");
    return saved ? JSON.parse(saved) : initialAnswers;
  });

  const [phase, setPhase] = useState<Phase>("idle");
  const [profile, setProfile]         = useState<Module1Profile | null>(null);
  const [risk, setRisk]               = useState<Module2Analysis | null>(null);
  const [opportunities, setOpps]      = useState<Module3Analysis | null>(null);
  const [metadata, setMetadata]       = useState<Module1Metadata | null>(null);
  const [intakeOptions, setIntakeOpts] = useState<Module1IntakeOptions | null>(null);
  const [strings, setStrings]         = useState<Record<string, string>>(EN_FALLBACK);
  const [skillSearch, setSkillSearch] = useState("");
  const [toolSearch, setToolSearch]   = useState("");
  const [error, setError]             = useState("");

  const m2Ref = useRef<HTMLDivElement>(null);
  const m3Ref = useRef<HTMLDivElement>(null);

  const country = COUNTRIES[answers.country_code as CountryCode];

  const t = useCallback((key: string) => strings[key] ?? EN_FALLBACK[key] ?? key, [strings]);

  // Persist answers
  useEffect(() => {
    sessionStorage.setItem("m1_answers", JSON.stringify(answers));
  }, [answers]);

  // Load i18n when country changes
  useEffect(() => {
    getI18nStrings(country.locale).then((s) => {
      if (Object.keys(s).length > 0) setStrings(s);
      else setStrings(EN_FALLBACK);
    }).catch(() => setStrings(EN_FALLBACK));
  }, [country.locale]);

  // Load metadata + intake options
  useEffect(() => {
    getModule1Metadata().then(setMetadata).catch(() => null);
  }, []);

  useEffect(() => {
    getModule1IntakeOptions(answers.sector).then((opts) => {
      setIntakeOpts(opts);
      if (opts.selected_sector !== answers.sector) {
        setAnswers((a) => ({ ...a, sector: opts.selected_sector }));
      }
    }).catch(() => null);
  }, [answers.sector]);

  // Auto-chain: M1 done → run M2
  useEffect(() => {
    if (phase === "m1_done" && profile) {
      setPhase("m2_loading");
      setTimeout(() => m2Ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
      createModule2RiskAnalysis(profile, answers.country_code)
        .then((r) => { setRisk(r); setPhase("m2_done"); })
        .catch((e) => { console.error("M2 error:", e); setPhase("m2_done"); });
    }
  }, [phase, profile, answers.country_code]);

  // Auto-chain: M2 done → run M3
  useEffect(() => {
    if (phase === "m2_done" && profile) {
      setPhase("m3_loading");
      setTimeout(() => m3Ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
      matchOpportunities(profile, risk, answers.country_code)
        .then((o) => { setOpps(o); setPhase("m3_done"); })
        .catch((e) => { console.error("M3 error:", e); setPhase("m3_done"); });
    }
  }, [phase, profile, risk, answers.country_code]);

  function update<K extends keyof Module1Answers>(key: K, value: Module1Answers[K]) {
    setAnswers((a) => ({ ...a, [key]: value }));
  }

  async function generate() {
    setPhase("m1_loading");
    setError("");
    setProfile(null);
    setRisk(null);
    setOpps(null);
    try {
      const p = await createModule1Profile(answers);
      setProfile(p);
      setPhase("m1_done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate profile");
      setPhase("idle");
    }
  }

  const skillOptions = useMemo(() => {
    const q = skillSearch.trim().toLowerCase();
    const opts = intakeOptions?.skills ?? [];
    return (q ? opts.filter((o) => o.label.toLowerCase().includes(q)) : opts).slice(0, 120);
  }, [intakeOptions, skillSearch]);

  const toolOptions = useMemo(() => {
    const q = toolSearch.trim().toLowerCase();
    const opts = intakeOptions?.tools ?? [];
    return (q ? opts.filter((o) => o.label.toLowerCase().includes(q)) : opts).slice(0, 80);
  }, [intakeOptions, toolSearch]);

  const completion = useMemo(() => {
    const fields = [answers.country_code, answers.city, answers.education, answers.work_description, answers.sector];
    return Math.round((fields.filter(Boolean).length / fields.length) * 100);
  }, [answers]);

  const phaseStep = phase === "idle" || phase === "m1_loading" ? 1
    : phase === "m1_done" || phase === "m2_loading" ? 2
    : phase === "m2_done" || phase === "m3_loading" ? 3
    : 4;

  return (
    <main className="min-h-screen bg-stone-50 text-stone-950">
      {/* ─── Sticky header ─── */}
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-stone-950 text-white shadow-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3 lg:px-8">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold tracking-tight">UNMAPPED</h1>
            <div className="hidden items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 sm:flex">
              {[
                { step: 1, label: t("nav.module1") },
                { step: 2, label: t("nav.module2") },
                { step: 3, label: t("nav.module3") },
              ].map(({ step, label }) => (
                <span
                  key={step}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    phaseStep >= step + 1 ? "bg-emerald-600 text-white"
                      : phaseStep === step ? "bg-white text-stone-950"
                      : "text-stone-400"
                  }`}
                >
                  M0{step} {label}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-stone-400">{t("country.switch_label")}</label>
            <select
              className="rounded-xl bg-white/10 px-3 py-1.5 text-sm font-medium text-white outline-none"
              value={answers.country_code}
              onChange={(e) => {
                const code = e.target.value as CountryCode;
                setAnswers((a) => ({
                  ...a,
                  country_code: code,
                  city: COUNTRIES[code].city,
                  education: COUNTRIES[code].education[2][0],
                  languages: [COUNTRIES[code].languages[0]],
                }));
                setProfile(null); setRisk(null); setOpps(null); setPhase("idle");
              }}
            >
              <option value="GH">🇬🇭 Ghana</option>
              <option value="BD">🇧🇩 Bangladesh</option>
            </select>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col gap-10 px-5 py-8 lg:px-8">

        {/* ─── Module 01 ─── */}
        <section>
          <div className="mb-6 rounded-3xl bg-stone-950 p-6 text-white">
            <p className="text-sm uppercase tracking-[0.3em] text-emerald-300">MODULE 01</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">{t("intake.welcome")}</h2>
            <p className="mt-2 max-w-2xl text-sm text-stone-300">{t("intake.subtitle")}</p>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
            {/* Intake form */}
            <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-lg font-semibold">Intake form</h3>
                <div className="text-right">
                  <p className="text-xs font-medium text-stone-500">{completion}% ready</p>
                  <div className="mt-1 h-1.5 w-24 rounded-full bg-stone-200">
                    <div className="h-1.5 rounded-full bg-emerald-500 transition-all" style={{ width: `${completion}%` }} />
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">{t("intake.city_label")}</span>
                  <input
                    className="rounded-2xl border border-stone-300 px-4 py-2.5 outline-none focus:border-stone-950"
                    value={answers.city}
                    onChange={(e) => update("city", e.target.value)}
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">{t("intake.education_label")}</span>
                  <select
                    className="rounded-2xl border border-stone-300 px-4 py-2.5 outline-none focus:border-stone-950"
                    value={answers.education}
                    onChange={(e) => update("education", e.target.value)}
                  >
                    {country.education.map(([id, label]) => (
                      <option key={id} value={id}>{label}</option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">{t("intake.work_label")}</span>
                  <textarea
                    className="min-h-24 rounded-2xl border border-stone-300 px-4 py-2.5 outline-none focus:border-stone-950"
                    placeholder={t("intake.work_placeholder")}
                    value={answers.work_description}
                    onChange={(e) => update("work_description", e.target.value)}
                  />
                </label>

                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">Closest sector</span>
                  <div className="grid grid-cols-2 gap-2">
                    {(intakeOptions?.sectors ?? []).map((sec) => (
                      <button
                        key={sec.id}
                        type="button"
                        onClick={() => update("sector", sec.id)}
                        className={`rounded-2xl border px-3 py-2 text-left text-sm transition ${
                          answers.sector === sec.id ? "border-stone-950 bg-stone-950 text-white" : "border-stone-200 bg-stone-50 text-stone-700"
                        }`}
                      >
                        {sec.label}
                        <span className="mt-0.5 block text-xs opacity-60">{sec.occupation_count.toLocaleString()} occupations</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium">Years of experience</span>
                    <input type="number" min={0} max={40}
                      className="rounded-2xl border border-stone-300 px-4 py-2.5 outline-none focus:border-stone-950"
                      value={answers.experience_years}
                      onChange={(e) => update("experience_years", Number(e.target.value))}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium">Work type</span>
                    <select
                      className="rounded-2xl border border-stone-300 px-4 py-2.5 outline-none focus:border-stone-950"
                      value={answers.employment_type}
                      onChange={(e) => update("employment_type", e.target.value)}
                    >
                      <option>{t("work_type.self_employed")}</option>
                      <option>{t("work_type.employed")}</option>
                      <option>{t("work_type.both")}</option>
                      <option>{t("work_type.family")}</option>
                    </select>
                  </label>
                </div>

                <Checklist
                  title="Tools and technologies"
                  options={toolOptions.map((o) => o.label)}
                  values={answers.tools}
                  onToggle={(v) => update("tools", toggleValue(answers.tools, v))}
                  totalCount={intakeOptions?.total_tools_for_sector}
                  visibleCount={toolOptions.length}
                  searchValue={toolSearch}
                  onSearchChange={setToolSearch}
                />
                <Checklist
                  title={t("intake.skills_label")}
                  options={skillOptions.map((o) => o.label)}
                  values={answers.selected_skills}
                  onToggle={(v) => update("selected_skills", toggleValue(answers.selected_skills, v))}
                  totalCount={intakeOptions?.total_skills_for_sector}
                  visibleCount={skillOptions.length}
                  searchValue={skillSearch}
                  onSearchChange={setSkillSearch}
                />
                <Checklist
                  title={t("intake.languages_label")}
                  options={country.languages}
                  values={answers.languages}
                  onToggle={(v) => update("languages", toggleValue(answers.languages, v))}
                />

                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">{t("intake.extra_skills_label")}</span>
                  <input
                    className="rounded-2xl border border-stone-300 px-4 py-2.5 outline-none focus:border-stone-950"
                    placeholder={t("intake.extra_skills_placeholder")}
                    value={answers.extra_skills}
                    onChange={(e) => update("extra_skills", e.target.value)}
                  />
                </label>

                <button
                  type="button"
                  disabled={phase === "m1_loading" || !answers.work_description}
                  onClick={generate}
                  className="rounded-2xl bg-emerald-600 py-3.5 font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-stone-300"
                >
                  {phase === "m1_loading" ? t("intake.submitting") : t("intake.submit")}
                </button>

                {error && <p className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
              </div>
            </div>

            {/* Profile output */}
            {phase === "m1_loading" && (
              <div className="flex items-center justify-center rounded-3xl border border-dashed border-stone-300 bg-white p-8">
                <div className="text-center">
                  <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-stone-200 border-t-emerald-500" />
                  <p className="mt-4 font-medium text-stone-700">Extracting skills via LLM...</p>
                  <p className="mt-1 text-sm text-stone-500">Matching to ESCO/ISCO taxonomy</p>
                </div>
              </div>
            )}
            {profile && <ProfilePanel profile={profile} t={t} />}
            {!profile && phase === "idle" && (
              <aside className="flex items-center justify-center rounded-3xl border border-dashed border-stone-300 bg-white p-8 text-center text-stone-500">
                <div>
                  <p className="text-lg font-semibold text-stone-700">Profile output</p>
                  <p className="mt-2 text-sm">Fill in the form and click Generate. Your portable ESCO/ISCO skills profile will appear here.</p>
                  <div className="mt-4 rounded-2xl bg-stone-100 p-3 text-xs text-stone-500">
                    ISCO + ESCO + O*NET · LLM extraction · Deterministic scoring · Explainable output
                  </div>
                </div>
              </aside>
            )}
          </div>
        </section>

        {/* ─── Module 02 ─── */}
        <section ref={m2Ref}>
          {phase === "m2_loading" && (
            <LoadingCard message="Running Module 2: Automation risk analysis..." />
          )}
          {risk && (phase === "m2_done" || phase === "m3_loading" || phase === "m3_done") && (
            <Module2Panel risk={risk} t={t} />
          )}
        </section>

        {/* ─── Module 03 ─── */}
        <section ref={m3Ref}>
          {phase === "m3_loading" && (
            <LoadingCard message="Running Module 3: Opportunity matching..." />
          )}
          {opportunities && phase === "m3_done" && (
            <Module3Panel opp={opportunities} t={t} />
          )}
        </section>

        {/* ─── Data transparency ─── */}
        {metadata && (
          <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm print:hidden">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-emerald-700">Generated data layer</p>
                <h2 className="mt-1 text-xl font-semibold">Data transparency</h2>
                <p className="mt-1 max-w-2xl text-sm text-stone-500">{metadata.note}</p>
              </div>
              <p className="text-xs text-stone-400">Generated: {new Date(metadata.generated_at).toLocaleString()}</p>
            </div>
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
            <details className="mt-4 rounded-2xl border border-stone-200 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-stone-700">Source files and hashes</summary>
              <div className="mt-3 grid gap-3">
                {metadata.sources.map((src) => (
                  <div key={src.id} className="rounded-2xl bg-stone-50 p-4">
                    <p className="font-medium text-stone-950">{src.label}</p>
                    <p className="text-xs text-stone-500">{src.type} · {src.files.length} files</p>
                    <div className="mt-2 flex flex-col gap-1">
                      {src.files.slice(0, 3).map((f) => (
                        <p key={f.sha256} className="break-all rounded-xl bg-white px-3 py-1.5 text-xs text-stone-500">
                          <span className="font-medium text-stone-800">{f.name}</span> · {f.sha256.slice(0, 16)}…
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          </section>
        )}
      </div>
    </main>
  );
}
