import cors from "cors";
import { resolveCorsOrigin } from "../config/env.js";

export const corsMiddleware = cors({
  origin(origin, callback) {
    try {
      callback(null, resolveCorsOrigin(origin));
    } catch (err) {
      callback(err);
    }
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["content-type", "authorization"],
  credentials: true,
});
