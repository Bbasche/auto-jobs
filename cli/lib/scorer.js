import { average, clampNumber, renderTable, roundNumber } from './helpers.js';
import { extractKeywords } from './site-inspector.js';

export const DIMENSION_WEIGHTS = {
  job_completion: 3.0,
  time_to_value: 2.0,
  findability: 2.0,
  comprehension: 1.5,
  error_recovery: 1.5,
  satisfaction: 1.5,
  accessibility: 1.0,
  performance: 1.0,
  trust: 1.0,
  outcome_alignment: 2.5,
};

const RECOMMENDATION_MAP = {
  job_completion: 'Make the primary task path shorter and more explicit.',
  time_to_value: 'Reduce setup friction before the user sees value.',
  findability: 'Strengthen navigation labels and surface the core path earlier.',
  comprehension: 'Tighten copy, labels, and hierarchy so users can scan with confidence.',
  error_recovery: 'Add fallback guidance, clearer affordances, and easier retry paths.',
  satisfaction: 'Reduce ambiguity and reinforce progress after key actions.',
  accessibility: 'Add stronger semantic structure, labels, and image alternatives.',
  performance: 'Improve page speed and perceived responsiveness on first interactions.',
  trust: 'Add credibility signals and reduce moments that feel risky or unclear.',
  outcome_alignment: 'Tune the experience to the stated job and desired outcomes more directly.',
};

function ratio(value, max) {
  if (!max) {
    return 0;
  }

  return clampNumber(value / max, 0, 1);
}

function keywordCoverage(tokens, keywords) {
  if (!keywords.length) {
    return 0.5;
  }

  const tokenSet = new Set(tokens);
  const matches = keywords.filter((keyword) => tokenSet.has(keyword)).length;
  return ratio(matches, Math.min(keywords.length, 10));
}

function loadScore(loadMs) {
  if (loadMs <= 600) return 1;
  if (loadMs <= 1200) return 0.85;
  if (loadMs <= 2500) return 0.7;
  if (loadMs <= 5000) return 0.5;
  return 0.3;
}

function traitAdjustedScore(score, adjustments = []) {
  return clampNumber(roundNumber(score + adjustments.reduce((sum, value) => sum + value, 0)), 1, 10);
}

