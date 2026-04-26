function validateWorkDescriptionQuality(rawText) {
  const text = String(rawText ?? "").trim();
  if (!text) {
    return "Please describe your work in 1-2 sentences.";
  }

  const lower = text.toLowerCase();
  const placeholders = new Set([
    "n/a",
    "na",
    "none",
    "nothing",
    "no",
    "no experience",
    "no exp",
    "idk",
    "unknown",
    "test",
    "asdf",
    "...",
    "-",
    ".",
  ]);
  if (placeholders.has(lower)) {
    return "Work description is too vague. Please describe real tasks you perform.";
  }

  const words = lower.match(/[a-z][a-z'-]*/g) ?? [];
  const uniqueWords = new Set(words);
  const letterCount = (text.match(/[a-z]/gi) ?? []).length;

  if (text.length < 20 || words.length < 4 || uniqueWords.size < 3 || letterCount < 12) {
    return "Work description is too short. Please add at least 1-2 sentences with specific tasks (for example: tools used, tasks done, customers served).";
  }

  const symbolCount = (text.match(/[^a-z0-9\s.,'()/%-]/gi) ?? []).length;
  if (symbolCount > text.length * 0.2) {
    return "Work description appears invalid. Please use clear text describing your actual work.";
  }

  return null;
}

export function validateModule1Answers(answers) {
  const missing = [];
  if (!answers.work_description) missing.push("work_description");
  if (!answers.country_code) missing.push("country_code");
  if (!answers.sector) missing.push("sector");
  if (missing.length) return `Missing required fields: ${missing.join(", ")}`;

  const workDescriptionError = validateWorkDescriptionQuality(answers.work_description);
  if (workDescriptionError) return workDescriptionError;
  return null;
}
