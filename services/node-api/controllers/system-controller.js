import { env } from "../config/env.js";

export function getHealth(_req, res) {
  res.status(200).json({
    ok: true,
    service: "unmapped-node-api",
    extraction_mode: env.hasOpenRouterKey ? "llm" : "heuristic",
  });
}
