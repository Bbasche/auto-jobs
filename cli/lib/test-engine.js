import { generatePersonas } from './persona-engine.js';
import { getGitMetadata } from './git.js';
import { inspectScenarioSurface } from './site-inspector.js';
import { average, roundNumber, uniqueStrings } from './helpers.js';
import { scorePersonaScenario, computeWeightedOverall } from './scorer.js';
import { runPlaywrightScenario } from './browser-runner.js';

function selectPersonas(personaConfig, jtbd, project, { personaId }) {
  if (personaConfig.personas?.length) {
    if (!personaId) {
      return personaConfig.personas;
    }

    return personaConfig.personas.filter((persona) => persona.id === personaId);
  }

  return generatePersonas({
    project,
    jtbd,
    count: jtbd.actors.length,
    archetype: 'all',
    vary: ['tech_comfort', 'patience'],
    existingPersonas: [],
  }).filter((persona) => !personaId || persona.id === personaId);
}

function selectScenarios(scenariosConfig, scenarioId) {
  const scenarios = scenariosConfig?.scenarios || [];

  if (!scenarioId) {
    return scenarios;
  }

  return scenarios.filter((scenario) => scenario.id === scenarioId || scenario.name === scenarioId);
}

function aggregateOutcomes(results) {
  const grouped = new Map();

  results.flatMap((result) => result.outcomes).forEach((outcome) => {
    const current = grouped.get(outcome.id) || {
      id: outcome.id,
      statement: outcome.statement,
      importance: outcome.importance,
      addressability: [],
      gap: [],
    };

    current.addressability.push(outcome.addressability);
    current.gap.push(outcome.gap);
    grouped.set(outcome.id, current);
  });

  return [...grouped.values()].map((outcome) => ({
    id: outcome.id,
    statement: outcome.statement,
    importance: outcome.importance,
    addressability: roundNumber(average(outcome.addressability)),
    gap: roundNumber(average(outcome.gap)),
  }));
}

function aggregatePersonaScores(results) {
  const grouped = new Map();

  results.forEach((result) => {
    const current = grouped.get(result.persona_id) || [];
    current.push(result);
    grouped.set(result.persona_id, current);
  });

  return Object.fromEntries(
    [...grouped.entries()].map(([personaId, personaResults]) => {
      const dimensions = Object.keys(personaResults[0].dimensions).reduce((accumulator, key) => {
        accumulator[key] = roundNumber(average(personaResults.map((result) => result.dimensions[key])));
        return accumulator;
      }, {});

      return [
        personaId,
        {
          overall: computeWeightedOverall(dimensions),
          dimensions,
          scenarios: personaResults.map((result) => result.scenario_name),
        },
      ];
    }),
  );
}

function aggregateScenarioScores(results) {
  const grouped = new Map();

  results.forEach((result) => {
    const current = grouped.get(result.scenario_id) || [];
    current.push(result);
    grouped.set(result.scenario_id, current);
  });

  return Object.fromEntries(
    [...grouped.entries()].map(([scenarioId, scenarioResults]) => {
      const dimensions = Object.keys(scenarioResults[0].dimensions).reduce((accumulator, key) => {
        accumulator[key] = roundNumber(average(scenarioResults.map((result) => result.dimensions[key])));
        return accumulator;
      }, {});

      return [
        scenarioId,
        {
          name: scenarioResults[0].scenario_name,
          overall: computeWeightedOverall(dimensions),
          dimensions,
        },
      ];
    }),
  );
}

function summarizeIssues(results, key) {
  const grouped = new Map();

  results.forEach((result) => {
    result.issues[key].forEach((issue) => {
      const match = issue.match(/scored ([0-9.]+)\/10 on (.+)\.$/i);
      const dimension = match?.[2] || issue;
      const current = grouped.get(dimension) || {
        dimension,
        count: 0,
        scores: [],
        scenarios: new Set(),
      };

      current.count += 1;
      if (match?.[1]) {
        current.scores.push(Number(match[1]));
      }
      current.scenarios.add(result.scenario_name);
      grouped.set(dimension, current);
    });
  });

  return [...grouped.values()]
    .sort((left, right) => right.count - left.count || average(left.scores, 10) - average(right.scores, 10))
    .slice(0, 8)
    .map((entry) => {
      const averageScore = entry.scores.length ? `${roundNumber(average(entry.scores))}/10` : 'low';
      return `${entry.dimension} was weak for ${entry.count} run(s) across ${[...entry.scenarios].join(', ')} (avg ${averageScore}).`;
    });
}

