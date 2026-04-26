import app from "./app.js";
import { env } from "./config/env.js";

app.listen(env.port, () => {
  const mode = env.hasOpenRouterKey ? "llm (OpenRouter)" : "heuristic (no key)";
  console.log(`UNMAPPED API listening on http://localhost:${env.port}`);
  console.log(`Extraction mode: ${mode}`);
});
