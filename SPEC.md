# Auto-Jobs: Simulated User Testing & Automated Customer Development

> **Simulate your users.**

## Overview

Auto-Jobs is a CLI-first framework that uses LLM world models + computer use to simulate your target users for two purposes:

1. **Automated Customer Development** — Generate virtual users from your JTBD context, run structured interviews with them, and surface latent needs you haven't considered.
2. **Simulated User Testing** — Slot those same virtual users into real browser sessions via computer use MCP, navigate your actual app as that persona would, and produce grounded UX feedback scored against your stated jobs-to-be-done and desired outcomes.

The key insight: if you feed enough context about your product, target users, jobs-to-be-done, desired outcomes, and competitive landscape into an LLM, it can role-play realistic user archetypes with enough fidelity to surface real insights — both in interview mode (what do they need?) and testing mode (can they get it done?).

---

## Core Concepts

### Jobs-to-be-Done Ontology

Every Auto-Jobs project is anchored by a JTBD map — a structured representation of:

- **Actors** — User archetypes (e.g., "Support Lead", "Operations Manager", "Independent Professional")
- **Stages** — The journey phases (e.g., Discover → Setup → Use → Grow)
- **Jobs** — What the actor is trying to accomplish at each stage
- **Desired Outcomes** — Measurable success criteria for each job
- **Pain Points** — Current friction and unmet needs
- **Solutions** — How your product addresses each job

This ontology is stored as structured YAML and rendered in a local dashboard UI (HTML/JS, using an interactive grid with actor rows, stage columns, expandable job cards, and lightweight filters).

### Virtual Users (Personas)

Virtual users are generated from the JTBD ontology + product context. Each virtual user has:

```yaml
id: vu_lee_support_01
name: Lee
archetype: Support Lead
demographics:
  age: 34
  location: Johannesburg, South Africa
  business: Customer support team, 6 agents
  tech_comfort: moderate
  current_tools: [Shared inbox, chat, spreadsheets]
primary_jobs:
  - "Resolve urgent customer issues before they escalate"
  - "Keep the team aligned on who owns the next response"
frustrations:
  - "Important requests get buried in noisy queues"
  - "Two people sometimes reply to the same thread"
context_window: |
  Lee manages a lean customer support team handling email, chat, and escalations.
  The team has grown faster than the tooling. Lee has tried systems that promised
  structure but added too much overhead. They want a workspace that helps agents
  move faster without losing context or duplicating effort.
behavioral_traits:
  patience: low
  exploration_style: goal-directed  # vs. exploratory
  error_tolerance: low
  reading_propensity: skims
```

The system generates multiple variations of each archetype — varying tech comfort, patience, business size, and behavioral traits — to cover the spectrum of real users.

### Runs

A **run** is a configured execution of either interviews or user tests (or both). Each run produces:

- A timestamped markdown report in `runs/YYYY-MM-DD-HHmm-{type}/`
- Scores against JTBD dimensions
- Tracked metrics for longitudinal comparison

---

## Architecture

