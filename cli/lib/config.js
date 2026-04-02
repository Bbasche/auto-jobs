import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import yaml from 'js-yaml';
import { ensureProjectStructure, getProjectPaths } from './paths.js';

export function readYamlFile(filePath, { optional = false, fallback = null } = {}) {
  if (!existsSync(filePath)) {
    if (optional) {
      return fallback;
    }

    throw new Error(`Missing required file: ${filePath}`);
  }

  const raw = readFileSync(filePath, 'utf-8').trim();

  if (!raw) {
    return fallback;
  }

  return yaml.load(raw);
}

export function writeYamlFile(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${yaml.dump(value, { noRefs: true, lineWidth: 100 })}`, 'utf-8');
}

export function readJsonFile(filePath, { optional = false, fallback = null } = {}) {
  if (!existsSync(filePath)) {
    if (optional) {
      return fallback;
    }

    throw new Error(`Missing required file: ${filePath}`);
  }

  const raw = readFileSync(filePath, 'utf-8').trim();

  if (!raw) {
    return fallback;
  }

  return JSON.parse(raw);
}

export function writeJsonFile(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

export function loadProjectFiles(root = process.cwd()) {
  const paths = ensureProjectStructure(root);

  return {
    paths,
    project: readYamlFile(paths.projectConfigPath, { optional: true, fallback: null }),
    jtbd: readYamlFile(paths.jtbdConfigPath, { optional: true, fallback: null }),
    personas: readYamlFile(paths.personasConfigPath, { optional: true, fallback: { personas: [] } }),
    interviews: readYamlFile(paths.interviewsConfigPath, { optional: true, fallback: null }),
    scenarios: readYamlFile(paths.scenariosConfigPath, { optional: true, fallback: null }),
    scoresHistory: readJsonFile(paths.scoresHistoryPath, { optional: true, fallback: { runs: [] } }),
  };
}

export function listRuns(root = process.cwd()) {
  const { runsDir } = getProjectPaths(root);

  if (!existsSync(runsDir)) {
    return [];
  }

  return readdirSync(runsDir)
    .map((entry) => {
      const path = join(runsDir, entry);
      const stats = statSync(path);

      return {
        name: entry,
        path,
        stats,
      };
    })
    .filter((entry) => entry.stats.isDirectory())
    .sort((left, right) => right.name.localeCompare(left.name));
}

export function readRunManifest(runPath) {
  return readJsonFile(join(runPath, 'manifest.json'), {
    optional: true,
    fallback: null,
  });
}

export function requireProjectFiles(root = process.cwd()) {
  const state = loadProjectFiles(root);

  if (!state.project || !state.jtbd) {
    throw new Error('Project is not initialized. Run `auto-jobs init` first.');
  }

  return state;
}
