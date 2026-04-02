import { join } from 'path';
import { listRuns, readRunManifest } from '../lib/config.js';
import { formatDateTime } from '../lib/helpers.js';
import { printInfo, printWarning } from '../lib/ui.js';

function listRunSummaries(runs) {
  if (!runs.length) {
    printWarning('No runs found yet.');
    return;
  }

  runs.forEach((run) => {
    const manifest = readRunManifest(run.path);
    const createdAt = manifest?.created_at ? formatDateTime(manifest.created_at) : formatDateTime(run.stats.mtime);
    const type = manifest?.type || run.name.split('-').slice(-1)[0];
    const summary = manifest?.overall
      ? `${manifest.overall}/10 overall`
      : manifest?.persona_count
        ? `${manifest.persona_count} persona(s)`
        : 'No manifest summary';

    console.log(`${run.name} | ${type} | ${createdAt} | ${summary}`);
  });
}

function showLatestRun(runs) {
  if (!runs.length) {
    printWarning('No runs found yet.');
    return;
  }

  const latest = runs[0];
  const manifest = readRunManifest(latest.path);
  const reportPath = manifest?.report_path || join(latest.path, 'report.md');

  printInfo(`Latest run: ${latest.name}`);
  printInfo(`Report path: ${reportPath}`);
}

export function registerReportCommand(program) {
  program
    .command('report')
    .description('View and manage reports')
    .option('--latest', 'Show the latest report path')
    .option('--diff <runIds...>', 'Compare two run ids by manifest')
    .action((options) => {
      const runs = listRuns();

      if (options.diff?.length === 2) {
        const manifests = runs
          .map((run) => readRunManifest(run.path))
          .filter(Boolean);
        const left = manifests.find((manifest) => manifest.id === options.diff[0]);
        const right = manifests.find((manifest) => manifest.id === options.diff[1]);

        if (!left || !right) {
          throw new Error('Both run ids must exist to diff reports.');
        }

        printInfo(`Diffing ${left.id} -> ${right.id}`);
        if (typeof left.overall === 'number' && typeof right.overall === 'number') {
          printInfo(`Overall: ${left.overall}/10 -> ${right.overall}/10`);
        }
        printInfo(`Left report: ${left.report_path}`);
        printInfo(`Right report: ${right.report_path}`);
        return;
      }

      if (options.latest) {
        showLatestRun(runs);
        return;
      }

      listRunSummaries(runs);
    });
}