```
auto-jobs/
├── SPEC.md                          # This file
├── CLAUDE.md                        # Claude Code project instructions
├── package.json                     # Node.js project (CLI + dashboard)
├── config/
│   ├── project.yaml                 # Product context, URLs, description
│   ├── jtbd.yaml                    # Jobs-to-be-done ontology
│   ├── personas.yaml                # Virtual user definitions (generated + manual)
│   ├── interviews.yaml              # Interview question bank + custom questions
│   └── test-scenarios.yaml          # User test scenarios to execute
├── cli/
│   ├── index.js                     # CLI entry point (commander.js)
│   ├── commands/
│   │   ├── init.js                  # Interactive onboarding wizard
│   │   ├── generate-personas.js     # Generate virtual users from JTBD
│   │   ├── interview.js             # Run automated interviews
│   │   ├── test.js                  # Run simulated user tests
│   │   ├── report.js                # View/compare reports
│   │   ├── score.js                 # View/compare scores over time
│   │   └── dashboard.js             # Launch local dashboard UI
│   └── lib/
│       ├── ai.js                    # Unified AI client (Claude/Gemini/OpenAI)
│       ├── persona-engine.js        # Virtual user generation + variation
│       ├── interview-engine.js      # Interview simulation orchestrator
│       ├── test-engine.js           # User test orchestrator
│       ├── scorer.js                # JTBD-aware scoring engine
│       ├── reporter.js              # Markdown report generator
│       ├── vision.js                # Screenshot capture + vision analysis
│       └── mcp.js                   # MCP client for computer use + Chrome DevTools
├── dashboard/
│   ├── index.html                   # Single-file dashboard (JTBD map + results)
│   ├── jtbd-map.html                # Interactive JTBD grid (actor × stage)
│   └── scores.html                  # Longitudinal score tracking
├── runs/                            # Output directory for all run results
│   └── 2026-04-02-1430-interview/
│       ├── report.md                # Full insights report
│       ├── scores.json              # Dimensional scores
│       ├── transcripts/             # Individual interview/test transcripts
│       └── screenshots/             # Vision snapshots from test runs
├── scores/
│   └── history.json                 # Longitudinal score tracking database
└── templates/
    ├── report-interview.md          # Report template for interviews
    └── report-test.md               # Report template for user tests
```

---

## CLI Commands

### `auto-jobs init`

Interactive onboarding wizard that builds your project context:

1. **Product basics** — Name, URL, one-line description, target market
2. **JTBD mapping** — Walks you through defining actors, stages, jobs, desired outcomes, and pain points. Can also ingest an existing JTBD map (YAML/JSON/HTML).
3. **Context ingestion** — Feed it READMEs, product docs, marketing copy, competitor URLs, or arbitrary context files. These get chunked and stored as product context.
4. **Goals** — What do you want to learn? What are your key hypotheses? What outcomes matter most?
5. **Interview config** — Select from predefined question frameworks (JTBD switch interviews, demand-side interviews, outcome-driven innovation) or add custom questions.
6. **Test config** — Define key user flows to test (e.g., "Create a workspace and invite a teammate", "Triage and resolve an urgent request").

Outputs: `config/project.yaml`, `config/jtbd.yaml`, `config/interviews.yaml`, `config/test-scenarios.yaml`

### `auto-jobs generate-personas`

Generates virtual users from the JTBD ontology:

```bash
auto-jobs generate-personas --count 5 --archetype "Support Lead"
auto-jobs generate-personas --count 3 --archetype all
auto-jobs generate-personas --vary tech_comfort,patience  # Generate variations
```

Uses the JTBD map + product context to create realistic personas with:
- Demographically varied profiles
- Behavioral trait distributions (tech comfort, patience, exploration style)
- Realistic backstories grounded in the JTBD pain points
- Specific context windows that prime the LLM for role-play

Outputs: `config/personas.yaml` (append mode — new personas added to existing)

### `auto-jobs interview`

Runs automated customer development interviews:

```bash
auto-jobs interview                           # All personas, default questions
auto-jobs interview --persona vu_sarah_01     # Specific persona
auto-jobs interview --archetype "Support Lead"   # All personas of this type
auto-jobs interview --questions custom.yaml   # Custom question set
auto-jobs interview --depth deep              # Extended probing (follow-ups)
```

**How it works:**

1. For each selected persona, the system creates a conversation where:
   - **System prompt**: Full persona context (demographics, behavioral traits, JTBD context, frustrations, current tools)
   - **Interviewer agent**: Asks questions from the configured question bank, with intelligent follow-up probing
   - **Persona agent**: Responds in character, drawing on the JTBD world model

2. The interviewer adapts — if a response reveals an unexpected pain point, it probes deeper. If the persona seems disengaged, it pivots to a different angle.

3. After all interviews complete, a synthesis agent analyzes all transcripts and produces:
   - **Latent needs** — Needs that weren't in your original JTBD map
   - **Validation signals** — Which of your existing jobs/outcomes got strong confirmation
   - **Surprise findings** — Unexpected perspectives or use cases
   - **Recommended JTBD updates** — Suggested additions/modifications to your ontology
   - **Feature recommendations** — Concrete product changes implied by the findings

