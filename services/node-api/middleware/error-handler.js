import { env } from "../config/env.js";

export function notFoundHandler(_req, res) {
  res.status(404).json({ error: "Not found" });
}

export function errorHandler(err, _req, res, _next) {
  res.status(500).json({
    error: "Internal server error",
    detail: env.nodeEnv === "production" ? undefined : err.message,
  });
}
