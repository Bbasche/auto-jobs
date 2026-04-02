import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { requireProjectFiles, writeJsonFile } from '../lib/config.js';
import { writeTestRun } from '../lib/reporter.js';
import { runTestBatch } from '../lib/test-engine.js';
import {
  assertValid,
  validateJtbdConfig,
  validatePersonaConfig,
  validateProjectConfig,
  validateScenarioConfig,
} from '../lib/schema.js';
import { createRunId } from '../lib/helpers.js';
import { printInfo, printWarning, startSpinner } from '../lib/ui.js';

export function registerTestCommand(program) {
  program
    .command('test')
    .description('Run simulated user tests')
    .option('--scenario <scenarioId>', 'Run a specific scenario by id')
    .option('--persona <personaId>', 'Run a specific persona by id')
    .option('--url <url>', 'Override the configured target URL')
    .option('--browser <browser>', 'Preferred browser adapter (currently informational only)', 'deterministic-http')
    .option('--runner <runner>', 'Browser runner: playwright-agent, chrome-devtools-agent, or deterministic-http')
    .option('--record', 'Reserved for future session recording support')
    .option('--vision <provider>', 'Reserved for future vision-provider selection')
    .option('--harness <harness>', 'Primary harness: codex or claude')
    .option('--secondary-harness <harness>', 'Secondary harness for consensus analysis')
    .option('--orchestration <mode>', 'Harness orchestration: single or consensus')
    .option('--cdp-url <url>', 'CDP endpoint for chrome-devtools-agent, e.g. http://127.0.0.1:9222')
    .option('--subagents', 'Enable explicit planner/reviewer subagent metadata')
    .option('--subagent-execution <mode>', 'Subagent execution: sequential or parallel')
    .option('--max-reviewers <count>', 'Maximum reviewer subagents to consult')
    .option('--headed', 'Run the Playwright browser visibly instead of headless')
    .option('--ci', 'Emit machine-readable summary for CI')
    .option('--threshold <threshold>', 'Minimum acceptable overall score')
    .option('--exit-code', 'Set a failing exit code when the threshold is not met')
    .action(async (options) => {
      const state = requireProjectFiles();

      assertValid('project.yaml', validateProjectConfig(state.project));
      assertValid('jtbd.yaml', validateJtbdConfig(state.jtbd));
      assertValid('personas.yaml', validatePersonaConfig(state.personas));
      assertValid('test-scenarios.yaml', validateScenarioConfig(state.scenarios));

      const targetUrl = options.url || state.project.url;

      if (!targetUrl) {
        throw new Error('No target URL configured. Set project.url or pass `--url`.');
      }

      if (options.record) {
        printWarning('Session video recording is not implemented yet, but screenshots and browser steps will be persisted.');
      }

      if (options.vision) {
        printWarning('Vision provider selection is controlled through harness config. Continuing with the configured harnesses.');
      }

      const runner = options.runner || state.project?.browser?.runner || 'playwright-agent';

      if (options.browser && options.browser !== 'deterministic-http' && !options.runner) {
        printWarning(`The --browser flag is deprecated in favor of --runner. Continuing with "${runner}".`);
      }

      if (options.harness) {
        state.project.ai = state.project.ai || {};
        state.project.ai.harness = state.project.ai.harness || {};
        state.project.ai.harness.primary = options.harness;
      }

      if (options.secondaryHarness) {
        state.project.ai = state.project.ai || {};
        state.project.ai.harness = state.project.ai.harness || {};
        state.project.ai.harness.secondary = options.secondaryHarness;
      }

      if (options.orchestration) {
        state.project.ai = state.project.ai || {};
        state.project.ai.harness = state.project.ai.harness || {};
        state.project.ai.harness.orchestration = options.orchestration;
      }

      if (options.cdpUrl) {
        state.project.browser = state.project.browser || {};
        state.project.browser.cdp_url = options.cdpUrl;
      }

      if (options.subagents || options.subagentExecution || options.maxReviewers) {
        state.project.ai = state.project.ai || {};
        state.project.ai.subagents = state.project.ai.subagents || {};
      }

      if (options.subagents) {
        state.project.ai.subagents.enabled = true;
      }

      if (options.subagentExecution) {
        state.project.ai.subagents.execution = options.subagentExecution;
      }

      if (options.maxReviewers) {
        state.project.ai.subagents.max_reviewers = Number(options.maxReviewers);
      }

      const runId = createRunId();
      const runDirBase = join(state.paths.runsDir, `${runId}-test`);
      const runDir = existsSync(runDirBase) ? `${runDirBase}-${Date.now()}` : runDirBase;
      mkdirSync(runDir, { recursive: true });

      const previousRun = [...(state.scoresHistory?.runs || [])]
        .filter((run) => run.type === 'test' && typeof run.overall === 'number')
        .slice(-1)[0] || null;

      const spinner = startSpinner(`Running ${runner} simulation with ${state.project?.ai?.harness?.primary || 'codex'} as the primary harness`);
      const testRun = await runTestBatch({
        root: state.paths.root,
        project: state.project,
        jtbd: state.jtbd,
        personas: state.personas,
        scenarios: state.scenarios,
        url: targetUrl,
        filters: {
          personaId: options.persona,
          scenarioId: options.scenario,
        },
        previousRun,
        runDir,
        runnerOverride: runner,
        headlessOverride: options.headed ? false : undefined,
      });
      const output = writeTestRun({
        root: state.paths.root,
        project: state.project,
        testRun,
        previousRun,
        runId,
        runDir,
      });

      const historyEntry = {
        id: output.runId,
        type: 'test',
        timestamp: new Date().toISOString(),
        git_sha: testRun.metadata.git_sha,
        git_tag: testRun.metadata.git_tag,
        url: testRun.metadata.target_url,
        runner: testRun.metadata.runner,
        harness_primary: testRun.metadata.harness_primary,
        harness_secondary: testRun.metadata.harness_secondary,
        harness_orchestration: testRun.metadata.harness_orchestration,
        dimensions: testRun.dimensions,
        overall: testRun.overall,
        outcomes: testRun.outcomes,
        persona_scores: testRun.persona_scores,
      };

      writeJsonFile(state.paths.scoresHistoryPath, {
        runs: [...(state.scoresHistory?.runs || []), historyEntry],
      });
      spinner.succeed(`Test run complete: ${output.runId}`);

      printInfo(`Overall score: ${testRun.overall}/10`);
      printInfo(`Report: ${output.reportPath}`);
      printInfo(`Runner: ${testRun.metadata.runner}`);

      if (options.ci) {
        console.log(
          JSON.stringify(
            {
              id: output.runId,
              overall: testRun.overall,
              threshold: options.threshold ? Number(options.threshold) : null,
              passed: options.threshold ? testRun.overall >= Number(options.threshold) : true,
              report_path: output.reportPath,
            },
            null,
            2,
          ),
        );
      }

      if (options.exitCode && options.threshold && testRun.overall < Number(options.threshold)) {
        process.exitCode = 1;
      }
    });
}