**Output**: `runs/YYYY-MM-DD-HHmm-interview/report.md` + individual transcripts

### `auto-jobs test`

Runs simulated user tests via computer use:

```bash
auto-jobs test                                  # All scenarios, all personas
auto-jobs test --scenario "first-response"        # Specific scenario
auto-jobs test --persona vu_sarah_01             # Specific persona
auto-jobs test --url http://localhost:3000       # Override target URL
auto-jobs test --browser chrome                  # Browser choice
auto-jobs test --record                          # Record session video
auto-jobs test --vision claude                   # Vision model for snapshots
```

**How it works:**

1. For each persona × scenario combination, the system:
   - Launches a browser session via Chrome DevTools MCP or Claude computer use MCP
   - Primes the agent with the full persona context + the test scenario
   - The agent navigates the application **as that persona would** — meaning:
     - A low-patience user skips onboarding modals
     - A low-tech-comfort user hesitates on complex forms
     - A goal-directed user ignores exploratory features
     - A skimmer misses important instructions in body text

2. At key navigation points, the system takes vision snapshots and analyzes:
   - **Findability** — Could this persona find what they need?
   - **Comprehension** — Does the UI communicate clearly for this user's context?
   - **Friction** — Where did the persona struggle or hesitate?
   - **Completion** — Did they accomplish the job?
   - **Emotional state** — Inferred satisfaction/frustration level

3. Throughout navigation, the system evaluates against the relevant JTBD:
   - Is this flow addressing the stated job?
   - Are the desired outcomes achievable?
   - Where does the experience fall short of the outcome criteria?

**Output**: `runs/YYYY-MM-DD-HHmm-test/report.md` + screenshots + scores

### `auto-jobs score`

View and compare scores over time:

```bash
auto-jobs score                    # Latest scores
auto-jobs score --history          # Show score progression
auto-jobs score --compare v1 v2    # Compare two runs
auto-jobs score --dimension all    # Breakdown by dimension
auto-jobs score --export csv       # Export for analysis
```

### `auto-jobs report`

View and manage reports:

```bash
auto-jobs report                   # List all runs
auto-jobs report --latest          # Open latest report
auto-jobs report --diff run1 run2  # Diff two reports
```

### `auto-jobs dashboard`

Launch the local dashboard UI:

```bash
auto-jobs dashboard                # Opens browser to localhost:4040
auto-jobs dashboard --port 8080    # Custom port
```

---

## Scoring System

The scoring model is multi-dimensional, weighted, vision-augmented, and trackable over time.

### Dimensions

Each user test run scores across these dimensions (1-10 scale):

| Dimension | Weight | Description |
|-----------|--------|-------------|
| `job_completion` | 3.0 | Did the persona complete the target job? |
| `time_to_value` | 2.0 | How quickly did they reach the "aha" moment? |
| `findability` | 2.0 | Could they find the features they needed? |
| `comprehension` | 1.5 | Did they understand what the UI was asking? |
| `error_recovery` | 1.5 | When something went wrong, could they recover? |
| `satisfaction` | 1.5 | Inferred emotional satisfaction (from behavior + vision) |
| `accessibility` | 1.0 | Keyboard nav, contrast, screen reader hints |
| `performance` | 1.0 | Perceived speed and responsiveness |
| `trust` | 1.0 | Did the UI inspire confidence? (copy, design, feedback) |
| `outcome_alignment` | 2.5 | Does the experience deliver against the stated desired outcomes? |

**Weighted formula**: `(job_completion×3 + time_to_value×2 + findability×2 + comprehension×1.5 + error_recovery×1.5 + satisfaction×1.5 + accessibility×1 + performance×1 + trust×1 + outcome_alignment×2.5) / 17`

### JTBD Outcome Scoring

Beyond UX dimensions, each run also scores against the specific desired outcomes defined in your JTBD map:

