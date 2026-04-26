import "dotenv/config";

export const env = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || "development",
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:3000",
  hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
  hasOpenRouterKey: Boolean(process.env.OPENROUTER_API_KEY),
};

export function resolveCorsOrigin(requestOrigin) {
  if (!requestOrigin) return env.clientOrigin;

  // Allow localhost dev ports for Flutter web / Next.js dev / tooling
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(requestOrigin)) {
    return requestOrigin;
  }

  if (requestOrigin === env.clientOrigin) return requestOrigin;
  return env.clientOrigin;
}
