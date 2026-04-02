import { requireProjectFiles } from '../lib/config.js';
import { asciiSparkline, renderTable, roundNumber } from '../lib/helpers.js';
import { printInfo, printWarning } from '../lib/ui.js';

function compareRuns(runs, leftId, rightId) {
  const left = runs.find((run) => run.id === leftId);
  const right = runs.find((run) => run.id === rightId);

  if (!left || !right) {
    throw new Error('Both compared run ids must exist in scores/history.json.');
  }

  printInfo(`Comparing ${left.id} to ${right.id}`);
  printInfo(`Overall: ${left.overall ?? 'n/a'} -> ${right.overall ?? 'n/a'}`);
  if (left.dimensions && right.dimensions) {
    console.log(
      renderTable(
        ['Dimension', left.id, right.id, 'Delta'],
        Object.keys(right.dimensions).map((key) => [
          key,
          `${left.dimensions[key]}/10`,
          `${right.dimensions[key]}/10`,
          `${roundNumber((right.dimensions[key] || 0) - (left.dimensions[key] || 0))}`,
        ]),
      ),
    );
  }
}

export function registerScoreCommand(program) {
  program
    .command('score')
    .description('View and compare scores over time')
    .option('--history', 'Show score history')
    .option('--dimension <dimension>', 'Show a specific dimension trend or "all"')
    .option('--export <format>', 'Export score history as csv')
    .option('--compare <runIds...>', 'Compare two run ids')
    .action((options) => {
      const state = requireProjectFiles();
      const runs = state.scoresHistory?.runs || [];

      if (!runs.length) {
        printWarning('No scored test runs yet. Phase 1 currently focuses on init, personas, interviews, and reports.');
        return;
      }

      if (options.compare?.length === 2) {
        compareRuns(runs, options.compare[0], options.compare[1]);
        return;
      }

      const numericRuns = runs.filter((run) => typeof run.overall === 'number');

      if (options.export === 'csv') {
        const headers = ['id', 'type', 'overall', ...Object.keys(numericRuns[0]?.dimensions || {})];
        const rows = numericRuns.map((run) =>
          [run.id, run.type, run.overall, ...headers.slice(3).map((header) => run.dimensions?.[header] ?? '')].join(','),
        );
        console.log([headers.join(','), ...rows].join('\n'));
        return;
      }

      if (options.history) {
        printInfo(`History: ${asciiSparkline(numericRuns.map((run) => run.overall))}`);
        numericRuns.forEach((run) => {
          console.log(`${run.id} | ${run.type} | ${run.overall}/10`);
        });

        if (options.dimension && options.dimension !== 'all') {
          const points = numericRuns.map((run) => run.dimensions?.[options.dimension]).filter((value) => typeof value === 'number');
          if (points.length) {
            printInfo(`${options.dimension}: ${asciiSparkline(points)}`);
          }
        }
        return;
      }

      const latest = numericRuns[numericRuns.length - 1];

      if (!latest) {
        printWarning('No numeric scores are stored yet.');
        return;
      }

      printInfo(`Latest scored run: ${latest.id}`);
      printInfo(`Overall score: ${latest.overall}/10`);
      if (latest.dimensions) {
        console.log(
          renderTable(
            ['Dimension', 'Score'],
            Object.entries(latest.dimensions).map(([key, value]) => [key, `${value}/10`]),
          ),
        );
      }
    });
}
