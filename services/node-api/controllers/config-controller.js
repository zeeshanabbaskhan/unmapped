import {
  getConfigStats,
  getFullConfig,
  getI18nStrings,
  getIntakeOptions,
  getModule1Metadata,
  getSupportedCountries,
} from "../lib/dataStore.js";

export function getI18n(req, res) {
  const locale = req.query.locale ?? "en";
  res.status(200).json(getI18nStrings(locale));
}

export function getCountries(_req, res) {
  res.status(200).json({ countries: getSupportedCountries() });
}

export function getConfigStatsHandler(_req, res) {
  res.status(200).json(getConfigStats());
}

export function getCountryConfig(req, res) {
  const countryCode = String(req.params.countryCode ?? "").toUpperCase();
  const config = getFullConfig(countryCode);
  if (!config || !config.country_code) {
    res.status(404).json({ error: `No config found for country: ${countryCode}` });
    return;
  }
  res.status(200).json(config);
}

export function getModule1MetadataHandler(_req, res) {
  res.status(200).json(getModule1Metadata());
}

export function getIntakeOptionsHandler(req, res) {
  res.status(200).json(
    getIntakeOptions({
      sector: req.query.sector,
      limit: req.query.limit ?? "all",
    })
  );
}