function scorePageSet(surface, persona, scenarioKeywords) {
  const pages = surface.pages.filter((page) => page.ok);
  const visionAnalyses = surface.vision?.analyses?.map((analysis) => analysis.aggregate).filter(Boolean) || [];
  const visionAverage = (key, fallback) =>
    visionAnalyses.length ? average(visionAnalyses.map((analysis) => analysis[key])) : fallback;
  const tokens = [...new Set(pages.flatMap((page) => page.tokens))];
  const coverage = keywordCoverage(tokens, scenarioKeywords);
  const averageLoad = average(pages.map((page) => page.loadMs), 5000);
  const performanceScore = loadScore(averageLoad);
  const pageCountScore = ratio(surface.summary?.crawledPages || pages.length, 4);
  const navScore = average(
    pages.map((page) => average([page.hasNav ? 1 : 0, page.hasMain ? 1 : 0, page.hasFooter ? 1 : 0])),
    0.3,
  );
  const buttonScore = ratio(average(pages.map((page) => page.buttons.length), 0), 4);
  const labelScore = average(
    pages.map((page) => (page.inputCount ? ratio(page.labelCount, page.inputCount) : 0.6)),
    0.5,
  );
  const altScore = average(
    pages.map((page) => (page.imageCount ? ratio(page.imagesWithAlt, page.imageCount) : 0.8)),
    0.8,
  );
  const clarityScore = average(
    pages.map((page) => average([page.title ? 1 : 0, page.description ? 1 : 0, page.headings.length ? 1 : 0])),
    0.4,
  );
  const helpScore = average(
    pages.map((page) => {
      const joined = `${page.title} ${page.description} ${page.headings.join(' ')} ${page.links.map((link) => link.text).join(' ')}`.toLowerCase();
      return /(help|support|faq|contact|docs|learn|guide)/.test(joined) ? 1 : 0.2;
    }),
    0.2,
  );
  const trustSignal = average(
    pages.map((page) => {
      const joined = `${page.title} ${page.description} ${page.links.map((link) => `${link.text} ${link.href}`).join(' ')}`.toLowerCase();
      return average([
        page.url.startsWith('https://') ? 1 : 0.2,
        /(privacy|security|terms|contact|about|support)/.test(joined) ? 1 : 0.3,
        page.status >= 200 && page.status < 400 ? 1 : 0.1,
      ]);
    }),
    0.4,
  );

  const successRatio = ratio(surface.summary?.successSignalCount || 0, Math.max(1, Math.min(3, scenarioKeywords.length)));
  const completedBonus = surface.summary?.completed ? 1.5 : 0;
  const visionFindability = visionAverage('findability', 0);
  const visionComprehension = visionAverage('comprehension', 0);
  const visionTrust = visionAverage('trust', 0);
  const visionSatisfaction = visionAverage('satisfaction', 0);
  const visionAccessibility = visionAverage('accessibility', 0);

  let jobCompletion = 1 + coverage * 3 + buttonScore * 1.5 + pageCountScore * 1.5 + navScore + successRatio * 2 + completedBonus;
  let timeToValue = 1 + performanceScore * 3 + clarityScore * 2 + buttonScore + navScore + ratio(6 - (surface.summary?.totalSteps || 1), 5) * 2;
  let findability = 1 + coverage * 3 + navScore * 2 + pageCountScore * 1.5 + (visionFindability ? visionFindability / 2 : 0);
  let comprehension = 1 + clarityScore * 3 + labelScore * 2 + ratio(1400 - average(pages.map((page) => page.wordCount), 1400), 1400) * 1.5 + (visionComprehension ? visionComprehension / 2 : 0);
  let errorRecovery = 1 + helpScore * 4 + labelScore * 2 + navScore * 2;
  let accessibility = 1 + average([navScore, labelScore, altScore, average(pages.map((page) => (page.hasLang ? 1 : 0)), 0.5)]) * 6 + (visionAccessibility ? visionAccessibility / 2 : 0);
  let performance = 1 + performanceScore * 9;
  let trust = 1 + trustSignal * 5 + clarityScore * 1.5 + navScore + (visionTrust ? visionTrust / 2 : 0);
  let outcomeAlignment = 1 + coverage * 4 + clarityScore * 2 + buttonScore * 1.5 + successRatio * 1.5;
  let satisfaction = average([jobCompletion, timeToValue, findability, comprehension, visionSatisfaction || 0].filter(Boolean));

  const adjustments = [];
  const traits = persona.behavioral_traits || {};

  if (traits.patience === 'low') {
    adjustments.push({ key: 'time_to_value', value: timeToValue < 7 ? -1.2 : -0.3 });
    adjustments.push({ key: 'satisfaction', value: timeToValue < 7 ? -1.0 : -0.2 });
  }

  if (traits.reading_propensity === 'skims') {
    adjustments.push({ key: 'comprehension', value: clarityScore < 0.7 ? -1.0 : -0.2 });
  }

  if (traits.exploration_style === 'goal-directed') {
    adjustments.push({ key: 'findability', value: coverage < 0.5 ? -0.8 : 0 });
  }

  if (persona.demographics?.tech_comfort === 'low') {
    adjustments.push({ key: 'trust', value: trustSignal < 0.7 ? -0.8 : -0.2 });
    adjustments.push({ key: 'comprehension', value: labelScore < 0.7 ? -0.8 : 0 });
  }

  const scoreMap = {
    job_completion: jobCompletion,
    time_to_value: timeToValue,
    findability: findability,
    comprehension: comprehension,
    error_recovery: errorRecovery,
    satisfaction: satisfaction,
    accessibility: accessibility,
    performance: performance,
    trust: trust,
    outcome_alignment: outcomeAlignment,
  };

  Object.entries(scoreMap).forEach(([key, value]) => {
    const traitDelta = adjustments.filter((adjustment) => adjustment.key === key).map((adjustment) => adjustment.value);
    scoreMap[key] = traitAdjustedScore(value, traitDelta);
  });

  return scoreMap;
}

