import { normalizeText } from "./text.js";

const SKILL_KEYWORDS = {
  "repair mobile devices": ["fix phone", "repair phone", "replace screen", "battery", "lcd", "keypad", "mobile"],
  troubleshoot: ["diagnose", "fault", "problem", "not working", "troubleshoot"],
  "maintain customer service": ["customer", "client", "explain", "advise"],
  "manage inventory": ["stock", "inventory", "parts", "supplies"],
  "use digital tools": ["internet", "youtube", "whatsapp", "computer", "mobile money", "bkash"],
  "train others informally": ["teach", "train", "apprentice", "helper", "cousin"],
};

const TOOL_KEYWORDS = {
  "mobile phone": ["phone", "mobile", "cell"],
  "small repair tools": ["screwdriver", "tool", "pliers", "solder"],
  internet: ["internet", "youtube", "online", "whatsapp"],
  "payment tools": ["mobile money", "momo", "bkash", "cash"],
};

const SECTOR_KEYWORDS = {
  technical_services: ["repair", "phone", "electronics", "device", "technical", "software"],
  retail_trade: ["sell", "shop", "customer", "cashier", "stock"],
  construction: ["build", "construction", "carpenter", "weld", "electrician", "plumb"],
  garments: ["sew", "tailor", "garment", "dress", "fabric"],
  transport: ["drive", "deliver", "motorbike", "taxi", "van"],
  food_services: ["cook", "kitchen", "food", "restaurant"],
};

function countMatches(text, keywords) {
  return keywords.reduce((count, keyword) => count + (text.includes(normalizeText(keyword)) ? 1 : 0), 0);
}

export function extractSignals(answers) {
  const text = normalizeText(
    [
      answers.work_description,
      answers.extra_skills,
      ...(answers.tools ?? []),
      ...(answers.selected_skills ?? []),
    ].join(" ")
  );

  const skills = Object.entries(SKILL_KEYWORDS)
    .filter(([, keywords]) => countMatches(text, keywords) > 0)
    .map(([skill]) => skill);

  const tools = Object.entries(TOOL_KEYWORDS)
    .filter(([, keywords]) => countMatches(text, keywords) > 0)
    .map(([tool]) => tool);

  const sectorScores = Object.fromEntries(
    Object.entries(SECTOR_KEYWORDS).map(([sector, keywords]) => [sector, countMatches(text, keywords)])
  );
  const likelySector = Object.entries(sectorScores).sort((a, b) => b[1] - a[1])[0];

  return {
    skills,
    tools,
    likely_sector: likelySector?.[1] > 0 ? likelySector[0] : answers.sector,
    confidence: "heuristic",
    notes: ["node_deterministic_nlp"],
  };
}

export function summarizeProfile({ answers, country, primaryOccupation, confidence, mappedSkills, localSkills }) {
  const title = primaryOccupation?.label ?? "worker";
  const years = Number(answers.experience_years) || 0;
  const city = answers.city || country.default_city;
  const experience =
    years >= 3 ? "more than three years" : years >= 1 ? "one to three years" : "less than one year";
  const skillNames = mappedSkills
    .slice(0, 4)
    .map((skill) => skill.plain_label || skill.label)
    .filter(Boolean);

  let summary = `You are a ${title} in ${city}, ${country.country_name}, with ${experience} of hands-on experience.`;
  if (skillNames.length) {
    summary += ` Your profile shows practical ability to ${skillNames.slice(0, 3).join(", ").toLowerCase()}.`;
  }
  if (localSkills.length) {
    summary += " It also records local skills that standard taxonomies often miss.";
  }

  return {
    summary,
    confidence_note: `This is a ${confidence}-confidence self-reported profile, not a verified credential.`,
    provider: "node_deterministic_nlp",
  };
}
