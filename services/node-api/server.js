import app from "./app.js";
import { env } from "./config/env.js";

process.on("beforeExit", (code) => {
  console.warn(`[server] beforeExit with code=${code}`);
});

process.on("exit", (code) => {
  console.warn(`[server] exit with code=${code}`);
});

process.on("SIGINT", () => {
  console.warn("[server] received SIGINT");
});

process.on("SIGTERM", () => {
  console.warn("[server] received SIGTERM");
});

process.on("unhandledRejection", (reason) => {
  console.error("[server] unhandledRejection", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[server] uncaughtException", err);
});

app.listen(env.port, () => {
  const mode = env.hasOpenRouterKey ? "llm (OpenRouter)" : "heuristic (no key)";
  console.log(`UNMAPPED API listening on http://localhost:${env.port}`);
  console.log(`Extraction mode: ${mode}`);
});
