const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "i",
  "in",
  "into",
  "is",
  "it",
  "my",
  "of",
  "on",
  "or",
  "our",
  "the",
  "their",
  "to",
  "use",
  "with",
  "work",
]);

const SYNONYMS = new Map([
  ["fix", "repair"],
  ["fixing", "repair"],
  ["phones", "mobile"],
  ["phone", "mobile"],
  ["cellphone", "mobile"],
  ["cellphones", "mobile"],
  ["screen", "display"],
  ["screens", "display"],
  ["clients", "customer"],
  ["customers", "customer"],
  ["stock", "inventory"],
  ["parts", "component"],
  ["sell", "sales"],
  ["selling", "sales"],
]);

export function normalizeText(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(value = "") {
  return normalizeText(value)
    .split(" ")
    .map((token) => SYNONYMS.get(token) ?? token)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

export function tokenSet(value = "") {
  return new Set(tokenize(value));
}

export function overlapScore(leftTokens, rightText) {
  const rightTokens = tokenSet(rightText);
  if (!leftTokens.size || !rightTokens.size) return 0;
  let matches = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) matches += 1;
  }
  return matches / Math.max(3, Math.min(leftTokens.size, rightTokens.size));
}

export function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
