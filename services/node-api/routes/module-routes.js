import { Router } from "express";
import {
  createModule1Profile,
  createModule2RiskAnalysis,
  createModule3Opportunities,
} from "../controllers/module-controller.js";

const router = Router();

router.post("/module1/profile", createModule1Profile);
router.post("/module2/risk-analysis", createModule2RiskAnalysis);
router.post("/module3/opportunities", createModule3Opportunities);

export default router;
