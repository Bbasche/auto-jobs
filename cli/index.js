#!/usr/bin/env node
// Auto-Jobs CLI - Simulate your users.

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { registerInitCommand } from './commands/init.js';
import { registerGeneratePersonasCommand } from './commands/generate-personas.js';
import { registerInterviewCommand } from './commands/interview.js';
import { registerReportCommand } from './commands/report.js';
import { registerScoreCommand } from './commands/score.js';
import { registerTestCommand } from './commands/test.js';
import { registerDashboardCommand } from './commands/dashboard.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));

const program = new Command();

program
  .name('auto-jobs')
  .description('Simulate your users - automated JTBD-grounded user testing and customer development')
  .version(pkg.version);

registerInitCommand(program);
registerGeneratePersonasCommand(program);
registerInterviewCommand(program);
registerReportCommand(program);
registerScoreCommand(program);
registerTestCommand(program);
registerDashboardCommand(program);

await program.parseAsync();