```yaml
# Example from jtbd.yaml
jobs:
  - id: support_triage_01
    actor: Support Lead
    stage: Triage
    title: "Route urgent conversations without manual handoffs"
    desired_outcomes:
      - id: do_01
        statement: "Minimize the time needed to route urgent conversations to the right owner"
        importance: 9
        current_satisfaction: 3
      - id: do_02
        statement: "Minimize the number of conversations that require duplicate responses"
        importance: 8
        current_satisfaction: 4
```

Each outcome gets scored on:
- **Addressability** (1-10): Does the current product experience address this outcome?
- **Gap** = `importance - addressability` (opportunity score, ODI-style)

### Longitudinal Tracking

Scores are stored in `scores/history.json`:

```json
{
  "runs": [
    {
      "id": "2026-04-02-1430",
      "type": "test",
      "timestamp": "2026-04-02T14:30:00Z",
      "git_sha": "abc123",
      "git_tag": "v1.2.0",
      "dimensions": { "job_completion": 7, "findability": 5, ... },
      "overall": 6.2,
      "outcomes": [
        { "id": "do_01", "addressability": 6, "gap": 3 },
        { "id": "do_02", "addressability": 7, "gap": 1 }
      ],
      "persona_scores": {
        "vu_sarah_01": { "overall": 5.8, ... },
        "vu_james_01": { "overall": 6.5, ... }
      }
    }
  ]
}
```

The `--history` flag renders a CLI sparkline chart showing score progression, and the dashboard renders full time-series charts.

---

## Report Format

Each run produces a markdown report with these sections:

### Interview Report (`report-interview.md`)

```markdown
# Customer Development Report — {date}

## Run Config
- Personas interviewed: {count}
- Question framework: {framework}
- Model: {model}

## Executive Summary
{2-3 paragraph synthesis of key findings}

## Latent Needs Discovered
{Needs not in the current JTBD map, ranked by frequency + intensity}

## Validation Signals
{Which existing jobs/outcomes got confirmed, with evidence quotes}

## Surprise Findings
{Unexpected perspectives, use cases, or pushback}

## Recommended JTBD Updates
{Specific additions/modifications to the ontology}

## Recommended Features
| Feature | Priority | Job Addressed | Personas Who Need It |
|---------|----------|---------------|---------------------|
| ...     | ...      | ...           | ...                 |

## Recommended Bug Fixes / Changes
{Issues surfaced during interviews that imply product problems}

## Full Transcripts
{Links to individual transcript files}
```

### User Test Report (`report-test.md`)

```markdown
# User Test Report — {date}

## Run Config
- Personas tested: {count}
- Scenarios: {list}
- Target URL: {url}
- Git SHA: {sha}

## Executive Summary
{2-3 paragraph synthesis}

## Scores
### Overall: {score}/10 ({delta} from last run)
{Dimension breakdown table with deltas}

### JTBD Outcome Scores
{Outcome table with importance, addressability, gap, delta}

### Per-Persona Breakdown
{Score table by persona with commentary}

## Critical Issues
{Blocking UX problems, ranked by severity × frequency}

## Friction Points
{Non-blocking but notable UX friction}

## JTBD Gap Analysis
{Where the experience fails to deliver against stated outcomes}

## Recommendations
| Change | Type | Priority | JTBD Impact | Personas Affected |
|--------|------|----------|-------------|-------------------|
| ...    | ...  | ...      | ...         | ...               |

## Did This Release Move the Needle?
{If git_tag changed since last run: explicit assessment of whether
 the release improved JTBD outcome scores}

## Screenshots
{Key screenshots with annotations}
```

---

## Integration Points

### Computer Use MCP

Connects to browser automation via:
- **Chrome DevTools MCP** — For Chrome-based testing (navigate, click, fill, screenshot, evaluate_script)
- **Claude Computer Use MCP** — For full desktop interaction (click, type, screenshot, scroll)

The test engine abstracts over both — you configure which MCP to use in `project.yaml`.

### Vision Models

