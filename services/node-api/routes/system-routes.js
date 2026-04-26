import { Router } from "express";
import { getHealth } from "../controllers/system-controller.js";

const router = Router();

router.get("/health", getHealth);

export default router;
