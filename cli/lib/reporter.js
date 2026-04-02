import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getProjectPaths } from './paths.js';
import {
  createRunId,
  formatDateTime,
  interpolateTemplate,
  renderBullets,
  renderTable,
  roundNumber,
} from './helpers.js';
import { writeJsonFile } from './config.js';
import { summarizeDimensionTable } from './scorer.js';

function resolveRunDir(baseDir) {
  if (!existsSync(baseDir)) {
    return baseDir;
  }

  let suffix = 2;
  let candidate = `${baseDir}-${suffix}`;

  while (existsSync(candidate)) {
    suffix += 1;
    candidate = `${baseDir}-${suffix}`;
  }

  return candidate;
}

function buildTranscriptMarkdown(transcript) {
  const lines = [`# Interview Transcript - ${transcript.persona.name}`, '', `- Persona ID: ${transcript.persona.id}`, `- Archetype: ${transcript.persona.archetype}`, ''];

  transcript.exchanges.forEach((exchange) => {
    const heading = exchange.role === 'interviewer' ? 'Interviewer' : transcript.persona.name;
    lines.push(`## ${heading}`);
    lines.push(exchange.content);
    lines.push('');
  });

  return lines.join('\n');
}

function buildFeatureTable(features) {
  return renderTable(
    ['Feature', 'Priority', 'Job Addressed', 'Personas Who Need It'],
    features.map((feature) => [feature.feature, feature.priority, feature.job_addressed, feature.personas]),
  );
}

export function writeInterviewRun({ root = process.cwd(), project, interviewRun }) {
  const paths = getProjectPaths(root);
  const runId = createRunId();
  const runDir = resolveRunDir(join(paths.runsDir, `${runId}-interview`));
  const transcriptsDir = join(runDir, 'transcripts');
  const reportPath = join(runDir, 'report.md');

  mkdirSync(transcriptsDir, { recursive: true });

  const transcriptPaths = interviewRun.transcripts.map((transcript) => {
    const filePath = join(transcriptsDir, `${transcript.persona.id}.md`);
    writeFileSync(filePath, `${buildTranscriptMarkdown(transcript)}\n`, 'utf-8');
    return {
      persona: transcript.persona,
      filePath,
    };
  });

  const template = readFileSync(paths.interviewTemplatePath, 'utf-8');
  const report = interpolateTemplate(template, {
    date: formatDateTime(new Date()),
    persona_count: interviewRun.metadata.persona_count,
    framework: interviewRun.metadata.framework,
    model: interviewRun.metadata.model,
    executive_summary: interviewRun.synthesis.executive_summary,
    latent_needs: renderBullets(interviewRun.synthesis.latent_needs),
    validation_signals: renderBullets(interviewRun.synthesis.validation_signals),
    surprise_findings: renderBullets(interviewRun.synthesis.surprise_findings),
    recommended_jtbd_updates: renderBullets(interviewRun.synthesis.recommended_jtbd_updates),
    recommended_features: buildFeatureTable(interviewRun.synthesis.recommended_features),
    recommended_bug_fixes: renderBullets(interviewRun.synthesis.recommended_bug_fixes),
    transcript_links: renderBullets(
      transcriptPaths.map(({ persona, filePath }) => `${persona.name} (${persona.id}) - ${filePath}`),
    ),
  });

  writeFileSync(reportPath, `${report}\n`, 'utf-8');

  const manifest = {
    id: runId,
    type: 'interview',
    created_at: new Date().toISOString(),
    project_name: project.name,
    framework: interviewRun.metadata.framework,
    persona_count: interviewRun.metadata.persona_count,
    personas: interviewRun.transcripts.map((transcript) => transcript.persona.id),
    report_path: reportPath,
  };

  writeJsonFile(join(runDir, 'manifest.json'), manifest);

  return {
    runId,
    runDir,
    reportPath,
    manifest,
  };
}

function buildRecommendationTable(recommendations) {
  return renderTable(
    ['Change', 'Type', 'Priority', 'JTBD Impact', 'Personas Affected'],
    recommendations.map((recommendation) => [
      recommendation.change,
      recommendation.type,
      recommendation.priority,
      recommendation.jtbd_impact,
      recommendation.personas_affected,
    ]),
  );
}

