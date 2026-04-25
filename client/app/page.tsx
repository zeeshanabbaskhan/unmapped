"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createModule1Profile,
  getModule1IntakeOptions,
  getModule1Metadata,
  Module1Answers,
  Module1IntakeOptions,
  Module1Metadata,
  Module1Profile,
} from "@/lib/api";

const countries = {
  GH: {
    label: "Ghana",
    city: "Accra",
    languages: ["English", "Twi", "Ga", "Hausa", "Ewe"],
    education: [
      ["none", "No formal education"],
      ["jhs", "Basic / JHS"],
      ["wassce", "SHS / WASSCE"],
      ["tvet", "TVET certificate"],
      ["tertiary", "Tertiary / university"],
    ],
  },
  BD: {
    label: "Bangladesh",
    city: "Dhaka",
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

const initialAnswers: Module1Answers = {
  country_code: "GH",
  city: "Accra",
  education: "wassce",
  work_description: "",
  sector: "technical_services",
  experience_years: 3,
  employment_type: "self-employed",
  tools: ["mobile phone", "small repair tools"],
  selected_skills: ["repair phones or devices", "talk to customers"],
  languages: ["English"],
  aspiration: "more of the same, but better paid",
  extra_skills: "",
};

function toggleValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export default function Home() {
  const [answers, setAnswers] = useState<Module1Answers>(() => {
    if (typeof window === "undefined") return initialAnswers;
    const saved = window.sessionStorage.getItem("module1_answers");
    return saved ? JSON.parse(saved) : initialAnswers;
  });
  const [profile, setProfile] = useState<Module1Profile | null>(null);
  const [metadata, setMetadata] = useState<Module1Metadata | null>(null);
  const [intakeOptions, setIntakeOptions] = useState<Module1IntakeOptions | null>(null);
  const [skillSearch, setSkillSearch] = useState("");
  const [toolSearch, setToolSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const country = countries[answers.country_code];
  const completion = useMemo(() => {
    const required = [answers.country_code, answers.city, answers.education, answers.work_description, answers.sector];
    return Math.round((required.filter(Boolean).length / required.length) * 100);
  }, [answers]);

  useEffect(() => {
    sessionStorage.setItem("module1_answers", JSON.stringify(answers));
  }, [answers]);

  useEffect(() => {
    getModule1Metadata()
      .then(setMetadata)
      .catch(() => setMetadata(null));
  }, []);

  useEffect(() => {
    getModule1IntakeOptions(answers.sector)
      .then((options) => {
        setIntakeOptions(options);
        if (options.selected_sector !== answers.sector) {
          setAnswers((current) => ({ ...current, sector: options.selected_sector }));
        }
      })
      .catch(() => setIntakeOptions(null));
  }, [answers.sector]);

  const skillOptions = useMemo(() => {
    const query = skillSearch.trim().toLowerCase();
    const options = intakeOptions?.skills ?? [];
    return (query ? options.filter((option) => option.label.toLowerCase().includes(query)) : options).slice(0, 120);
  }, [intakeOptions, skillSearch]);

  const toolOptions = useMemo(() => {
    const query = toolSearch.trim().toLowerCase();
    const options = intakeOptions?.tools ?? [];
    return (query ? options.filter((option) => option.label.toLowerCase().includes(query)) : options).slice(0, 80);
  }, [intakeOptions, toolSearch]);

  function updateAnswer<K extends keyof Module1Answers>(key: K, value: Module1Answers[K]) {
    setAnswers((current) => ({ ...current, [key]: value }));
  }

  async function submit() {
    setLoading(true);
    setError("");
    setProfile(null);
    try {
      setProfile(await createModule1Profile(answers));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate profile");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-stone-50 text-stone-950">
      <section className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-6 lg:px-8">
        <header className="flex flex-col justify-between gap-4 rounded-3xl bg-stone-950 p-6 text-white shadow-sm md:flex-row md:items-center">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-emerald-300">Module 01</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-5xl">Skills Signal Engine</h1>
            <p className="mt-3 max-w-3xl text-stone-300">
              Converts informal work experience into a portable, confidence-scored ESCO/ISCO skills profile.
            </p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
            <label className="text-xs uppercase tracking-[0.2em] text-stone-300">Viewing context</label>
            <select
              className="mt-2 w-full rounded-xl bg-white px-3 py-2 text-stone-950"
              value={answers.country_code}
              onChange={(event) => {
                const code = event.target.value as "GH" | "BD";
                setAnswers((current) => ({
                  ...current,
                  country_code: code,
                  city: countries[code].city,
                  education: countries[code].education[2][0],
                  languages: [countries[code].languages[0]],
                }));
              }}
            >
              <option value="GH">Ghana</option>
              <option value="BD">Bangladesh</option>
            </select>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold">Intake</h2>
                <p className="mt-1 text-sm text-stone-600">
                  Session-only by default. Progress is saved in this tab, not as a permanent account.
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium">{completion}% ready</p>
                <div className="mt-2 h-2 w-28 rounded-full bg-stone-200">
                  <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${completion}%` }} />
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-5">
              <label className="grid gap-2">
                <span className="text-sm font-medium">City or region</span>
                <input
                  className="rounded-2xl border border-stone-300 px-4 py-3 outline-none focus:border-stone-950"
                  value={answers.city}
                  onChange={(event) => updateAnswer("city", event.target.value)}
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium">Education level in {country.label}</span>
                <select
                  className="rounded-2xl border border-stone-300 px-4 py-3 outline-none focus:border-stone-950"
                  value={answers.education}
                  onChange={(event) => updateAnswer("education", event.target.value)}
                >
                  {country.education.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium">Describe your work in your own words</span>
                <textarea
                  className="min-h-28 rounded-2xl border border-stone-300 px-4 py-3 outline-none focus:border-stone-950"
                  placeholder="Example: I repair phones, replace screens, buy parts, and explain problems to customers."
                  value={answers.work_description}
                  onChange={(event) => updateAnswer("work_description", event.target.value)}
                />
              </label>

              <div className="grid gap-2">
                <span className="text-sm font-medium">Closest sector</span>
                <div className="grid grid-cols-2 gap-2">
                  {(intakeOptions?.sectors ?? []).map((sector) => (
                    <button
                      key={sector.id}
                      type="button"
                      className={`rounded-2xl border px-3 py-2 text-left text-sm ${
                        answers.sector === sector.id ? "border-stone-950 bg-stone-950 text-white" : "border-stone-200 bg-stone-50"
                      }`}
                      onClick={() => updateAnswer("sector", sector.id)}
                    >
                      {sector.label}
                      <span className="mt-1 block text-xs opacity-70">{sector.occupation_count.toLocaleString()} occupations</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-medium">Years of experience</span>
                  <input
                    className="rounded-2xl border border-stone-300 px-4 py-3 outline-none focus:border-stone-950"
                    min={0}
                    max={40}
                    type="number"
                    value={answers.experience_years}
                    onChange={(event) => updateAnswer("experience_years", Number(event.target.value))}
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-medium">Work type</span>
                  <select
                    className="rounded-2xl border border-stone-300 px-4 py-3 outline-none focus:border-stone-950"
                    value={answers.employment_type}
                    onChange={(event) => updateAnswer("employment_type", event.target.value)}
                  >
                    <option>self-employed</option>
                    <option>employed by someone else</option>
                    <option>both employed and self-employed</option>
                    <option>family or informal helper</option>
                  </select>
                </label>
              </div>

              <Checklist
                title="Tools and technologies"
                options={toolOptions.map((option) => option.label)}
                values={answers.tools}
                onToggle={(value) => updateAnswer("tools", toggleValue(answers.tools, value))}
                totalCount={intakeOptions?.total_tools_for_sector}
                visibleCount={toolOptions.length}
                searchValue={toolSearch}
                onSearchChange={setToolSearch}
              />

              <Checklist
                title="Skills you use"
                options={skillOptions.map((option) => option.label)}
                values={answers.selected_skills}
                onToggle={(value) => updateAnswer("selected_skills", toggleValue(answers.selected_skills, value))}
                totalCount={intakeOptions?.total_skills_for_sector}
                visibleCount={skillOptions.length}
                searchValue={skillSearch}
                onSearchChange={setSkillSearch}
              />

              <Checklist
                title="Languages"
                options={country.languages}
                values={answers.languages}
                onToggle={(value) => updateAnswer("languages", toggleValue(answers.languages, value))}
              />

              <label className="grid gap-2">
                <span className="text-sm font-medium">Extra local skills the formal system may miss</span>
                <input
                  className="rounded-2xl border border-stone-300 px-4 py-3 outline-none focus:border-stone-950"
                  placeholder="Example: I use mobile money, negotiate with suppliers, and train apprentices."
                  value={answers.extra_skills}
                  onChange={(event) => updateAnswer("extra_skills", event.target.value)}
                />
              </label>

              <button
                className="rounded-2xl bg-emerald-600 px-5 py-4 font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-stone-400"
                type="button"
                disabled={loading || !answers.work_description}
                onClick={submit}
              >
                {loading ? "Generating profile..." : "Generate portable skills profile"}
              </button>

              {error ? <p className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</p> : null}
            </div>
          </section>

          <ProfilePanel profile={profile} />
        </div>

        <DataTransparencyPanel metadata={metadata} />
      </section>
    </main>
  );
}

function Checklist({
  title,
  options,
  values,
  onToggle,
  totalCount,
  visibleCount,
  searchValue,
  onSearchChange,
}: {
  title: string;
  options: readonly string[];
  values: string[];
  onToggle: (value: string) => void;
  totalCount?: number;
  visibleCount?: number;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <span className="text-sm font-medium">{title}</span>
        {typeof totalCount === "number" ? (
          <span className="text-xs text-stone-500">
            Showing {visibleCount ?? options.length} of {totalCount.toLocaleString()} generated options
          </span>
        ) : null}
      </div>
      {onSearchChange ? (
        <input
          className="rounded-2xl border border-stone-300 px-4 py-2 text-sm outline-none focus:border-stone-950"
          placeholder={`Search ${title.toLowerCase()}...`}
          value={searchValue ?? ""}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      ) : null}
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={`rounded-full border px-3 py-2 text-sm ${
              values.includes(option) ? "border-emerald-700 bg-emerald-50 text-emerald-900" : "border-stone-200 bg-stone-50"
            }`}
            onClick={() => onToggle(option)}
          >
            {option}
          </button>
        ))}
        {!options.length ? <p className="text-sm text-stone-500">No generated options found for this search.</p> : null}
      </div>
    </div>
  );
}

function ProfilePanel({ profile }: { profile: Module1Profile | null }) {
  if (!profile) {
    return (
      <aside className="rounded-3xl border border-dashed border-stone-300 bg-white p-6 text-stone-600">
        <h2 className="text-2xl font-semibold text-stone-950">Profile output</h2>
        <p className="mt-3">
          Generated profiles will appear here as both a human-readable summary and machine-readable evidence.
        </p>
        <div className="mt-6 rounded-2xl bg-stone-100 p-4 text-sm">
          The final match is deterministic and auditable. AI helps interpret language, but ESCO/ISCO scoring decides the profile.
        </div>
      </aside>
    );
  }

  const generatedProfile = profile;

  function downloadProfileJson() {
    const blob = new Blob([JSON.stringify(generatedProfile, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${generatedProfile.id.toLowerCase()}-skills-profile.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <aside className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-emerald-700">Portable profile</p>
          <h2 className="mt-2 text-3xl font-semibold">{profile.primary_occupation?.title ?? "Uncertain occupation"}</h2>
        </div>
        <span className="rounded-full bg-stone-950 px-3 py-1 text-sm font-medium text-white">
          {profile.confidence.level} confidence
        </span>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2 print:hidden">
        <button
          type="button"
          className="rounded-2xl bg-stone-950 px-4 py-3 text-sm font-semibold text-white"
          onClick={downloadProfileJson}
        >
          Download profile JSON
        </button>
        <button
          type="button"
          className="rounded-2xl border border-stone-300 px-4 py-3 text-sm font-semibold text-stone-950"
          onClick={() => window.print()}
        >
          Print / save as PDF
        </button>
      </div>

      <p className="mt-5 rounded-2xl bg-emerald-50 p-4 text-emerald-950">{profile.human_summary}</p>

      <div className="mt-5 grid gap-3 rounded-2xl border border-stone-200 p-4 text-sm">
        <DataRow label="Profile ID" value={profile.id} />
        <DataRow label="ISCO-08" value={`${profile.primary_occupation?.isco_code ?? "unknown"} - ${profile.primary_occupation?.isco_title ?? "unknown"}`} />
        <DataRow label="ESCO code" value={profile.primary_occupation?.esco_code ?? "unknown"} />
        <DataRow label="Education mapping" value={`${profile.education.local_label} -> ISCED ${profile.education.isced}`} />
      </div>

      <section className="mt-6">
        <h3 className="font-semibold">Mapped skills</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {profile.skills.mapped.slice(0, 12).map((skill) => (
            <span key={`${skill.id}-${skill.evidence_type}`} className="rounded-full bg-stone-100 px-3 py-2 text-sm">
              {skill.plain_label}
            </span>
          ))}
        </div>
      </section>

      {profile.skills.local_unmapped.length ? (
        <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="font-semibold text-amber-950">Local skills not fully captured by ESCO</h3>
          <div className="mt-3 grid gap-2">
            {profile.skills.local_unmapped.map((skill) => (
              <p key={skill.id} className="text-sm text-amber-950">
                {skill.plain_label}
              </p>
            ))}
          </div>
        </section>
      ) : null}

      {profile.task_enrichment.onet_links.length || profile.task_enrichment.matched_evidence.length ? (
        <section className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <h3 className="font-semibold text-blue-950">O*NET task evidence</h3>
          <p className="mt-2 text-sm text-blue-900">{profile.task_enrichment.note}</p>
          <div className="mt-3 grid gap-2">
            {profile.task_enrichment.onet_links.slice(0, 2).map((link) => (
              <p key={link.soc_code} className="text-sm text-blue-950">
                Linked task source: {link.title} ({link.soc_code}) · score {link.link_score}
              </p>
            ))}
            {profile.task_enrichment.matched_evidence.slice(0, 4).map((evidence) => (
              <p key={`${evidence.type}-${evidence.soc_code}-${evidence.label}`} className="rounded-xl bg-white/70 px-3 py-2 text-sm text-blue-950">
                <span className="font-medium">{evidence.type}:</span> {evidence.label}
              </p>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-6 rounded-2xl bg-stone-50 p-4">
        <h3 className="font-semibold">Honest caveat</h3>
        <p className="mt-2 text-sm text-stone-700">{profile.confidence.caveat}</p>
      </section>

      <section className="mt-6">
        <h3 className="font-semibold">Data sources</h3>
        <div className="mt-3 grid gap-2">
          {profile.sources.map((source) => (
            <p key={source.id} className="rounded-xl border border-stone-200 px-3 py-2 text-sm text-stone-700">
              <span className="font-medium text-stone-950">{source.label}</span> - {source.type}
              {source.files?.length ? ` (${source.files.length} source files hashed)` : ""}
            </p>
          ))}
        </div>
      </section>

      <details className="mt-6 rounded-2xl border border-stone-200 p-4">
        <summary className="cursor-pointer font-semibold">Machine-readable profile</summary>
        <pre className="mt-4 max-h-80 overflow-auto rounded-xl bg-stone-950 p-4 text-xs text-stone-100">
          {JSON.stringify(profile, null, 2)}
        </pre>
      </details>
    </aside>
  );
}

function DataTransparencyPanel({ metadata }: { metadata: Module1Metadata | null }) {
  if (!metadata) {
    return (
      <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm print:hidden">
        <h2 className="text-2xl font-semibold">Data transparency</h2>
        <p className="mt-2 text-sm text-stone-600">Start the Node API to load generated dataset provenance.</p>
      </section>
    );
  }

  const stats = [
    ["Occupations", metadata.stats.occupations],
    ["Skills", metadata.stats.all_skills],
    ["Occupation-skill relations", metadata.stats.occupation_skill_relations],
    ["ISCO groups", metadata.stats.isco_groups],
    ["O*NET occupations", metadata.stats.onet_occupations],
    ["O*NET-enriched ESCO occupations", metadata.stats.occupations_with_onet_enrichment],
  ];

  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm print:hidden">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-emerald-700">Generated data layer</p>
          <h2 className="mt-2 text-2xl font-semibold">Data transparency</h2>
          <p className="mt-2 max-w-3xl text-sm text-stone-600">{metadata.note}</p>
        </div>
        <p className="text-sm text-stone-500">Generated: {new Date(metadata.generated_at).toLocaleString()}</p>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-stone-50 p-4">
            <p className="text-2xl font-semibold text-stone-950">{Number(value).toLocaleString()}</p>
            <p className="mt-1 text-sm text-stone-600">{label}</p>
          </div>
        ))}
      </div>

      <details className="mt-5 rounded-2xl border border-stone-200 p-4">
        <summary className="cursor-pointer font-semibold">Source files and hashes</summary>
        <div className="mt-4 grid gap-3">
          {metadata.sources.map((source) => (
            <div key={source.id} className="rounded-2xl bg-stone-50 p-4">
              <p className="font-medium">{source.label}</p>
              <p className="text-sm text-stone-600">{source.type} · {source.files.length} files</p>
              <div className="mt-3 grid gap-2">
                {source.files.slice(0, 6).map((file) => (
                  <p key={file.sha256} className="break-all rounded-xl bg-white px-3 py-2 text-xs text-stone-600">
                    <span className="font-medium text-stone-950">{file.name}</span> · {file.role} · {file.sha256.slice(0, 16)}...
                  </p>
                ))}
                {source.files.length > 6 ? (
                  <p className="text-xs text-stone-500">+ {source.files.length - 6} more files in generated manifest</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[140px_1fr]">
      <span className="font-medium text-stone-500">{label}</span>
      <span className="text-stone-950">{value}</span>
    </div>
  );
}
