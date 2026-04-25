import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import xlsx from "xlsx";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ESCO_DIR = join(ROOT, "data", "tabiya-esco-v1.1.1", "csv");
const ONET_DIR = join(ROOT, "data", "db_30_2_excel");
const CROSSWALK_DIR = join(ROOT, "data", "onetsoc_to_isco_cws_ibs");
const OUTPUT_DIR = join(ROOT, "data", "processed");

const INPUT_FILES = {
  iscoGroups: join(ESCO_DIR, "ISCOGroups.csv"),
  occupations: join(ESCO_DIR, "occupations.csv"),
  occupationSkillRelations: join(ESCO_DIR, "occupation_skill_relations.csv"),
  skills: join(ESCO_DIR, "skills.csv"),
  skillGroups: join(ESCO_DIR, "skillGroups.csv"),
  skillSkillRelations: join(ESCO_DIR, "skill_skill_relations.csv"),
  skillsHierarchy: join(ESCO_DIR, "skills_hierarchy.csv"),
  occupationsHierarchy: join(ESCO_DIR, "occupations_hierarchy.csv"),
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

function readCsv(path) {
  const text = readFileSync(path, "utf-8").replace(/^\uFEFF/, "");
  const [header, ...rows] = parseCsv(text);
  return rows.map((row) => Object.fromEntries(header.map((name, index) => [name, row[index] ?? ""])));
}

function splitList(value) {
  return value ? value.split("\n").map((item) => item.trim()).filter(Boolean) : [];
}

function normalizeText(...parts) {
  return parts.filter(Boolean).join(" ").toLowerCase().replace(/\s+/g, " ").trim();
}

const STOP_WORDS = new Set([
  "and",
  "are",
  "for",
  "from",
  "into",
  "the",
  "their",
  "this",
  "that",
  "with",
  "work",
  "worker",
  "workers",
  "technician",
  "technicians",
  "operator",
  "operators",
  "specialist",
  "specialists",
]);

const TOKEN_SYNONYMS = new Map([
  ["phones", "phone"],
  ["cellular", "mobile"],
  ["cell", "mobile"],
  ["repairers", "repair"],
  ["repairer", "repair"],
  ["repairing", "repair"],
  ["installers", "install"],
  ["installer", "install"],
  ["servicers", "service"],
  ["servicer", "service"],
  ["computers", "computer"],
  ["electronics", "electronic"],
]);

function tokenize(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9\s/-]/g, " ")
    .split(/\s+/)
    .map((token) => TOKEN_SYNONYMS.get(token) ?? token)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function tokenSet(value) {
  return new Set(tokenize(value));
}

function jaccard(left, right) {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  return intersection / (left.size + right.size - intersection);
}

function readXlsx(path) {
  const workbook = xlsx.readFile(path);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return xlsx.utils.sheet_to_json(sheet, { defval: "" });
}

function inferSectorFromIsco(iscoCode) {
  const code = String(iscoCode || "");
  if (/^(21|25|31|35|74)/.test(code)) return "technical_services";
  if (/^(52|53|14)/.test(code)) return "retail_trade";
  if (/^(71|72|73|81|82|83)/.test(code)) return "construction_manufacturing_transport";
  if (/^(75)/.test(code)) return "garments_craft";
  if (/^(61|62|63|92)/.test(code)) return "agriculture";
  if (/^(51|94)/.test(code)) return "food_hospitality";
  if (/^(91|96)/.test(code)) return "personal_services";
  if (/^(22|23|24|26|32|33|34|41|42|43|44)/.test(code)) return "professional_services";
  return "other";
}

function plainLabel(label) {
  const replacements = new Map([
    ["maintain", "keep"],
    ["perform", "do"],
    ["operate", "use"],
    ["provide", "give"],
    ["apply", "use"],
    ["utilise", "use"],
    ["utilize", "use"],
  ]);
  const words = String(label || "").trim().split(/\s+/);
  if (!words.length || !words[0]) return "";
  const replacement = replacements.get(words[0].toLowerCase());
  if (replacement) words[0] = replacement;
  const result = words.join(" ");
  return result.slice(0, 1).toUpperCase() + result.slice(1);
}

function fileManifest(path, role) {
  const contents = readFileSync(path);
  const stats = statSync(path);
  return {
    file: relative(ROOT, path).replaceAll("\\", "/"),
    name: basename(path),
    role,
    bytes: stats.size,
    sha256: createHash("sha256").update(contents).digest("hex"),
  };
}

