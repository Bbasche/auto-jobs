import { readYamlFile, requireProjectFiles } from '../lib/config.js';
import { runInterviewBatch } from '../lib/interview-engine.js';
import { writeInterviewRun } from '../lib/reporter.js';
import {
  assertValid,
  validateInterviewConfig,
  validateJtbdConfig,
  validatePersonaConfig,
  validateProjectConfig,
} from '../lib/schema.js';
import { startSpinner, printInfo, printSuccess, printWarning } from '../lib/ui.js';

async function runInterview(options) {
  const state = requireProjectFiles();

  assertValid('project.yaml', validateProjectConfig(state.project));
  assertValid('jtbd.yaml', validateJtbdConfig(state.jtbd));
  assertValid('personas.yaml', validatePersonaConfig(state.personas));

  if (!state.personas.personas.length) {
    throw new Error('No personas found. Run `auto-jobs generate-personas` first.');
  }

  const interviews = options.questions
    ? readYamlFile(options.questions)
    : state.interviews;

  assertValid('interviews.yaml', validateInterviewConfig(interviews));

  if (options.depth && options.depth !== 'standard') {
    printWarning('Depth flags beyond standard are planned later. Running the Phase 1 interview flow.');
  }

  const spinner = startSpinner('Running simulated interviews');
  const interviewRun = runInterviewBatch({
    project: state.project,
    personas: state.personas.personas,
    interviews,
    filters: {
      personaId: options.persona,
      archetype: options.archetype,
    },
  });
  const output = writeInterviewRun({
    root: state.paths.root,
    project: state.project,
    interviewRun,
  });

  spinner.succeed(`Interview run complete: ${output.runId}`);
  printInfo(`Report: ${output.reportPath}`);
  printSuccess(`Transcripts written to ${output.runDir}/transcripts`);
}

export function registerInterviewCommand(program) {
  program
    .command('interview')
    .description('Run automated customer development interviews')
    .option('--persona <personaId>', 'Run a single persona by id')
    .option('--archetype <archetype>', 'Run all personas for one archetype', 'all')
    .option('--questions <path>', 'Use a custom interview config file')
    .option('--depth <depth>', 'Interview depth setting', 'standard')
    .action(runInterview);
}
