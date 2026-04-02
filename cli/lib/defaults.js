import { basename } from 'path';
import { slugify, slugifyKebab, titleCase, uniqueStrings } from './helpers.js';

const DEFAULT_COLORS = ['#1F6FEB', '#2DA44E', '#D29922', '#BF3989', '#8B949E', '#DB6D28'];
const DEFAULT_STAGES = ['Discover', 'Evaluate', 'Set Up', 'Use', 'Repeat'];

export function createDefaultProjectConfig({
  rootName,
  name,
  description,
  url,
  targetMarket,
  competitors = [],
  keyQuestions = [],
  keyOutcomes = [],
  harnessPrimary = 'codex',
  harnessSecondary = 'claude',
  harnessOrchestration = 'single',
  browserRunner = 'playwright-agent',
  browserHeadless = true,
}) {
  return {
    name: name || titleCase(rootName || basename(process.cwd())),
    description: description || 'A product that helps users make progress on important jobs.',
    url: url || '',
    context_files: [],
    target_market: targetMarket || 'People who need a better way to get an important job done.',
    competitors,
    key_questions: keyQuestions,
    key_outcomes: keyOutcomes,
    ai: {
      primary_model: '',
      vision_model: '',
      fast_model: '',
      temperature: 0.7,
      scoring_temperature: 0.2,
      harness: {
        primary: harnessPrimary,
        secondary: harnessSecondary,
        orchestration: harnessOrchestration,
        codex_model: '',
        claude_model: '',
        timeout_ms: 20000,
      },
    },
    browser: {
      runner: browserRunner,
      headless: browserHeadless,
      max_steps: 4,
      max_candidates: 12,
      channel: 'chrome',
    },
    vision: {
      enabled: true,
      max_snapshots: 1,
    },
    mcp: {
      browser: 'chrome-devtools',
    },
    hooks: {
      post_release: {
        enabled: false,
        trigger: 'git_tag',
        scenarios: ['critical-path'],
      },
    },
  };
}

export function createDefaultActors(actorNames = []) {
  const names = actorNames.length ? actorNames : ['Primary User'];

  return names.map((name, index) => ({
    id: slugify(name),
    name,
    description: `${name} using the product to make meaningful progress.`,
    color: DEFAULT_COLORS[index % DEFAULT_COLORS.length],
  }));
}

export function createDefaultStages(stageNames = []) {
  const names = stageNames.length ? stageNames : DEFAULT_STAGES;

  return names.map((name, index) => ({
    id: slugify(name),
    name,
    order: index + 1,
  }));
}

function createDesiredOutcomes(jobId, keyOutcomes = []) {
  const statements = keyOutcomes.length
    ? keyOutcomes
    : ['Minimize the effort needed to reach a first meaningful outcome'];

  return statements.slice(0, 2).map((statement, index) => ({
    id: `do_${jobId}_${String(index + 1).padStart(2, '0')}`,
    statement,
    importance: index === 0 ? 9 : 7,
    current_satisfaction: index === 0 ? 4 : 5,
  }));
}

function createStarterJob({ actor, stage, description, keyOutcomes }) {
  const jobId = `${slugify(actor.name)}_${slugify(stage.name)}_01`;

  return {
    id: jobId,
    actor: actor.id,
    stage: stage.id,
    title: `Make early progress with ${description ? 'the product' : 'a new solution'}`,
    description: `When ${actor.name.toLowerCase()} is entering the ${stage.name.toLowerCase()} stage, they want to make clear progress without unnecessary setup or confusion.`,
    pain_points: [
      'Too many steps before first value',
      'Unclear language or product structure',
      'Hard to tell whether the solution fits their workflow',
    ],
    solution: '',
    status: 'planned',
    desired_outcomes: createDesiredOutcomes(jobId, keyOutcomes),
  };
}

export function createDefaultJtbdConfig({ actorNames = [], stageNames = [], description = '', keyOutcomes = [] }) {
  const actors = createDefaultActors(actorNames);
  const stages = createDefaultStages(stageNames);
  const jobs = actors.map((actor) =>
    createStarterJob({
      actor,
      stage: stages[0],
      description,
      keyOutcomes,
    }),
  );

  return {
    actors,
    stages,
    jobs,
  };
}

export function createDefaultInterviewConfig() {
  return {
    framework: 'jtbd-foundation',
    questions: [
      {
        id: 'current-workflow',
        prompt: 'Walk me through how you handle this job today.',
      },
      {
        id: 'trigger',
        prompt: 'What usually triggers you to look for a new way to solve this?',
      },
      {
        id: 'pain',
        prompt: 'What is the most frustrating part of your current process?',
      },
      {
        id: 'success',
        prompt: 'How do you decide whether a solution is actually working for you?',
      },
      {
        id: 'trust',
        prompt: 'What would make you trust a new product enough to try it?',
      },
      {
        id: 'ideal',
        prompt: 'If the ideal version existed, what would it feel like to use?',
      },
    ],
  };
}

export function createDefaultScenarioConfig(jtbdConfig) {
  const primaryJob = jtbdConfig.jobs[0];

  return {
    scenarios: [
      {
        id: 'critical-path',
        name: 'Reach first meaningful outcome',
        description: 'A new user attempts the core flow that should lead to first value.',
        entry_url: '/',
        target_job: primaryJob?.id || 'starter_job',
        success_criteria: [
          'User can identify the primary next step',
          'User can complete the critical path without severe confusion',
          'User understands what value they reached',
        ],
        max_duration: 300,
      },
    ],
  };
}

export function createEmptyPersonasConfig() {
  return {
    personas: [],
  };
}

export function createEmptyScoresHistory() {
  return {
    runs: [],
  };
}

export function normalizeCompetitors(values = []) {
  return uniqueStrings(values);
}

export function createInitSummary({ project, jtbd }) {
  return {
    projectName: project.name,
    actorCount: jtbd.actors.length,
    stageCount: jtbd.stages.length,
    jobCount: jtbd.jobs.length,
  };
}

export function createStarterNotes({ project, jtbd }) {
  const firstActor = jtbd.actors[0]?.name || 'your user';
  const firstStage = jtbd.stages[0]?.name || 'the first stage';
  const firstJob = jtbd.jobs[0]?.title || 'a starter job';

  return [
    `Project "${project.name}" initialized with ${jtbd.actors.length} actor(s) and ${jtbd.stages.length} stage(s).`,
    `The starter JTBD map includes a seed job for ${firstActor} in ${firstStage}: ${firstJob}.`,
    'Edit config/jtbd.yaml to replace the starter job with your real workflow before relying on generated personas.',
  ];
}

export function defaultInitAnswers(rootName) {
  return {
    name: titleCase(rootName),
    description: 'A product that helps people make progress on important work.',
    url: '',
    targetMarket: 'People who need a better way to get an important job done.',
    competitors: [],
    keyQuestions: [
      'Where do users lose momentum before they reach value?',
      'What has to feel trustworthy before adoption happens?',
    ],
    keyOutcomes: [
      'First meaningful outcome happens quickly',
      'The product feels clear enough to use without extra explanation',
    ],
    actors: ['Primary User'],
    stages: DEFAULT_STAGES,
    harnessPrimary: 'codex',
    harnessSecondary: 'claude',
    harnessOrchestration: 'single',
    browserRunner: 'playwright-agent',
    browserHeadless: true,
  };
}

export function makeTemplatePlaceholdersSafe(value) {
  return String(value ?? '').replace(/\{/g, '(').replace(/\}/g, ')');
}

export function scenarioNameFromJob(job) {
  return slugifyKebab(job?.title || 'critical-path');
}