function buildSourceRegistry() {
  const files = [
    ...Object.entries(INPUT_FILES).map(([role, path]) => fileManifest(path, role)),
    fileManifest(join(ONET_DIR, "Abilities.xlsx"), "onet_abilities"),
    fileManifest(join(ONET_DIR, "Skills.xlsx"), "onet_skills"),
    fileManifest(join(ONET_DIR, "Work Activities.xlsx"), "onet_work_activities"),
    fileManifest(join(ONET_DIR, "Work Context.xlsx"), "onet_work_context"),
    fileManifest(join(ONET_DIR, "Task Statements.xlsx"), "onet_task_statements"),
    fileManifest(join(ONET_DIR, "Technology Skills.xlsx"), "onet_technology_skills"),
    fileManifest(join(ONET_DIR, "Tools Used.xlsx"), "onet_tools_used"),
    fileManifest(join(CROSSWALK_DIR, "soc10_isco08.dta"), "soc10_isco08_crosswalk"),
  ];

  return {
    version: "source-registry-generated-v1",
    generated_at: new Date().toISOString(),
    note: "Generated from files present in data/. Do not hand-edit.",
    sources: [
      {
        id: "tabiya_esco_1_1_1",
        label: "Tabiya ESCO v1.1.1",
        type: "taxonomy",
        files: files.filter((file) => file.file.includes("tabiya-esco-v1.1.1")),
      },
      {
        id: "onet_30_2",
        label: "O*NET 30.2 Database",
        type: "task_enrichment",
        files: files.filter((file) => file.file.includes("db_30_2_excel")),
      },
      {
        id: "onetsoc_isco_crosswalks",
        label: "O*NET/SOC to ISCO crosswalks",
        type: "crosswalk",
        files: files.filter((file) => file.file.includes("onetsoc_to_isco_cws_ibs")),
      },
    ],
  };
}

function groupBySoc(rows, mapper) {
  const grouped = {};
  for (const row of rows) {
    const soc = String(row["O*NET-SOC Code"] ?? "").trim();
    if (!soc) continue;
    grouped[soc] ??= [];
    const mapped = mapper(row);
    if (mapped) grouped[soc].push(mapped);
  }
  return grouped;
}

function buildOnetIndexes() {
  const onetOccupations = {};
  const occupationRows = readXlsx(join(ONET_DIR, "Occupation Data.xlsx"));
  for (const row of occupationRows) {
    const soc = String(row["O*NET-SOC Code"] ?? "").trim();
    if (!soc) continue;
    const title = String(row.Title ?? "").trim();
    const description = String(row.Description ?? "").trim();
    onetOccupations[soc] = {
      soc_code: soc,
      title,
      description,
      search_text: normalizeText(title, description),
      search_tokens: tokenSet(`${title} ${description}`),
    };
  }

  const tasksBySoc = groupBySoc(readXlsx(join(ONET_DIR, "Task Statements.xlsx")), (row) => ({
    task_id: String(row["Task ID"] ?? ""),
    task: String(row.Task ?? "").trim(),
    type: String(row["Task Type"] ?? "").trim(),
    source: String(row["Domain Source"] ?? "").trim(),
  }));

  const toolsBySoc = groupBySoc(readXlsx(join(ONET_DIR, "Tools Used.xlsx")), (row) => ({
    example: String(row.Example ?? "").trim(),
    commodity_title: String(row["Commodity Title"] ?? "").trim(),
  }));

  const techBySoc = groupBySoc(readXlsx(join(ONET_DIR, "Technology Skills.xlsx")), (row) => ({
    example: String(row.Example ?? "").trim(),
    commodity_title: String(row["Commodity Title"] ?? "").trim(),
    hot_technology: String(row["Hot Technology"] ?? "").trim() === "Y",
    in_demand: String(row["In Demand"] ?? "").trim() === "Y",
  }));

  const jobZones = {};
  for (const row of readXlsx(join(ONET_DIR, "Job Zones.xlsx"))) {
    const soc = String(row["O*NET-SOC Code"] ?? "").trim();
    if (!soc) continue;
    jobZones[soc] = {
      job_zone: Number(row["Job Zone"] ?? 0) || null,
      source: String(row["Domain Source"] ?? "").trim(),
    };
  }

  const educationBySoc = {};
  for (const row of readXlsx(join(ONET_DIR, "Education, Training, and Experience.xlsx"))) {
    const soc = String(row["O*NET-SOC Code"] ?? "").trim();
    if (!soc || String(row["Element Name"] ?? "").trim() !== "Required Level of Education") continue;
    const value = Number(row["Data Value"] ?? 0) || 0;
    const category = Number(row.Category ?? 0) || 0;
    if (!educationBySoc[soc] || value > educationBySoc[soc].data_value) {
      educationBySoc[soc] = {
        category,
        data_value: value,
        scale: String(row["Scale Name"] ?? "").trim(),
      };
    }
  }

  const runtimeOnet = Object.fromEntries(
    Object.entries(onetOccupations).map(([soc, occupation]) => [
      soc,
      {
        soc_code: soc,
        title: occupation.title,
        description: occupation.description,
        tasks: (tasksBySoc[soc] ?? []).slice(0, 12),
        tools: (toolsBySoc[soc] ?? []).slice(0, 12),
        technology_skills: (techBySoc[soc] ?? []).slice(0, 12),
        job_zone: jobZones[soc] ?? null,
        education: educationBySoc[soc] ?? null,
      },
    ])
  );

  return {
    occupations: onetOccupations,
    runtime: runtimeOnet,
    stats: {
      occupations: Object.keys(onetOccupations).length,
      occupations_with_tasks: Object.keys(tasksBySoc).length,
      occupations_with_tools: Object.keys(toolsBySoc).length,
      occupations_with_technology: Object.keys(techBySoc).length,
      occupations_with_job_zones: Object.keys(jobZones).length,
      occupations_with_education: Object.keys(educationBySoc).length,
    },
  };
}