For screenshot analysis during test runs:
- **Claude** (claude-sonnet-4-6 or claude-opus-4-6) — Primary vision model for UX analysis
- **Gemini** (gemini-2.5-flash) — Fast/cheap alternative for high-volume runs
- **GPT-4o** — Alternative vision model

Vision is used to:
1. Analyze screenshots for UX quality at key navigation points
2. Verify that visual elements match expectations
3. Detect visual bugs (overlapping elements, cut-off text, broken layouts)
4. Infer emotional tone from UI copy and design

### CI/CD Integration

```bash
# Run after every deploy
auto-jobs test --ci --threshold 6.0 --exit-code

# Exits with code 1 if overall score < threshold
# Outputs scores to stdout in JSON for pipeline consumption
```

Can be wired into GitHub Actions, Railway deploy hooks, or any CI system.

### Post-Release Hook

```yaml
# In project.yaml
hooks:
  post_release:
    enabled: true
    trigger: git_tag  # Run when a new git tag is pushed
    scenarios: [critical-path]
    personas: [all]
    notify: slack  # Optional: post results to Slack
```

---

## Tech Stack

- **Runtime**: Node.js (>=20)
- **CLI framework**: commander.js
- **AI client**: Direct API calls to Claude, Gemini, OpenAI via a unified `cli/lib/ai.js` wrapper
- **MCP client**: `@anthropic-ai/mcp-client` for computer use + Chrome DevTools
- **Browser automation**: Playwright (fallback if MCP unavailable)
- **Dashboard**: Single-file HTML/CSS/JS (no build step, served via `npx serve`)
- **Data format**: YAML for config, JSON for scores/history, Markdown for reports
- **Storage**: Local filesystem (no database needed)
- **Charts**: Sparklines in CLI (sparkline npm), Chart.js in dashboard

---

## Onboarding Flow (Detailed)

When a user runs `auto-jobs init` for the first time:

```
$ auto-jobs init

Welcome to Auto-Jobs — Simulate your users.

Let's set up your project. I'll ask you some questions about your product,
your users, and what you want to learn.

──────────────────────────────────────────────

1. PRODUCT CONTEXT

What's your product called?
> SignalDesk

One-line description:
> Shared inbox software for fast-moving support teams

What's the URL? (leave blank if not deployed yet)
> https://app.signaldesk.example

Do you have any docs, READMEs, or context files to ingest? (comma-separated paths)
> ./README.md, ./docs/product-spec.md, ./CLAUDE.md

Great — I've ingested 3 files (42KB of product context).

──────────────────────────────────────────────

2. JOBS-TO-BE-DONE

Do you have an existing JTBD map? (path to YAML/JSON/HTML, or 'no')
> ./docs/c-suite/jtbd-map.html

Parsed 3 actors, 8 stages, 47 jobs from your JTBD map.

Want me to enrich this with desired outcomes? I'll generate measurable
outcome statements for each job using ODI methodology.
> yes

Generated 94 desired outcomes across 47 jobs.
Review and edit: config/jtbd.yaml

──────────────────────────────────────────────

3. WHAT DO YOU WANT TO LEARN?

What are your top 3 questions about your users right now?
> 1. What makes a support team trust a new inbox or workflow tool?
> 2. Which channels matter most in the first version: email, chat, or both?
> 3. What is the biggest blocker preventing teams from replacing their shared spreadsheet?

What outcomes matter most to you for this round of testing?
> 1. Users can triage their first urgent conversation in under 2 minutes
> 2. Ownership and status are obvious at a glance
> 3. New teammates can understand the workflow without extra training

──────────────────────────────────────────────

4. INTERVIEW CONFIG

Which interview framework?
  [1] JTBD Switch Interviews (why did you switch/consider switching?)
  [2] Demand-Side Interviews (what triggered your search?)
  [3] Outcome-Driven (importance vs. satisfaction per outcome)
  [4] Custom questions only
  [5] All of the above
> 1

Add custom interview questions? (one per line, blank to finish)
> If you could wave a magic wand and fix one thing about team coordination, what would it be?
> Tell me about the last time an urgent request got dropped or duplicated - what happened?
>

──────────────────────────────────────────────

5. TEST SCENARIOS

I've detected these potential test scenarios from your JTBD map:
  [x] Sign up and complete onboarding
  [x] Create a workspace
  [x] Assign ownership on an incoming request
  [x] Add an internal note
  [ ] Resolve a repeated question with a saved reply
  [ ] Review workload across the team

Toggle scenarios (space to select, enter to confirm):
> [confirmed 4 scenarios]

──────────────────────────────────────────────

Setup complete! Files written:
  config/project.yaml    — Product context
  config/jtbd.yaml       — 47 jobs, 94 desired outcomes
  config/interviews.yaml — JTBD switch framework + 2 custom questions
  config/test-scenarios.yaml — 4 test scenarios

Next steps:
  auto-jobs generate-personas    Generate virtual users
  auto-jobs interview            Run customer development interviews
  auto-jobs test                 Run simulated user tests
  auto-jobs dashboard            Launch the dashboard
```