function buildOutcomeTable(outcomes) {
  return renderTable(
    ['Outcome', 'Importance', 'Addressability', 'Gap'],
    outcomes.map((outcome) => [
      outcome.statement,
      String(outcome.importance),
      `${outcome.addressability}/10`,
      String(outcome.gap),
    ]),
  );
}

function buildPersonaScoreTable(personaScores) {
  return renderTable(
    ['Persona', 'Overall', 'Scenarios'],
    Object.entries(personaScores).map(([personaId, data]) => [personaId, `${data.overall}/10`, data.scenarios.join(', ')]),
  );
}

export function writeTestRun({
  root = process.cwd(),
  project,
  testRun,
  previousRun = null,
  runId: providedRunId = null,
  runDir: providedRunDir = null,
}) {
  const paths = getProjectPaths(root);
  const runId = providedRunId || createRunId();
  const runDir = providedRunDir || resolveRunDir(join(paths.runsDir, `${runId}-test`));
  const reportPath = join(runDir, 'report.md');
  const scoresPath = join(runDir, 'scores.json');
  const analysisPath = join(runDir, 'analysis.json');

  mkdirSync(runDir, { recursive: true });
  writeJsonFile(scoresPath, {
    dimensions: testRun.dimensions,
    overall: testRun.overall,
    outcomes: testRun.outcomes,
    persona_scores: testRun.persona_scores,
    scenario_scores: testRun.scenario_scores,
  });
  writeJsonFile(analysisPath, {
    metadata: testRun.metadata,
    results: testRun.results,
    surfaces: testRun.surfaces,
    surface_details: testRun.surface_details || testRun.surfaces,
  });

  const template = readFileSync(paths.testTemplatePath, 'utf-8');
  const delta = previousRun?.overall ? roundNumber(testRun.overall - previousRun.overall) : null;
  const report = interpolateTemplate(template, {
    date: formatDateTime(new Date()),
    persona_count: testRun.metadata.persona_count,
    scenarios: Object.values(testRun.scenario_scores)
      .map((scenario) => scenario.name)
      .join(', '),
    url: testRun.metadata.target_url,
    sha: testRun.metadata.git_sha || 'n/a',
    executive_summary: testRun.executive_summary,
    scores: [
      `### Overall: ${testRun.overall}/10${delta === null ? '' : ` (${delta >= 0 ? '+' : ''}${delta} from last run)`}`,
      '',
      summarizeDimensionTable(testRun.dimensions, previousRun?.dimensions || null),
      '',
      '### JTBD Outcome Scores',
      '',
      buildOutcomeTable(testRun.outcomes),
      '',
      '### Per-Persona Breakdown',
      '',
      buildPersonaScoreTable(testRun.persona_scores),
    ].join('\n'),
    critical_issues: renderBullets(testRun.critical_issues),
    friction_points: renderBullets(testRun.friction_points),
    jtbd_gap_analysis: renderBullets(
      testRun.outcomes
      .filter((outcome) => outcome.gap > 2)
        .map((outcome) => `${outcome.statement} still shows a gap of ${outcome.gap}.`),
    ),
    recommendations: buildRecommendationTable(testRun.recommendations),
    screenshots: renderBullets(
      uniqueScreenshotPaths(testRun).map((path) => path),
      'No screenshots captured.',
    ),
  });

  writeFileSync(reportPath, `${report}\n`, 'utf-8');

  const manifest = {
    id: runId,
    type: 'test',
    created_at: new Date().toISOString(),
    project_name: project.name,
    persona_count: testRun.metadata.persona_count,
    scenario_count: testRun.metadata.scenario_count,
    target_url: testRun.metadata.target_url,
    git_sha: testRun.metadata.git_sha,
    git_tag: testRun.metadata.git_tag,
    overall: testRun.overall,
    dimensions: testRun.dimensions,
    outcomes: testRun.outcomes,
    report_path: reportPath,
    scores_path: scoresPath,
  };

  writeJsonFile(join(runDir, 'manifest.json'), manifest);

  return {
    runId,
    runDir,
    reportPath,
    scoresPath,
    manifest,
  };
}

function uniqueScreenshotPaths(testRun) {
  return [...new Set(
    [
      ...testRun.results.flatMap((result) => result.evidence?.screenshot_paths || []),
      ...testRun.surfaces.flatMap((surface) => surface.screenshots || []),
    ],
  )];
}