function selectTopOnetMatches(occupation, onetOccupations) {
  const occupationText = normalizeText(
    occupation.label,
    occupation.alt_labels.join(" "),
    occupation.description,
    occupation.definition,
    occupation.isco_group?.label
  );
  const escoTokens = tokenSet(
    [
      occupation.label,
      occupation.alt_labels.join(" "),
      occupation.description,
      occupation.definition,
      occupation.isco_group?.label,
    ].join(" ")
  );
  const domainRules = [
    {
      when: ["phone", "mobile", "cellular"],
      require: ["phone", "mobile", "telecommunications", "radio", "communication"],
    },
    {
      when: ["electronic", "electronics", "ict", "computer", "telecommunications", "communication"],
      require: ["electronic", "electronics", "computer", "telecommunications", "radio", "communication", "network"],
    },
    {
      when: ["sewing", "tailor", "garment", "textile"],
      require: ["sewing", "tailor", "garment", "textile", "fabric"],
    },
    {
      when: ["cook", "kitchen", "food", "restaurant"],
      require: ["cook", "kitchen", "food", "restaurant", "meal"],
    },
  ];
  const activeRule = domainRules.find((rule) => rule.when.some((term) => occupationText.includes(term)));

  return Object.values(onetOccupations)
    .map((onet) => {
      if (activeRule && !activeRule.require.some((term) => onet.search_text.includes(term))) {
        return null;
      }
      const labelScore = jaccard(tokenSet(occupation.label), tokenSet(onet.title));
      const broadScore = jaccard(escoTokens, onet.search_tokens);
      const domainBonus = activeRule ? 0.08 : 0;
      return {
        soc_code: onet.soc_code,
        title: onet.title,
        link_score: Number(Math.max(labelScore * 1.6, broadScore + domainBonus).toFixed(4)),
        link_method: "generated_title_description_similarity",
      };
    })
    .filter((match) => match && match.link_score >= 0.08)
    .sort((a, b) => b.link_score - a.link_score)
    .slice(0, 3);
}