---

## Virtual User Generation (Detailed)

The persona generation engine works in three passes:

### Pass 1: Archetype Extraction
From the JTBD map, extract unique actors and their job clusters. Each actor becomes a base archetype.

### Pass 2: Variation Generation
For each archetype, generate N variations along these axes:

| Axis | Range | Effect on Behavior |
|------|-------|--------------------|
| `tech_comfort` | low → high | Low: slower navigation, confused by jargon. High: skips tutorials, uses keyboard shortcuts |
| `patience` | low → high | Low: abandons after 2 failed attempts. High: methodically tries alternatives |
| `exploration_style` | goal-directed → exploratory | Goal-directed: beelines to target. Exploratory: clicks around, reads descriptions |
| `business_size` | solo → 50+ employees | Affects context (invoicing volume, delegation needs, budget sensitivity) |
| `current_solution` | spreadsheet → competitor software | Affects reference frame and switching costs |
| `reading_propensity` | skims → reads carefully | Skims: misses tooltips, warnings. Reads: catches edge cases |

### Pass 3: Context Window Generation
For each variation, generate a rich natural-language context window (200-400 words) that primes the LLM to role-play this specific person. This includes:
- Their daily routine with your product category
- Specific frustrations with current solutions
- What would make them switch
- How they evaluate new tools
- Their emotional relationship with the problem domain

---

## Vision-Augmented Testing (Detailed)

During user test runs, the system captures screenshots at key moments and runs vision analysis:

### Screenshot Triggers
1. **Page load** — Every new page/route
2. **Before interaction** — Before clicking a key CTA or filling a form
3. **After interaction** — After form submission, modal appearance, state change
4. **On confusion** — When the agent hesitates or backtracks (detected via navigation patterns)
5. **On error** — When an error state appears

### Vision Analysis Prompt

```
You are analyzing a screenshot of a web application from the perspective of
{persona.name}, a {persona.archetype} with {persona.tech_comfort} tech comfort.

They are trying to: {current_job}
Their desired outcome: {desired_outcome}
Their current emotional state: {inferred_state}

Analyze this screenshot and report:
1. FINDABILITY: Can this persona easily identify what to do next? (1-10)
2. COMPREHENSION: Is the UI copy and layout clear for someone at this tech level? (1-10)
3. TRUST: Does this screen inspire confidence? (1-10)
4. FRICTION: What specific elements would cause this persona to struggle?
5. BUGS: Any visual bugs (overlapping elements, cut-off text, broken layout)?
6. SUGGESTIONS: Specific, actionable improvements for this persona's experience
```

### Multi-Model Vision

The system can run vision analysis through multiple models and synthesize:
- Claude for deep UX reasoning
- Gemini for fast structural analysis
- GPT-4o for alternative perspective

Results are merged with conflict resolution (majority vote on scores, union of issues).

---

## Dashboard UI

The local dashboard serves three views, all single-file HTML with no build step:

