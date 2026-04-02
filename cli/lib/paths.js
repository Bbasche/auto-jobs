import { mkdirSync } from 'fs';
import { join, resolve } from 'path';

export function getProjectPaths(root = process.cwd()) {
  const cwd = resolve(root);

  return {
    root: cwd,
    cliDir: join(cwd, 'cli'),
    configDir: join(cwd, 'config'),
    runsDir: join(cwd, 'runs'),
    scoresDir: join(cwd, 'scores'),
    templatesDir: join(cwd, 'templates'),
    dashboardDir: join(cwd, 'dashboard'),
    projectConfigPath: join(cwd, 'config', 'project.yaml'),
    jtbdConfigPath: join(cwd, 'config', 'jtbd.yaml'),
    personasConfigPath: join(cwd, 'config', 'personas.yaml'),
    interviewsConfigPath: join(cwd, 'config', 'interviews.yaml'),
    scenariosConfigPath: join(cwd, 'config', 'test-scenarios.yaml'),
    scoresHistoryPath: join(cwd, 'scores', 'history.json'),
    dashboardIndexPath: join(cwd, 'dashboard', 'index.html'),
    interviewTemplatePath: join(cwd, 'templates', 'report-interview.md'),
    testTemplatePath: join(cwd, 'templates', 'report-test.md'),
  };
}

export function ensureProjectStructure(root = process.cwd()) {
  const paths = getProjectPaths(root);

  mkdirSync(paths.configDir, { recursive: true });
  mkdirSync(paths.runsDir, { recursive: true });
  mkdirSync(paths.scoresDir, { recursive: true });
  mkdirSync(paths.templatesDir, { recursive: true });
  mkdirSync(paths.dashboardDir, { recursive: true });

  return paths;
}