function build() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const onet = buildOnetIndexes();

  const skills = {};
  for (const row of readCsv(INPUT_FILES.skills)) {
    const id = row.ID.trim();
    const label = row.PREFERREDLABEL.trim();
    skills[id] = {
      id,
      origin_uri: row.ORIGINURI.trim(),
      uuid_history: splitList(row.UUIDHISTORY),
      label,
      plain_label: plainLabel(label),
      alt_labels: splitList(row.ALTLABELS),
      description: row.DESCRIPTION.trim(),
      definition: row.DEFINITION.trim(),
      scope_note: row.SCOPENOTE.trim(),
      skill_type: row.SKILLTYPE.trim(),
      reuse_level: row.REUSELEVEL.trim(),
      search_text: normalizeText(label, row.ALTLABELS, row.DESCRIPTION, row.DEFINITION),
    };
  }

  const iscoGroups = {};
  for (const row of readCsv(INPUT_FILES.iscoGroups)) {
    const code = row.CODE.trim();
    iscoGroups[code] = {
      code,
      origin_uri: row.ORIGINURI.trim(),
      label: row.PREFERREDLABEL.trim(),
      alt_labels: splitList(row.ALTLABELS),
      description: row.DESCRIPTION.trim(),
    };
  }

  const occupations = {};
  for (const row of readCsv(INPUT_FILES.occupations)) {
    const id = row.ID.trim();
    const iscoCode = row.ISCOGROUPCODE.trim();
    const label = row.PREFERREDLABEL.trim();
    const sector = inferSectorFromIsco(iscoCode);
    occupations[id] = {
      id,
      origin_uri: row.ORIGINURI.trim(),
      uuid_history: splitList(row.UUIDHISTORY),
      occupation_type: row.OCCUPATIONTYPE.trim(),
      is_localized: row.ISLOCALIZED.trim() === "true",
      isco_code: iscoCode,
      esco_code: row.CODE.trim(),
      label,
      alt_labels: splitList(row.ALTLABELS),
      description: row.DESCRIPTION.trim(),
      definition: row.DEFINITION.trim(),
      scope_note: row.SCOPENOTE.trim(),
      regulated_profession_note: row.REGULATEDPROFESSIONNOTE.trim(),
      sectors: [sector],
      search_text: normalizeText(label, row.ALTLABELS, row.DESCRIPTION, row.DEFINITION, sector, iscoCode),
      essential_skill_ids: [],
      optional_skill_ids: [],
    };
  }

  for (const row of readCsv(INPUT_FILES.occupationSkillRelations)) {
    const occupation = occupations[row.OCCUPATIONID.trim()];
    const skillId = row.SKILLID.trim();
    if (!occupation || !skills[skillId]) continue;
    const target = row.RELATIONTYPE.trim() === "essential" ? "essential_skill_ids" : "optional_skill_ids";
    occupation[target].push(skillId);
  }

  const searchableSkills = {};
  for (const occupation of Object.values(occupations)) {
    for (const skillId of [...occupation.essential_skill_ids, ...occupation.optional_skill_ids]) {
      searchableSkills[skillId] = skills[skillId];
    }
  }

  const byIsco = {};
  const bySector = {};
  for (const occupation of Object.values(occupations)) {
    byIsco[occupation.isco_code] ??= [];
    byIsco[occupation.isco_code].push(occupation.id);
    for (const sector of occupation.sectors) {
      bySector[sector] ??= [];
      bySector[sector].push(occupation.id);
    }
  }

  const occupationSkillIndex = {};
  let occupationsWithOnet = 0;
  for (const [id, occupation] of Object.entries(occupations)) {
    const enrichedOccupation = {
      ...occupation,
      essential_skills: occupation.essential_skill_ids.map((skillId) => skills[skillId]).filter(Boolean),
      optional_skills: occupation.optional_skill_ids.map((skillId) => skills[skillId]).filter(Boolean),
      isco_group: iscoGroups[occupation.isco_code] ?? null,
    };
    const onetMatches = selectTopOnetMatches(enrichedOccupation, onet.occupations);
    if (onetMatches.length) occupationsWithOnet += 1;
    occupationSkillIndex[id] = {
      ...enrichedOccupation,
      onet: {
        link_note:
          "Generated by title/description similarity during preprocessing. Use as task enrichment, not as an official legal crosswalk.",
        matches: onetMatches,
        enrichments: onetMatches.map((match) => ({
          ...match,
          ...(onet.runtime[match.soc_code] ?? {}),
        })),
      },
    };
  }

  const sourceRegistry = buildSourceRegistry();
  const payload = {
    version: "module1-taxonomy-index-generated-v2",
    generated_at: new Date().toISOString(),
    generated_from: sourceRegistry.sources.map((source) => source.id),
    note: "Generated from complete source datasets. Do not hand-edit.",
    stats: {
      occupations: Object.keys(occupationSkillIndex).length,
      all_skills: Object.keys(skills).length,
      linked_runtime_skills: Object.keys(searchableSkills).length,
      isco_groups: Object.keys(iscoGroups).length,
      onet_occupations: onet.stats.occupations,
      occupations_with_onet_enrichment: occupationsWithOnet,
      occupation_skill_relations: Object.values(occupations).reduce(
        (sum, occupation) => sum + occupation.essential_skill_ids.length + occupation.optional_skill_ids.length,
        0
      ),
    },
    occupations: occupationSkillIndex,
    skills: searchableSkills,
    all_skills_catalog: skills,
    isco_groups: iscoGroups,
    onet_stats: onet.stats,
    by_isco: byIsco,
    by_sector: bySector,
  };

  writeFileSync(join(OUTPUT_DIR, "module1_taxonomy_index.json"), JSON.stringify(payload, null, 2), "utf-8");
  writeFileSync(join(OUTPUT_DIR, "source_registry.generated.json"), JSON.stringify(sourceRegistry, null, 2), "utf-8");

  console.log(
    `Generated ${payload.stats.occupations} occupations, ${payload.stats.all_skills} skills, ` +
      `${payload.stats.occupation_skill_relations} occupation-skill relations, ` +
      `${payload.stats.occupations_with_onet_enrichment} O*NET-enriched occupations.`
  );
}

build();
