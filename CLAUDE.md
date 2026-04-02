# Auto-Jobs — Claude Code Project Instructions

## What This Is
Auto-Jobs is a CLI-first framework for simulated user testing and automated customer development. It uses LLM world models + computer use MCP to simulate virtual users grounded in your product's jobs-to-be-done.

## Tagline
**Simulate your users.**

## Tech Stack
- Node.js (>=20), ESM modules
- CLI: commander.js
- AI: Direct API calls (Claude, Gemini, OpenAI) via unified `cli/lib/ai.js`
- MCP: Chrome DevTools MCP + Claude Computer Use MCP for browser automation
- Dashboard: Single-file HTML/CSS/JS (no build step, no framework)
- Config: YAML (js-yaml)
- Reports: Markdown
- Scores: JSON
- No database — local filesystem only

## Key Paths
- `cli/index.js` — CLI entry point
- `cli/commands/` — One file per command (init, interview, test, generate-personas, score, report, dashboard)
- `cli/lib/` — Shared libraries (ai, persona-engine, interview-engine, test-engine, scorer, reporter, vision, mcp)
- `config/` — User config files (project.yaml, jtbd.yaml, personas.yaml, interviews.yaml, test-scenarios.yaml)
- `dashboard/` — Single-file HTML pages (jtbd-map, scores, runs)
- `runs/` — Output directory (timestamped folders with reports + screenshots)
- `scores/history.json` — Longitudinal score tracking
- `SPEC.md` — Full product and tech spec (source of truth)

## Conventions
- ESM imports (`import`/`export`), not CommonJS
- All AI calls go through `cli/lib/ai.js` (never call APIs directly from commands)
- Config files are YAML, output files are JSON or Markdown
- Reports use templates from `templates/`
- Scoring uses weighted dimensions (see SPEC.md for weights)
- Dashboard pages are standalone HTML — no build step, no npm dependencies for frontend
- CLI output uses chalk for colors, ora for spinners

## Scoring
- 10 dimensions, weighted total out of 17 (see SPEC.md)
- Vision-augmented: screenshots analyzed by LLM at key navigation points
- JTBD outcome scoring: importance vs. addressability gap (ODI methodology)
- Scores stored in `scores/history.json`, tracked longitudinally

## Do Not
- Add a build step to the dashboard (keep it single-file HTML)
- Use a database (filesystem only)
- Import AI SDKs directly in command files (use cli/lib/ai.js)
- Generate personas without JTBD context (they must be grounded in the ontology)
- Hardcode model names outside of config (use project.yaml ai settings)