function summarizeRecommendations(results) {
  const unique = new Map();

  results.forEach((result) => {
    result.recommendations.forEach((recommendation) => {
      const key = recommendation.change;
      const current = unique.get(key) || {
        ...recommendation,
        personas_affected: new Set(),
      };

      current.personas_affected.add(result.persona_name);
      unique.set(key, current);
    });
  });

  return [...unique.values()].slice(0, 8).map((recommendation) => ({
    ...recommendation,
    personas_affected: [...recommendation.personas_affected].join(', '),
  }));
}

function buildExecutiveSummary(results, surfaces, previousRun = null) {
  const overall = roundNumber(average(results.map((result) => result.overall)));
  const lowScores = results.filter((result) => result.overall < 6).length;
  const delta = previousRun?.overall ? roundNumber(overall - previousRun.overall) : null;
  const averagePages = roundNumber(average(surfaces.map((surface) => surface.summary.crawledPages)));

  return [
    `${results.length} persona-scenario simulation(s) inspected the site across an average of ${averagePages} page(s) per scenario.`,
    `${lowScores} run(s) fell below a 6/10 overall, with the most common weak spots clustering around clarity, findability, and outcome alignment.`,
    delta === null
      ? `Current overall score is ${overall}/10.`
      : `Current overall score is ${overall}/10, a ${delta >= 0 ? '+' : ''}${delta} change from the previous scored run.`,
  ].join(' ');
}

export async function runTestBatch({
  root = process.cwd(),
  project,
  jtbd,
  personas,
  scenarios,
  url,
  filters = {},
  previousRun = null,
  runDir = '',
  runnerOverride = '',
  headlessOverride = undefined,
}) {
  const selectedPersonas = selectPersonas(personas, jtbd, project, filters);
  const selectedScenarios = selectScenarios(scenarios, filters.scenarioId);

  if (!selectedPersonas.length) {
    throw new Error('No personas available for testing.');
  }

  if (!selectedScenarios.length) {
    throw new Error('No scenarios available for testing.');
  }

  const git = getGitMetadata(root);
  const runner = runnerOverride || project?.browser?.runner || 'playwright-agent';
  const harness = project?.ai?.harness || {};
  const runPairs = [];

  for (const scenario of selectedScenarios) {
    for (const persona of selectedPersonas) {
      runPairs.push({ scenario, persona });
    }
  }

  const executions = [];

  for (const pair of runPairs) {
    const surface = runner === 'playwright-agent'
      ? await runPlaywrightScenario({
          root,
          project,
          persona: pair.persona,
          scenario: pair.scenario,
          baseUrl: url,
          runDir,
          overrides: {
            runner,
            headless: headlessOverride,
          },
        })
      : await inspectScenarioSurface({
          baseUrl: url,
          entryPath: pair.scenario.entry_url,
          keywords: uniqueStrings([
            pair.scenario.name,
            pair.scenario.description,
            ...(pair.scenario.success_criteria || []),
          ]),
        });
    const job = jtbd.jobs.find((item) => item.id === pair.scenario.target_job) || null;
    const result = scorePersonaScenario({
      persona: pair.persona,
      scenario: pair.scenario,
      job,
      surface,
    });

    executions.push({
      scenario: pair.scenario,
      persona: pair.persona,
      surface,
      result,
    });
  }

  const results = executions.map((execution) => execution.result);

  const dimensions = Object.keys(results[0].dimensions).reduce((accumulator, key) => {
    accumulator[key] = roundNumber(average(results.map((result) => result.dimensions[key])));
    return accumulator;
  }, {});
  const overall = computeWeightedOverall(dimensions);

  return {
    metadata: {
      persona_count: selectedPersonas.length,
      scenario_count: selectedScenarios.length,
      target_url: url,
      git_sha: git.sha,
      git_tag: git.tag,
      previous_overall: previousRun?.overall ?? null,
      runner,
      harness_primary: harness.primary || 'codex',
      harness_secondary: harness.secondary || null,
      harness_orchestration: harness.orchestration || 'single',
    },
    dimensions,
    overall,
    outcomes: aggregateOutcomes(results),
    persona_scores: aggregatePersonaScores(results),
    scenario_scores: aggregateScenarioScores(results),
    critical_issues: summarizeIssues(results, 'critical'),
    friction_points: summarizeIssues(results, 'friction'),
    recommendations: summarizeRecommendations(results),
    executive_summary: buildExecutiveSummary(
      results,
      executions.map((item) => item.surface),
      previousRun,
    ),
    results,
    surface_details: executions.map((item) => item.surface),
    surfaces: executions.map((item) => ({
      scenario_id: item.scenario.id,
      scenario_name: item.scenario.name,
      persona_id: item.persona.id,
      persona_name: item.persona.name,
      ...item.surface.summary,
      entry_url: item.surface.entryUrl,
      runner: item.surface.runner || runner,
      screenshots: item.surface.screenshots || item.surface.vision?.analyses?.map((analysis) => analysis.screenshot_path) || [],
    })),
  };
}
