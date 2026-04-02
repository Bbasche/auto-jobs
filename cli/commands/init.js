import { basename } from 'path';
import { existsSync } from 'fs';
import { createInterface } from 'readline/promises';
import {
  createDefaultInterviewConfig,
  createDefaultJtbdConfig,
  createDefaultProjectConfig,
  createDefaultScenarioConfig,
  createEmptyPersonasConfig,
  createEmptyScoresHistory,
  createInitSummary,
  createStarterNotes,
  defaultInitAnswers,
  normalizeCompetitors,
} from '../lib/defaults.js';
import { writeJsonFile, writeYamlFile } from '../lib/config.js';
import { ensureProjectStructure } from '../lib/paths.js';
import {
  assertValid,
  validateInterviewConfig,
  validateJtbdConfig,
  validateProjectConfig,
  validateScenarioConfig,
} from '../lib/schema.js';
import { parseCommaSeparated } from '../lib/helpers.js';
import { printBanner, printInfo, printSuccess, printWarning } from '../lib/ui.js';

async function askQuestions(defaults, options) {
  if (options.yes) {
    return defaults;
  }

  if (!process.stdin.isTTY) {
    throw new Error('Interactive init requires a TTY. Re-run with `--yes` or pass flags.');
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = async (prompt, fallback) => {
    const answer = await rl.question(`${prompt}${fallback ? ` [${fallback}]` : ''}: `);
    return answer.trim() || fallback || '';
  };

  try {
    return {
      name: await ask('Product name', defaults.name),
      description: await ask('One-line description', defaults.description),
      url: await ask('URL (optional)', defaults.url),
      targetMarket: await ask('Target market', defaults.targetMarket),
      competitors: parseCommaSeparated(await ask('Competitors (comma separated, optional)', defaults.competitors.join(', '))),
      keyQuestions: parseCommaSeparated(
        await ask('Key learning questions (comma separated)', defaults.keyQuestions.join(', ')),
      ),
      keyOutcomes: parseCommaSeparated(
        await ask('Key outcomes (comma separated)', defaults.keyOutcomes.join(', ')),
      ),
      actors: parseCommaSeparated(await ask('Actors (comma separated)', defaults.actors.join(', '))),
      stages: parseCommaSeparated(await ask('Stages (comma separated)', defaults.stages.join(', '))),
      harnessPrimary: await ask('Primary harness (codex or claude)', defaults.harnessPrimary),
      harnessSecondary: await ask('Secondary harness (codex or claude)', defaults.harnessSecondary),
      harnessOrchestration: await ask('Harness orchestration (single or consensus)', defaults.harnessOrchestration),
      browserRunner: await ask('Browser runner', defaults.browserRunner),
      browserHeadless: (await ask('Run browser headless? (yes/no)', defaults.browserHeadless ? 'yes' : 'no')).toLowerCase() !== 'no',
    };
  } finally {
    rl.close();
  }
}

function resolveAnswers(rootName, options) {
  const defaults = defaultInitAnswers(rootName);

  return {
    ...defaults,
    name: options.name || defaults.name,
    description: options.description || defaults.description,
    url: options.url ?? defaults.url,
    targetMarket: options.targetMarket || defaults.targetMarket,
    competitors: options.competitors?.length ? options.competitors : defaults.competitors,
    keyQuestions: options.keyQuestions?.length ? options.keyQuestions : defaults.keyQuestions,
    keyOutcomes: options.keyOutcomes?.length ? options.keyOutcomes : defaults.keyOutcomes,
    actors: options.actors?.length ? options.actors : defaults.actors,
    stages: options.stages?.length ? options.stages : defaults.stages,
    harnessPrimary: options.harness || defaults.harnessPrimary,
    harnessSecondary: options.secondaryHarness || defaults.harnessSecondary,
    harnessOrchestration: options.orchestration || defaults.harnessOrchestration,
    browserRunner: options.runner || defaults.browserRunner,
    browserHeadless: options.headed ? false : defaults.browserHeadless,
  };
}

async function runInit(options) {
  const rootName = basename(process.cwd());
  const paths = ensureProjectStructure();
  const hasExistingConfig = [
    paths.projectConfigPath,
    paths.jtbdConfigPath,
    paths.interviewsConfigPath,
    paths.scenariosConfigPath,
    paths.personasConfigPath,
    paths.scoresHistoryPath,
  ].some((filePath) => existsSync(filePath));

  if (hasExistingConfig && !options.force) {
    throw new Error('Config files already exist. Re-run with `--force` to overwrite them.');
  }

  printBanner('Auto-Jobs init', 'Create a product-agnostic JTBD project scaffold.');

  const initialAnswers = resolveAnswers(rootName, options);
  const answers = await askQuestions(initialAnswers, options);
  const project = createDefaultProjectConfig({
    rootName,
    name: answers.name,
    description: answers.description,
    url: answers.url,
    targetMarket: answers.targetMarket,
    competitors: normalizeCompetitors(answers.competitors),
    keyQuestions: answers.keyQuestions,
    keyOutcomes: answers.keyOutcomes,
    harnessPrimary: answers.harnessPrimary,
    harnessSecondary: answers.harnessSecondary,
    harnessOrchestration: answers.harnessOrchestration,
    browserRunner: answers.browserRunner,
    browserHeadless: answers.browserHeadless,
  });
  const jtbd = createDefaultJtbdConfig({
    actorNames: answers.actors,
    stageNames: answers.stages,
    description: answers.description,
    keyOutcomes: answers.keyOutcomes,
  });
  const interviews = createDefaultInterviewConfig();
  const scenarios = createDefaultScenarioConfig(jtbd);
  const personas = createEmptyPersonasConfig();
  const scoresHistory = createEmptyScoresHistory();

  assertValid('project.yaml', validateProjectConfig(project));
  assertValid('jtbd.yaml', validateJtbdConfig(jtbd));
  assertValid('interviews.yaml', validateInterviewConfig(interviews));
  assertValid('test-scenarios.yaml', validateScenarioConfig(scenarios));

  writeYamlFile(paths.projectConfigPath, project);
  writeYamlFile(paths.jtbdConfigPath, jtbd);
  writeYamlFile(paths.interviewsConfigPath, interviews);
  writeYamlFile(paths.scenariosConfigPath, scenarios);
  writeYamlFile(paths.personasConfigPath, personas);
  writeJsonFile(paths.scoresHistoryPath, scoresHistory);

  const summary = createInitSummary({ project, jtbd });
  printSuccess(`Initialized ${summary.projectName}.`);
  printInfo(`Actors: ${summary.actorCount} | Stages: ${summary.stageCount} | Seed jobs: ${summary.jobCount}`);

  createStarterNotes({ project, jtbd }).forEach((note) => printWarning(note));
}

export function registerInitCommand(program) {
  program
    .command('init')
    .description('Initialize a new Auto-Jobs project')
    .option('--yes', 'Use sensible defaults without prompting')
    .option('--force', 'Overwrite existing config files')
    .option('--name <name>', 'Product name')
    .option('--description <description>', 'One-line description')
    .option('--url <url>', 'Primary product URL')
    .option('--target-market <targetMarket>', 'Target market description')
    .option('--competitors <competitors>', 'Comma-separated competitor list')
    .option('--key-questions <keyQuestions>', 'Comma-separated learning questions')
    .option('--key-outcomes <keyOutcomes>', 'Comma-separated key outcomes')
    .option('--actors <actors>', 'Comma-separated actor list')
    .option('--stages <stages>', 'Comma-separated stage list')
    .option('--harness <harness>', 'Primary harness: codex or claude')
    .option('--secondary-harness <harness>', 'Secondary harness: codex or claude')
    .option('--orchestration <mode>', 'Harness orchestration: single or consensus')
    .option('--runner <runner>', 'Browser runner: playwright-agent or deterministic-http')
    .option('--headed', 'Configure the default browser runner to show the browser window')
    .action(async (rawOptions) => {
      const options = {
        ...rawOptions,
        competitors: parseCommaSeparated(rawOptions.competitors),
        keyQuestions: parseCommaSeparated(rawOptions.keyQuestions),
        keyOutcomes: parseCommaSeparated(rawOptions.keyOutcomes),
        actors: parseCommaSeparated(rawOptions.actors),
        stages: parseCommaSeparated(rawOptions.stages),
      };

      await runInit(options);
    });
}
