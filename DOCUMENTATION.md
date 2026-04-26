# Vectra / Unmapped Documentation

This document explains how to run, configure, and extend the project.

## 1) Project Overview

Vectra is a labor-intelligence platform with:

- Module 1: skills/profile extraction from work descriptions
- Module 2: automation-risk analysis with LMIC calibration
- Module 3: opportunity matching and policy-facing recommendations

It includes:

- `services/node-api` (Node.js + Express backend API)
- `client` (Next.js web dashboard, policy oriented)
- `unmappedapp` (Flutter app)
- `scripts` + `data` (dataset processing and generation pipeline)

## 2) Repository Structure

- `client/`
  - Next.js frontend dashboard
- `services/node-api/`
  - API server, module orchestration, validation, LLM integration
- `unmappedapp/`
  - Flutter app for intake/profile/risk/opportunities/insights
- `scripts/`
  - Data build/fetch scripts
- `config/`
  - Generated/manual config, i18n, country-level JSON artifacts
- `data/`
  - Raw and processed datasets

## 3) Local Development Setup

### Prerequisites

- Node.js 18+
- npm
- Flutter SDK (for `unmappedapp`)

### Install dependencies

Backend:

```bash
cd services/node-api
npm install
```

Web client:

```bash
cd client
npm install
```

Flutter app:

```bash
cd unmappedapp
flutter pub get
```

### Run services

Backend API:

```bash
cd services/node-api
npm run dev
```

Next.js dashboard:

```bash
cd client
npm run dev
```

Flutter app:

```bash
cd unmappedapp
flutter run
```

## 4) Environment Variables (Backend)

File: `services/node-api/.env`

Required for LLM path:

- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL` (example: `openai/gpt-oss-120b:free`)

General:

- `PORT` (default `4000`)
- `NODE_ENV` (default `development`)
- `CLIENT_ORIGIN` (default `http://localhost:3000`)
- `LLM_TIMEOUT_MS` (global LLM timeout in ms)
- `RISK_LLM_TIMEOUT_MS` (optional Module 2 override)

If `OPENROUTER_API_KEY` is not set or LLM fails, system falls back to deterministic/template logic.

## 5) API Endpoints

### System

- `GET /health`

### Config + Metadata

- `GET /api/i18n?locale=<locale>`
- `GET /api/countries`
- `GET /api/config/stats`
- `GET /api/config/:countryCode`
- `GET /api/module1/metadata`
- `GET /api/module1/intake-options?sector=<id>&limit=all`

### Modules

- `POST /api/module1/profile`
- `POST /api/module2/risk-analysis`
- `POST /api/module3/opportunities`

## 6) Data Pipeline Notes

Core generated artifacts include:

- `data/processed/module1_taxonomy_index.json`
- `data/processed/country_registry.generated.json`
- `config/country_labor_stats.json`
- `config/wittgenstein_education.json`

Do not hand-edit generated files. Rebuild via scripts in `scripts/`.

## 7) Runtime Behavior and Fallbacks

### Module 1

- Uses LLM extraction when available
- Falls back to heuristic extraction if:
  - timeout
  - provider error
  - non-parseable or malformed JSON

### Module 2 and Module 3

- LLM response is parsed and normalized
- Missing sections are backfilled from template fallback where possible
- If call fails entirely, template fallback is used

This keeps API responses stable even when LLM outputs are partial.

## 8) Common Troubleshooting

### `LLM request timed out`

- Increase `LLM_TIMEOUT_MS` and optionally `RISK_LLM_TIMEOUT_MS`
- Use a faster model in `OPENROUTER_MODEL`

### `LLM response missing key: ...`

- This means provider returned partial JSON
- Current implementation normalizes/backfills for resilience
- Check server logs for full error details

### Port `4000` already in use

- Stop existing Node process or change `PORT`

### Flutter PDF warning: Helvetica no Unicode support

- Resolved by embedding Unicode-capable PDF fonts (`PdfGoogleFonts`)

## 9) Hackathon Submission Notes

Current product framing is policy-first:

- Next.js dashboard is configured as a policymaker view
- Dynamic countries are loaded from backend `/api/countries`
- Missing macro data coverage is handled with a user-friendly notice

