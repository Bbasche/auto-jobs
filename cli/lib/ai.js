import { execFile, spawn } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

function execFileAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, {
      maxBuffer: 20 * 1024 * 1024,
      ...options,
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr?.trim() || stdout?.trim() || error.message));
        return;
      }

      resolve({
        stdout,
        stderr,
      });
    });
  });
}

function spawnAsync(command, args, { cwd = process.cwd(), timeout = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill('SIGTERM');
      reject(new Error(`Process timed out after ${timeout}ms`));
    }, timeout);

    child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk) => stderrChunks.push(chunk));
    child.on('error', (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      const stdout = Buffer.concat(stdoutChunks).toString('utf-8');
      const stderr = Buffer.concat(stderrChunks).toString('utf-8');

      if (code !== 0) {
        reject(new Error(stderr.trim() || stdout.trim() || `Process exited with code ${code}`));
        return;
      }

      resolve({ stdout, stderr });
    });
    child.stdin.end('');
  });
}

export function isAiConfigured(env = process.env) {
  return Boolean(env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY || env.GEMINI_API_KEY);
}

export function resolveHarnessConfig(project) {
  return {
    primary: project?.ai?.harness?.primary || 'codex',
    secondary: project?.ai?.harness?.secondary || 'claude',
    orchestration: project?.ai?.harness?.orchestration || 'single',
    codex_model: project?.ai?.harness?.codex_model || project?.ai?.primary_model || '',
    claude_model: project?.ai?.harness?.claude_model || project?.ai?.vision_model || '',
  };
}

export async function canUseHarness(harness) {
  try {
    const { stdout } = await execFileAsync('sh', ['-lc', `command -v ${harness}`]);
    return Boolean(stdout.trim());
  } catch {
    return false;
  }
}

async function runCodexStructured({ root, prompt, schema, imagePaths = [], model = '', timeoutMs = 20000 }) {
  const tempDir = mkdtempSync(join(tmpdir(), 'auto-jobs-codex-'));
  const schemaPath = join(tempDir, 'schema.json');
  const outputPath = join(tempDir, 'output.json');

  writeFileSync(schemaPath, JSON.stringify(schema, null, 2), 'utf-8');

  const args = [
    '-a',
    'never',
    'exec',
    '--skip-git-repo-check',
    '-C',
    root,
    '--sandbox',
    'read-only',
    '--color',
    'never',
    '--output-schema',
    schemaPath,
    '-o',
    outputPath,
  ];

  if (model) {
    args.push('--model', model);
  }

  imagePaths.filter(Boolean).forEach((path) => {
    args.push('--image', path);
  });

  args.push(prompt);

  try {
    await execFileAsync('codex', args, { cwd: root, timeout: timeoutMs });
    if (!existsSync(outputPath)) {
      throw new Error('Codex completed without writing structured output.');
    }
    const content = readFileSync(outputPath, 'utf-8').trim();
    return JSON.parse(content);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function runClaudeStructured({ root, prompt, schema, imagePaths = [], model = '', timeoutMs = 20000 }) {
  const enrichedPrompt = imagePaths.length
    ? `${prompt}\n\nScreenshot files available in the workspace:\n${imagePaths.map((path) => `- ${path}`).join('\n')}\nIf direct image vision is unavailable in this mode, rely on the page summary and note any uncertainty in your reasoning.`
    : prompt;
  const args = [
    '-p',
    '--output-format',
    'json',
    '--json-schema',
    JSON.stringify(schema),
    '--add-dir',
    root,
    '--permission-mode',
    'dontAsk',
  ];

  if (model) {
    args.push('--model', model);
  }

  args.push('--', enrichedPrompt);

  const { stdout } = await spawnAsync('claude', args, { cwd: root, timeout: timeoutMs });
  const parsed = JSON.parse(stdout.trim());
  return parsed.structured_output || parsed;
}

export async function runHarnessStructured({
  harness,
  root = process.cwd(),
  prompt,
  schema,
  imagePaths = [],
  model = '',
  timeoutMs = 20000,
}) {
  if (harness === 'codex') {
    return runCodexStructured({ root, prompt, schema, imagePaths, model, timeoutMs });
  }

  if (harness === 'claude') {
    return runClaudeStructured({ root, prompt, schema, imagePaths, model, timeoutMs });
  }

  throw new Error(`Unsupported harness: ${harness}`);
}

export async function runAvailableHarnesses({
  root = process.cwd(),
  harnessConfig,
  prompt,
  schema,
  imagePaths = [],
  timeoutMs = Number(harnessConfig.timeout_ms || 20000),
}) {
  const requested = harnessConfig.orchestration === 'consensus'
    ? [harnessConfig.primary, harnessConfig.secondary].filter(Boolean)
    : [harnessConfig.primary];
  const results = [];

  for (const harness of requested) {
    if (!(await canUseHarness(harness))) {
      continue;
    }

    try {
      results.push({
        harness,
        output: await runHarnessStructured({
          harness,
          root,
          prompt,
          schema,
          imagePaths,
          model: harness === 'codex' ? harnessConfig.codex_model : harnessConfig.claude_model,
          timeoutMs,
        }),
      });
    } catch (error) {
      results.push({
        harness,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

export async function generateText({ root = process.cwd(), harness = 'codex', prompt }) {
  const schema = {
    type: 'object',
    properties: {
      text: {
        type: 'string',
      },
    },
    required: ['text'],
    additionalProperties: false,
  };
  const output = await runHarnessStructured({
    harness,
    root,
    prompt,
    schema,
  });

  return output.text;
}