### 1. JTBD Map (`/jtbd`)
Interactive grid organized around the JTBD map:
- Actor rows × Stage columns
- Expandable job cards with desired outcomes, pain points, solutions
- Filter by actor, status (addressed/gap/untested)
- Color-coded by outcome gap score (green = addressed, amber = partial, red = gap)
- Data source: `config/jtbd.yaml`

### 2. Score Dashboard (`/scores`)
Longitudinal score tracking:
- Overall score trend line (sparkline + full chart)
- Per-dimension breakdown over time
- Per-persona score comparison
- JTBD outcome gap waterfall chart
- Git tag markers on timeline (see which releases moved the needle)
- Data source: `scores/history.json`

### 3. Run Explorer (`/runs`)
Browse all run results:
- List of all runs with type, date, score, delta
- Click into a run to see full report (rendered markdown)
- Side-by-side comparison mode
- Screenshot gallery with annotations
- Data source: `runs/*/`

---

## Differentiation

| Feature | Auto-Jobs | Maze/UserTesting | Traditional A/B Testing |
|---------|-----------|-------------------|------------------------|
| Real users needed | No | Yes | Yes |
| JTBD-grounded | Yes | No | No |
| Automated interviews | Yes | No | N/A |
| Computer use testing | Yes | Screen recording | Metric tracking |
| Latent need discovery | Yes | Partial | No |
| Cost per run | ~$0.50-5 in API costs | $50-500/participant | Free (but slow) |
| Speed | Minutes | Days-weeks | Days-weeks |
| Runs after every release | Yes (CI hook) | No | Partial |
| Scores against JTBD outcomes | Yes | No | No |

---

## Limitations & Honest Caveats

1. **Not a replacement for real users** — Virtual users are simulations, not substitutes. Use this to generate hypotheses and catch obvious UX failures, then validate with real people.
2. **LLM bias** — Virtual users will share the biases of the underlying model. They may be more articulate, more patient, and more forgiving than real users.
3. **Vision analysis is approximate** — Computer use + vision can catch layout bugs and navigation issues but won't catch subtle interaction bugs (hover states, animation timing, etc.).
4. **Cultural context** — For non-English or culturally specific products, persona generation needs careful prompt engineering to avoid stereotypes.
5. **Garbage in, garbage out** — The quality of insights depends entirely on the quality of your JTBD map and product context. Shallow inputs produce generic insights.

---

## Implementation Phases

### Phase 1: Foundation (MVP)
- `init` command with onboarding wizard
- JTBD YAML schema + parser
- Persona generation engine
- Interview engine (single-model, no follow-up probing)
- Basic markdown reports
- CLI-only (no dashboard)

### Phase 2: Computer Use Testing
- Chrome DevTools MCP integration
- Claude computer use MCP integration
- Vision-augmented analysis
- Scoring engine (all 10 dimensions)
- Test report generation

### Phase 3: Dashboard + Scoring
- JTBD map dashboard (HTML)
- Score tracking dashboard
- Run explorer
- Longitudinal score history
- Git tag integration

### Phase 4: CI/CD + Polish
- CI mode (`--ci --threshold --exit-code`)
- Post-release hooks
- Multi-model vision synthesis
- Interview follow-up probing
- Slack/webhook notifications
- HTML JTBD map import (parse existing exported JTBD maps)

---

## Example: Full Flow

```bash
# 1. Initialize project
auto-jobs init
# → Answer questions about your product, import JTBD map

# 2. Generate virtual users
auto-jobs generate-personas --count 5 --archetype all
# → Creates 15 personas (5 per archetype)

# 3. Run interviews to surface latent needs
auto-jobs interview --depth deep
# → Produces runs/2026-04-02-1430-interview/report.md
# → "Discovered 3 latent needs not in your JTBD map"

# 4. Update your JTBD map with findings
# (manually review + edit config/jtbd.yaml)

# 5. Run user tests against your live app
auto-jobs test --url https://app.signaldesk.example
# → Produces runs/2026-04-02-1500-test/report.md
# → Overall score: 6.2/10
# → "Critical: Routing ownership scored 3/10 on clarity for low-tech personas"

# 6. Fix issues, ship new release, re-test
auto-jobs test --url https://app.signaldesk.example
# → Overall score: 7.1/10 (+0.9)
# → "Ownership clarity improved from 3 to 7 after simplifying the assignment UI"

# 7. View score progression
auto-jobs score --history
# → Sparkline showing 6.2 → 7.1 trend

# 8. Open dashboard for visual exploration
auto-jobs dashboard
# → Opens browser with JTBD map + score charts + run history
```