export function computeWeightedOverall(dimensions) {
  const weightedTotal = Object.entries(DIMENSION_WEIGHTS).reduce(
    (sum, [key, weight]) => sum + (dimensions[key] || 0) * weight,
    0,
  );
  const totalWeight = Object.values(DIMENSION_WEIGHTS).reduce((sum, value) => sum + value, 0);

  return roundNumber(weightedTotal / totalWeight);
}

function buildIssues(dimensions, persona, scenario) {
  const critical = [];
  const friction = [];

  Object.entries(dimensions).forEach(([key, value]) => {
    const label = key.replace(/_/g, ' ');
    const message = `${persona.name} in "${scenario.name}" scored ${value}/10 on ${label}.`;

    if (value < 5) {
      critical.push(message);
    } else if (value < 6.5) {
      friction.push(message);
    }
  });

  return {
    critical,
    friction,
  };
}

function buildRecommendations(dimensions, scenario) {
  return Object.entries(dimensions)
    .filter(([, value]) => value < 6.5)
    .sort((left, right) => left[1] - right[1])
    .slice(0, 4)
    .map(([key, value]) => ({
      change: RECOMMENDATION_MAP[key],
      type: value < 5 ? 'critical' : 'improvement',
      priority: value < 5 ? 'high' : 'medium',
      jtbd_impact: key.replace(/_/g, ' '),
      personas_affected: scenario.name,
    }));
}

export function scorePersonaScenario({ persona, scenario, job, surface }) {
  const scenarioKeywords = extractKeywords(
    scenario.name,
    scenario.description,
    scenario.success_criteria || [],
    job?.title || '',
    job?.description || '',
    job?.desired_outcomes?.map((outcome) => outcome.statement) || [],
  );
  const dimensions = scorePageSet(surface, persona, scenarioKeywords);
  const overall = computeWeightedOverall(dimensions);
  const issues = buildIssues(dimensions, persona, scenario);
  const recommendations = buildRecommendations(dimensions, scenario);
  const outcomes = (job?.desired_outcomes || []).map((outcome) => {
    const addressability = clampNumber(
      roundNumber(average([dimensions.outcome_alignment, dimensions.findability, dimensions.comprehension])),
      1,
      10,
    );

    return {
      id: outcome.id,
      statement: outcome.statement,
      importance: outcome.importance,
      addressability,
      gap: roundNumber((outcome.importance || 0) - addressability),
    };
  });

  return {
    persona_id: persona.id,
    persona_name: persona.name,
    scenario_id: scenario.id,
    scenario_name: scenario.name,
    dimensions,
    overall,
    issues,
    recommendations,
    outcomes,
    evidence: {
      crawled_pages: surface.summary.crawledPages,
      average_load_ms: roundNumber(surface.summary.averageLoadMs, 0),
      total_buttons: surface.summary.totalButtons,
      total_forms: surface.summary.totalForms,
      total_internal_links: surface.summary.totalInternalLinks,
      entry_url: surface.entryUrl,
      total_steps: surface.summary.totalSteps || 0,
      success_signal_count: surface.summary.successSignalCount || 0,
      screenshot_paths: surface.screenshots || surface.vision?.analyses?.map((analysis) => analysis.screenshot_path) || [],
      harness_vision: surface.vision?.analyses?.map((analysis) => analysis.aggregate?.summary).filter(Boolean) || [],
    },
  };
}

export function summarizeDimensionTable(dimensions, previousDimensions = null) {
  return renderTable(
    ['Dimension', 'Score', 'Delta'],
    Object.keys(DIMENSION_WEIGHTS).map((key) => {
      const current = dimensions[key];
      const previous = previousDimensions?.[key];
      const delta = typeof previous === 'number' ? roundNumber(current - previous) : 'n/a';
      return [key, `${current}/10`, typeof delta === 'number' ? `${delta >= 0 ? '+' : ''}${delta}` : delta];
    }),
  );
}
