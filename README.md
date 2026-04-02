# Auto-Jobs

**Simulate your users.**

Auto-Jobs is a CLI-first toolkit for simulated user testing and automated customer development. You describe your product through a JTBD map, generate virtual users grounded in that context, run structured interviews, and score a target site against the jobs and outcomes you care about.

## What It Does Today

- Initializes a product-agnostic project scaffold with JTBD, interview, and test config
- Generates virtual personas from your actors, jobs, and desired outcomes
- Runs deterministic simulated interviews and writes markdown reports
- Runs browser-based simulated user tests with Playwright
- Captures screenshots during test runs and includes them in reports
- Uses `codex` or `claude` as the test harness for planning and visual analysis
- Supports single-harness or dual-harness consensus analysis for browser decisions and vision summaries
- Falls back gracefully to deterministic heuristics when a harness is unavailable or times out
- Tracks score history over time
- Generates and serves a local single-file dashboard

## Current MVP Scope

The current MVP is strongest at:

- JTBD scaffolding
- Persona generation
- Interview synthesis
- Browser-based site inspection and scoring
- Harness-assisted screenshot analysis with deterministic fallback
- Codex / Claude harness switching
- Local reports and dashboard views

Not built yet:

- Native MCP browser / desktop control integration
- Rich form-filling workflows beyond click-first pathing
- Slack or webhook notifications

## Install

Requires Node.js 20+.

```bash
npm install
```

Run the CLI directly:

```bash
node cli/index.js --help
```

## Quick Start

Initialize a project:

```bash
node cli/index.js init --yes --force \
  --name "My Product" \
  --description "A tool for fast-moving teams" \
  --url "https://example.com" \
  --harness codex \
  --secondary-harness claude \
  --orchestration single \
  --actors "Primary User,Team Lead" \
  --stages "Discover,Set Up,Use"
```

Generate personas:

```bash
node cli/index.js generate-personas --count 4 --archetype all --vary tech_comfort,patience
```

Run interviews:

```bash
node cli/index.js interview
```

Run a scored test against a live URL:

```bash
node cli/index.js test --url https://example.com
```

Run a Playwright test with a specific harness:

```bash
node cli/index.js test \
  --runner playwright-agent \
  --harness codex \
  --url https://example.com
```

Run with Claude instead:

```bash
node cli/index.js test \
  --runner playwright-agent \
  --harness claude \
  --url https://example.com
```

Run with consensus orchestration:

```bash
node cli/index.js test \
  --runner playwright-agent \
  --harness codex \
  --secondary-harness claude \
  --orchestration consensus \
  --url https://example.com
```

View reports and score history:

```bash
node cli/index.js report
node cli/index.js score --history
```

Build or serve the dashboard:

```bash
node cli/index.js dashboard --build-only
node cli/index.js dashboard --port 4040
```

## Commands

### `init`

Creates:

- `config/project.yaml`
- `config/jtbd.yaml`
- `config/interviews.yaml`
- `config/test-scenarios.yaml`
- `config/personas.yaml`
- `scores/history.json`

### `generate-personas`

Generates personas from the JTBD map and appends them to `config/personas.yaml`.

### `interview`

Runs deterministic simulated interviews for selected personas and writes a run report under `runs/`.

### `test`

Opens a real browser session, follows the configured scenario path, captures screenshots, scores the experience, writes a test report, and appends score history.

Useful flags:

- `--url <url>`
- `--scenario <scenarioId>`
- `--persona <personaId>`
- `--runner <runner>`
- `--harness <harness>`
- `--secondary-harness <harness>`
- `--orchestration <mode>`
- `--headed`
- `--ci`
- `--threshold <score>`
- `--exit-code`

### `score`

Shows latest scores, history, comparisons, and CSV export.

### `report`

Lists runs, opens the latest report path, and compares run manifests.

### `dashboard`

Builds a single-file dashboard from local config and run history, then optionally serves it.

## Output Layout

```text
auto-jobs/
├── cli/
├── config/
├── dashboard/
├── runs/
├── scores/
├── templates/
└── SPEC.md
```

Typical generated files:

- `runs/YYYY-MM-DD-HHmm-interview/report.md`
- `runs/YYYY-MM-DD-HHmm-test/report.md`
- `runs/YYYY-MM-DD-HHmm-test/scores.json`
- `runs/YYYY-MM-DD-HHmm-test/screenshots/...`
- `scores/history.json`
- `dashboard/index.html`

## Harness Configuration

Harnesses are configured in `config/project.yaml`:

```yaml
ai:
  harness:
    primary: codex
    secondary: claude
    orchestration: single
    timeout_ms: 20000

browser:
  runner: playwright-agent
  headless: true
  max_steps: 4

vision:
  enabled: true
  max_snapshots: 1
```

You can also set these at project creation time:

```bash
node cli/index.js init --yes \
  --harness claude \
  --secondary-harness codex \
  --orchestration consensus \
  --runner playwright-agent
```

Supported harnesses:

- `codex`
- `claude`

Supported orchestration modes:

- `single`
- `consensus`

## Scoring

Test runs are scored across these dimensions:

- `job_completion`
- `time_to_value`
- `findability`
- `comprehension`
- `error_recovery`
- `satisfaction`
- `accessibility`
- `performance`
- `trust`
- `outcome_alignment`

The current scorer blends:

- browser navigation evidence
- page structure and content heuristics
- screenshot capture
- optional harness-based visual analysis
- persona trait adjustments

When a harness is slow or unavailable, the browser agent falls back to deterministic heuristics so runs still complete.

## Philosophy

Auto-Jobs is designed to stay:

- CLI-first
- local-file based
- framework-light
- JTBD-grounded
- easy to inspect and hack on

## Repo Notes

- Source of truth product/spec context lives in `SPEC.md`
- Config is YAML
- Reports are Markdown
- Scores and history are JSON
- Dashboard pages are single-file HTML with no frontend build step

## Status

This repo is an active MVP. The core local loop works today:

1. define product context
2. generate personas
3. run interviews
4. run browser-based scored tests with Codex or Claude as the harness
5. inspect reports and dashboard
