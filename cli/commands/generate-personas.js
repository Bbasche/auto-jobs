import { mergePersonas, generatePersonas, summarizePersonaBatch } from '../lib/persona-engine.js';
import { requireProjectFiles, writeYamlFile } from '../lib/config.js';
import { assertValid, validateJtbdConfig, validatePersonaConfig, validateProjectConfig } from '../lib/schema.js';
import { parseCommaSeparated } from '../lib/helpers.js';
import { startSpinner, printSuccess, printInfo } from '../lib/ui.js';

async function runGeneratePersonas(options) {
  const state = requireProjectFiles();

  assertValid('project.yaml', validateProjectConfig(state.project));
  assertValid('jtbd.yaml', validateJtbdConfig(state.jtbd));
  assertValid('personas.yaml', validatePersonaConfig(state.personas));

  const spinner = startSpinner('Generating personas from JTBD data');
  const personas = generatePersonas({
    project: state.project,
    jtbd: state.jtbd,
    count: options.count,
    archetype: options.archetype,
    vary: options.vary,
    existingPersonas: state.personas.personas,
  });
  const merged = mergePersonas(state.personas, personas);

  writeYamlFile(state.paths.personasConfigPath, merged);
  spinner.succeed(`Generated ${personas.length} persona(s).`);

  printInfo(summarizePersonaBatch(personas));
  printSuccess(`Saved personas to ${state.paths.personasConfigPath}`);
}

export function registerGeneratePersonasCommand(program) {
  program
    .command('generate-personas')
    .description('Generate virtual users from JTBD')
    .option('--count <count>', 'Number of personas to generate', '5')
    .option('--archetype <archetype>', 'Actor id or name to target', 'all')
    .option('--vary <axes>', 'Comma-separated variation axes', '')
    .action(async (rawOptions) => {
      await runGeneratePersonas({
        count: Number(rawOptions.count) || 5,
        archetype: rawOptions.archetype || 'all',
        vary: parseCommaSeparated(rawOptions.vary),
      });
    });
}
