import { Router } from "express";
import {
  getCountries,
  getCountryConfig,
  getConfigStatsHandler,
  getI18n,
  getIntakeOptionsHandler,
  getModule1MetadataHandler,
} from "../controllers/config-controller.js";

const router = Router();

router.get("/i18n", getI18n);
router.get("/countries", getCountries);
router.get("/config/stats", getConfigStatsHandler);
router.get("/config/:countryCode", getCountryConfig);
router.get("/module1/metadata", getModule1MetadataHandler);
router.get("/module1/intake-options", getIntakeOptionsHandler);

export default router;
