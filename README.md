# Unmapped

Production-oriented Module 1 implementation for a portable Skills Signal Engine.

## Architecture

- `client/` - Next.js frontend intake and profile UI
- `services/node-api/` - Node.js orchestration API, deterministic NLP, and scoring engine
- `scripts/build-module1-index.mjs` - generates runtime indexes from the complete source datasets
- `data/processed/module1_taxonomy_index.json` - generated occupation/skill index, not hand-authored
- `data/processed/source_registry.generated.json` - generated source manifest with file hashes
- `config/` - small authored product config only: country labels and local informal-skill supplement

## Run Locally

From the repository root:

```bash
node scripts/build-module1-index.mjs
```

Terminal 1:

```bash
cd services/node-api
npm run dev
```

Terminal 2:

```bash
cd client
npm run dev
```

Open `http://localhost:3000`.

## Design Principle

Node.js handles messy-language extraction, occupation identity, confidence, and
portability in one auditable backend. The final profile is traceable against
ESCO, ISCO, and local country configuration.

The large taxonomy files in `data/processed/` are generated from the datasets in
`data/`. Do not edit them manually. Re-run `node scripts/build-module1-index.mjs`
after changing source datasets.