---

## Config File Schemas

### `project.yaml`

```yaml
name: SignalDesk
description: Shared inbox software for fast-moving support teams
url: https://app.signaldesk.example
context_files:
  - ./README.md
  - ./docs/product-spec.md
target_market: Support and operations teams handling high volumes of inbound requests
competitors:
  - Front
  - Zendesk
  - Help Scout
key_questions:
  - What makes a team trust a new inbox workflow?
  - Which collaboration moments are hardest to coordinate today?
key_outcomes:
  - First urgent request is triaged in under 2 minutes
  - Ownership is obvious without extra explanation
  - New teammates can navigate the system without training
ai:
  primary_model: claude-sonnet-4-6
  vision_model: claude-sonnet-4-6
  fast_model: gemini-2.5-flash
  temperature: 0.7  # For persona responses
  scoring_temperature: 0.2  # For consistent scoring
mcp:
  browser: chrome-devtools  # or 'computer-use'
hooks:
  post_release:
    enabled: false
    trigger: git_tag
    scenarios: [critical-path]
```

### `jtbd.yaml`

```yaml
actors:
  - id: support_lead
    name: Support Lead
    description: Team lead responsible for keeping incoming customer requests organized
    color: "#F5A623"

stages:
  - id: discover
    name: Discover
    order: 1
  - id: setup
    name: Set Up
    order: 2
  # ...

jobs:
  - id: support_discover_01
    actor: support_lead
    stage: discover
    title: Find a tool that keeps fast-moving support work organized
    description: >
      When incoming requests are piling up and ownership is unclear, I want
      to find a solution that makes triage visible and collaborative, so the
      team can respond quickly without stepping on each other.
    pain_points:
      - Shared inboxes lack clear ownership
      - Important requests get buried in noisy queues
      - Teammates duplicate work without realizing it
    solution: Marketing site -> workspace signup -> shared inbox setup
    status: built  # built | in-progress | planned
    desired_outcomes:
      - id: do_support_discover_01_01
        statement: Minimize the time spent evaluating whether the tool will reduce triage chaos
        importance: 7
        current_satisfaction: 5
      - id: do_support_discover_01_02
        statement: Minimize the risk of choosing a tool that's too complex
        importance: 9
        current_satisfaction: 3
```

### `test-scenarios.yaml`

```yaml
scenarios:
  - id: first-response
    name: Triage and assign the first urgent request
    description: >
      New user signs up, completes onboarding, and assigns ownership on their first urgent request.
    entry_url: /auth/register
    target_job: support_triage_01
    success_criteria:
      - User can find the incoming queue
      - Ownership is assigned to the right teammate
      - The updated status is easy to confirm
    max_duration: 300  # seconds
    
  - id: saved-reply
    name: Resolve a repeat question with a saved reply
    description: >
      Existing user navigates to the inbox, finds a repeated question, and uses a saved reply.
    entry_url: /dashboard
    target_job: support_use_04
    preconditions:
      - logged_in: true
    success_criteria:
      - User finds the saved reply entry point
      - The reply is applied without confusion
      - The user can review the response before sending
    max_duration: 180
```

---

## Pricing Model (if productized)

Not relevant for v1 (this is an open-source CLI tool), but for reference if it becomes a product:

- **Free**: 3 personas, 5 interview runs/month, 2 test runs/month
- **Pro ($49/mo)**: Unlimited personas, unlimited runs, dashboard, CI integration
- **Team ($149/mo)**: Multi-project, team sharing, Slack integration, priority models
