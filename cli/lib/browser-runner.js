import { mkdirSync } from 'fs';
import { join } from 'path';
import { chromium } from 'playwright';
import { analyzeSnapshotWithHarnesses } from './vision.js';
import { roundNumber, slugify, uniqueStrings } from './helpers.js';
import { resolveHarnessConfig } from './ai.js';
import { extractKeywords } from './site-inspector.js';
import { createSimulationSubagent } from './subagents.js';

const ACTION_SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['click', 'stop'] },
    candidate_id: { type: ['string', 'null'] },
    rationale: { type: 'string' },
    confidence: { type: 'number' },
  },
  required: ['action', 'candidate_id', 'rationale', 'confidence'],
  additionalProperties: false,
};

function browserConfig(project, overrides = {}) {
  return {
    runner: overrides.runner || project?.browser?.runner || 'playwright-agent',
    headless: overrides.headless ?? project?.browser?.headless ?? true,
    max_steps: Number(overrides.maxSteps || project?.browser?.max_steps || 4),
    max_candidates: Number(project?.browser?.max_candidates || 12),
    channel: project?.browser?.channel || 'chrome',
    cdp_url: overrides.cdpUrl || project?.browser?.cdp_url || project?.mcp?.chrome_devtools_url || 'http://127.0.0.1:9222',
  };
}

function resolveTargetUrl(baseUrl, target = '/') {
  try {
    return new URL(target, baseUrl).toString();
  } catch {
    return baseUrl;
  }
}

function stepDescription(step) {
  return step.description || [step.action, step.label, step.placeholder, step.selector, step.text].filter(Boolean).join(' ');
}

function resolveLocator(page, step) {
  if (step.selector) {
    return page.locator(step.selector).first();
  }

  if (step.label) {
    return page.getByLabel(step.label, { exact: false }).first();
  }

  if (step.placeholder) {
    return page.getByPlaceholder(step.placeholder, { exact: false }).first();
  }

  if (step.role && step.name) {
    return page.getByRole(step.role, { name: step.name, exact: false }).first();
  }

  if (step.text) {
    return page.getByText(step.text, { exact: false }).first();
  }

  throw new Error(`Setup step is missing a locator: ${JSON.stringify(step)}`);
}

async function executeSetupSteps(page, { baseUrl, setupSteps = [] }) {
  const executed = [];

  for (const step of setupSteps) {
    const action = step.action || 'click';
    const entry = {
      action,
      target: stepDescription(step),
    };

    if (action === 'goto') {
      const targetUrl = resolveTargetUrl(baseUrl, step.url || step.value || '/');
      await page.goto(targetUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      executed.push({
        ...entry,
        url: targetUrl,
      });
      continue;
    }

    if (action === 'wait') {
      if (step.text) {
        await page.getByText(step.text, { exact: false }).first().waitFor({ timeout: step.timeout_ms || 15000 });
      } else if (step.selector) {
        await page.locator(step.selector).first().waitFor({ timeout: step.timeout_ms || 15000 });
      } else if (step.url_includes) {
        await page.waitForURL(new RegExp(step.url_includes.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), {
          timeout: step.timeout_ms || 15000,
        }).catch(() => {});
      } else {
        await page.waitForTimeout(step.timeout_ms || 1000);
      }
      executed.push(entry);
      continue;
    }

    if (action === 'press') {
      await page.keyboard.press(String(step.value || 'Enter'));
      executed.push({
        ...entry,
        value: String(step.value || 'Enter'),
      });
      continue;
    }

    if (action === 'assert') {
      if (step.text) {
        await page.getByText(step.text, { exact: false }).first().waitFor({ timeout: step.timeout_ms || 15000 });
      } else if (step.selector) {
        await page.locator(step.selector).first().waitFor({ timeout: step.timeout_ms || 15000 });
      } else if (step.url_includes) {
        await page.waitForURL(new RegExp(step.url_includes.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), {
          timeout: step.timeout_ms || 15000,
        });
      } else {
        throw new Error(`Assert step requires text, selector, or url_includes (${stepDescription(step)})`);
      }
      executed.push(entry);
      continue;
    }

    const locator = resolveLocator(page, step);

    if (action === 'fill') {
      await locator.waitFor({ timeout: step.timeout_ms || 15000 });
      await locator.fill(String(step.value ?? ''));
      executed.push({
        ...entry,
        value: String(step.value ?? ''),
      });
      continue;
    }

    if (action === 'select') {
      await locator.waitFor({ timeout: step.timeout_ms || 15000 });
      const values = Array.isArray(step.values) ? step.values.map(String) : [String(step.value ?? '')];
      await locator.selectOption(values);
      executed.push({
        ...entry,
        value: values.join(', '),
      });
      continue;
    }

    if (action === 'upload') {
      await locator.waitFor({ timeout: step.timeout_ms || 15000 });
      const paths = Array.isArray(step.values) ? step.values.map(String) : [String(step.value ?? '')];
      await locator.setInputFiles(paths);
      executed.push({
        ...entry,
        value: paths.join(', '),
      });
      continue;
    }

    if (action === 'check') {
      await locator.waitFor({ timeout: step.timeout_ms || 15000 });
      await locator.check();
      executed.push(entry);
      continue;
    }

    if (action === 'uncheck') {
      await locator.waitFor({ timeout: step.timeout_ms || 15000 });
      await locator.uncheck();
      executed.push(entry);
      continue;
    }

    if (action === 'click') {
      await locator.waitFor({ timeout: step.timeout_ms || 15000 });
      await locator.click({ timeout: step.timeout_ms || 15000 });
      if (step.wait_for_navigation !== false) {
        await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      }
      executed.push(entry);
      continue;
    }

    throw new Error(`Unsupported setup step action: ${action} (${stepDescription(step)})`);
  }

  return executed;
}

async function executeScenarioStep(page, { baseUrl, step }) {
  const action = step.action || 'click';

  if (action === 'goto') {
    await page.goto(resolveTargetUrl(baseUrl, step.url || step.value || '/'), {
      waitUntil: 'domcontentloaded',
      timeout: step.timeout_ms || 30000,
    });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    return;
  }

  if (action === 'wait') {
    if (step.text) {
      await page.getByText(step.text, { exact: false }).first().waitFor({ timeout: step.timeout_ms || 15000 });
    } else if (step.selector) {
      await page.locator(step.selector).first().waitFor({ timeout: step.timeout_ms || 15000 });
    } else if (step.url_includes) {
      await page.waitForURL((url) => url.toString().includes(step.url_includes), {
        timeout: step.timeout_ms || 15000,
      });
    } else {
      await page.waitForTimeout(step.timeout_ms || 1000);
    }
    return;
  }

  if (action === 'assert') {
    if (step.text) {
      await page.getByText(step.text, { exact: false }).first().waitFor({ timeout: step.timeout_ms || 15000 });
      return;
    }

    if (step.selector) {
      await page.locator(step.selector).first().waitFor({ timeout: step.timeout_ms || 15000 });
      return;
    }

    if (step.url_includes && !page.url().includes(step.url_includes)) {
      throw new Error(`Expected URL to include "${step.url_includes}" but found "${page.url()}"`);
    }

    return;
  }

  if (action === 'press') {
    await page.keyboard.press(step.key || step.value || 'Enter');
    if (step.wait_for_navigation) {
      await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    }
    return;
  }

  const locator = resolveLocator(page, step);
  await locator.waitFor({ timeout: step.timeout_ms || 15000 });

  if (action === 'fill') {
    await locator.fill(String(step.value ?? ''));
    if (step.submit) {
      await locator.press('Enter');
      await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    }
    return;
  }

  if (action === 'click') {
    await locator.click({ timeout: step.timeout_ms || 15000 });
    if (step.wait_for_navigation !== false) {
      await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    }
    return;
  }

  if (action === 'select') {
    const values = Array.isArray(step.values) ? step.values : [String(step.value ?? '')];
    await locator.selectOption(values);
    return;
  }

  if (action === 'upload') {
    const paths = Array.isArray(step.paths) ? step.paths : [step.path || step.value].filter(Boolean);
    await locator.setInputFiles(paths);
    return;
  }

  if (action === 'check') {
    await locator.check();
    return;
  }

  if (action === 'uncheck') {
    await locator.uncheck();
    return;
  }

  if (action === 'hover') {
    await locator.hover();
    return;
  }

  throw new Error(`Unsupported scenario step action: ${action} (${stepDescription(step)})`);
}

async function openBrowserSession(config) {
  if (config.runner === 'chrome-devtools-agent') {
    const browser = await chromium.connectOverCDP(config.cdp_url);
    const context = browser.contexts()[0] || await browser.newContext({
      viewport: { width: 1440, height: 960 },
      ignoreHTTPSErrors: true,
    });
    const existingPage = context.pages()[0] || null;
    const page = existingPage || await context.newPage();
    return {
      browser,
      context,
      page,
      attached: true,
      created_page: !existingPage,
      runner: 'chrome-devtools-agent',
    };
  }

  const browser = await chromium.launch({
    channel: config.channel,
    headless: config.headless,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  return {
    browser,
    context,
    page,
    attached: false,
    created_page: true,
    runner: 'playwright-agent',
  };
}

function buildSubagentId(role, persona, scenario, suffix = '') {
  const parts = [
    'sa',
    role,
    slugify(persona.id || persona.name || 'persona'),
    slugify(scenario.id || scenario.name || 'scenario'),
    suffix ? slugify(suffix) : '',
  ].filter(Boolean);

  return parts.join('_');
}

function buildReviewerProvenance(vision, persona, scenario) {
  const successful = (vision?.raw || []).filter((entry) => entry.output);

  if (!successful.length) {
    return [
      {
        subagent_id: buildSubagentId('reviewer', persona, scenario, 'fallback'),
        harness: 'heuristic',
        role: 'reviewer',
        status: 'fallback',
      },
    ];
  }

  return successful.map((entry) => ({
    subagent_id: buildSubagentId('reviewer', persona, scenario, entry.harness),
    harness: entry.harness,
    role: 'reviewer',
    status: 'completed',
  }));
}

async function captureObservation({
  page,
  root,
  harnessConfig,
  persona,
  scenario,
  config,
  screenshotDir,
  history,
  action,
  loadMs,
}) {
  const pageState = await extractState(page, { maxCandidates: config.max_candidates });
  const screenshotPath = join(screenshotDir, `step-${String(history.length + 1).padStart(2, '0')}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  const shouldAnalyzeVision = harnessConfig?.visionEnabled !== false;
  const vision = shouldAnalyzeVision
    ? await analyzeSnapshotWithHarnesses({
        root,
        harnessConfig,
        screenshotPath,
        persona,
        scenario,
        pageState,
      })
    : { aggregate: null, raw: [] };
  const matchedSignals = successSignals(pageState, scenario);

  history.push({
    step: history.length + 1,
    url: pageState.url,
    title: pageState.title,
    loadMs,
    screenshot_path: screenshotPath,
    page_state: pageState,
    vision,
    action,
    matched_success_criteria: matchedSignals,
    planner_subagents: action?.planner_subagents || [],
    actor_subagent: action?.actor_subagent || null,
    reviewer_subagents: buildReviewerProvenance(vision, persona, scenario),
    decision_mode: action?.decision_mode || 'scripted',
  });
}

async function extractState(page, { maxCandidates = 12 } = {}) {
  return page.evaluate(({ maxCandidates }) => {
    const isVisible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };

    document.querySelectorAll('[data-auto-jobs-candidate]').forEach((element) => {
      element.removeAttribute('data-auto-jobs-candidate');
    });

    const headings = [...document.querySelectorAll('h1,h2,h3')].map((element) => element.textContent?.trim()).filter(Boolean).slice(0, 8);
    const candidates = [...document.querySelectorAll('a[href],button,[role="button"],input[type="submit"],input[type="button"]')]
      .filter((element) => isVisible(element))
      .map((element, index) => {
        const id = `c${index + 1}`;
        element.setAttribute('data-auto-jobs-candidate', id);
        const text = (element.innerText || element.value || element.getAttribute('aria-label') || element.textContent || '').replace(/\s+/g, ' ').trim();
        return {
          id,
          tag: element.tagName.toLowerCase(),
          text,
          href: element.getAttribute('href') || '',
          role: element.getAttribute('role') || '',
        };
      })
      .filter((candidate) => candidate.text)
      .slice(0, maxCandidates);
    const inputs = [...document.querySelectorAll('input,textarea,select')]
      .filter((element) => isVisible(element))
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        type: element.getAttribute('type') || '',
        name: element.getAttribute('name') || '',
        placeholder: element.getAttribute('placeholder') || '',
      }))
      .slice(0, 10);
    const text = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();

    return {
      url: window.location.href,
      title: document.title || '',
      headings,
      candidates,
      inputs,
      visibleText: text.slice(0, 1400),
      hasNav: Boolean(document.querySelector('nav')),
      hasMain: Boolean(document.querySelector('main')),
      hasFooter: Boolean(document.querySelector('footer')),
      hasForm: Boolean(document.querySelector('form')),
      labelCount: document.querySelectorAll('label').length,
      inputCount: document.querySelectorAll('input,textarea,select').length,
      imageCount: document.querySelectorAll('img').length,
      imagesWithAlt: [...document.querySelectorAll('img')].filter((image) => image.getAttribute('alt')).length,
      wordCount: text ? text.split(/\s+/).length : 0,
      hasLang: Boolean(document.documentElement.getAttribute('lang')),
      buttons: candidates.map((candidate) => candidate.text),
      internalLinks: candidates
        .filter((candidate) => candidate.href)
        .map((candidate) => ({ href: new URL(candidate.href, window.location.href).toString(), text: candidate.text })),
      tokens: [...new Set((text.toLowerCase().match(/[a-z0-9]{3,}/g) || []).slice(0, 160))],
    };
  }, { maxCandidates });
}

function heuristicAction({ pageState, scenario, history }) {
  const alreadyClicked = new Set(history.filter((step) => step.action?.candidate_id).map((step) => step.action.candidate_id));
  const keywords = extractKeywords(scenario.name, scenario.description, scenario.success_criteria || []);
  const ranked = pageState.candidates
    .filter((candidate) => !alreadyClicked.has(candidate.id))
    .map((candidate) => {
      const haystack = `${candidate.text} ${candidate.href}`.toLowerCase();
      const score = keywords.reduce((sum, keyword) => sum + (haystack.includes(keyword) ? 2 : 0), 0)
        + (/(start|get started|sign up|try|demo|pricing|contact|support|docs|learn)/i.test(candidate.text) ? 1 : 0);
      return { candidate, score };
    })
    .sort((left, right) => right.score - left.score);

  if (!ranked.length) {
    return {
      action: 'stop',
      candidate_id: null,
      rationale: 'No visible interactive candidates remain.',
      confidence: 0.6,
    };
  }

  return {
    action: 'click',
    candidate_id: ranked[0].candidate.id,
    rationale: 'Heuristic chose the strongest visible CTA for the scenario.',
    confidence: 0.55,
  };
}

function aggregateHarnessActions(results, fallbackAction, persona, scenario) {
  const successful = results.filter((result) => result.output);

  if (!successful.length) {
    return {
      ...fallbackAction,
      decision_mode: 'fallback',
      planner_subagents: [
        {
          subagent_id: buildSubagentId('planner', persona, scenario, 'fallback'),
          harness: 'heuristic',
          role: 'planner',
          status: 'fallback',
        },
      ],
    };
  }

  if (successful.length === 1) {
    return {
      ...successful[0].output,
      decision_mode: 'single',
      planner_subagents: [
        {
          subagent_id: buildSubagentId('planner', persona, scenario, successful[0].harness),
          harness: successful[0].harness,
          role: 'planner',
          status: 'completed',
        },
      ],
    };
  }

  const votes = new Map();

  successful.forEach((result, index) => {
    const output = result.output;
    const key = `${output.action}:${output.candidate_id || 'none'}`;
    const current = votes.get(key) || {
      action: output.action,
      candidate_id: output.candidate_id,
      confidence_sum: 0,
      count: 0,
      rationales: [],
      first_index: index,
    };

    current.confidence_sum += Number(output.confidence) || 0.5;
    current.count += 1;
    current.rationales.push(`${result.harness}: ${output.rationale}`);
    votes.set(key, current);
  });

  const winner = [...votes.values()].sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }

    if (right.confidence_sum !== left.confidence_sum) {
      return right.confidence_sum - left.confidence_sum;
    }

    return left.first_index - right.first_index;
  })[0];

  return {
    action: winner.action,
    candidate_id: winner.candidate_id,
    confidence: roundNumber(winner.confidence_sum / winner.count),
    rationale: winner.rationales.join(' | '),
    decision_mode: 'consensus',
    planner_subagents: successful.map((result) => ({
      subagent_id: buildSubagentId('planner', persona, scenario, result.harness),
      harness: result.harness,
      role: 'planner',
      status: result.output ? 'completed' : 'failed',
    })),
  };
}

async function chooseAction({ root, harnessConfig, simulationSubagent, persona, scenario, pageState, history }) {
  if (pageState.candidates.length <= 2 || pageState.candidates.length > 8 || history.length >= 2) {
    return {
      ...heuristicAction({ pageState, scenario, history }),
      decision_mode: 'heuristic',
      planner_subagents: [
        {
          subagent_id: buildSubagentId('planner', persona, scenario, 'heuristic'),
          harness: 'heuristic',
          role: 'planner',
          status: 'completed',
        },
      ],
    };
  }

  const plannerPrompt = [
    'You are choosing the next browser action for a simulated user test.',
    `Simulation brief:\n${simulationSubagent.brief}`,
    `Persona: ${persona.name} (${persona.archetype})`,
    `Behavior: ${JSON.stringify(persona.behavioral_traits || {})}`,
    `Scenario: ${scenario.name}`,
    `Success criteria: ${(scenario.success_criteria || []).join(' | ')}`,
    `Current URL: ${pageState.url}`,
    `Page title: ${pageState.title}`,
    `Headings: ${pageState.headings.join(' | ')}`,
    `Visible candidates: ${pageState.candidates.map((candidate) => `${candidate.id}:${candidate.text}`).join(' | ')}`,
    `Previous actions: ${history.map((step) => step.action?.rationale || step.url).join(' | ')}`,
    'Choose one candidate to click next or stop if the persona would reasonably stop here.',
  ].join('\n');

  const { runAvailableHarnesses } = await import('./ai.js');
  const fallbackAction = heuristicAction({ pageState, scenario, history });
  const results = await runAvailableHarnesses({
    root,
    harnessConfig,
    prompt: plannerPrompt,
    schema: ACTION_SCHEMA,
    subagentType: 'planner',
  });

  return aggregateHarnessActions(results, fallbackAction, persona, scenario);
}

function successSignals(pageState, scenario) {
  const haystack = `${pageState.title} ${pageState.headings.join(' ')} ${pageState.visibleText}`.toLowerCase();
  return (scenario.success_criteria || []).filter((criterion) => {
    const criterionTokens = extractKeywords(criterion);
    return criterionTokens.some((token) => haystack.includes(token));
  });
}

export async function runPlaywrightScenario({
  root = process.cwd(),
  project,
  persona,
  scenario,
  baseUrl,
  runDir,
  overrides = {},
}) {
  const config = browserConfig(project, overrides);
  const harnessConfig = {
    ...resolveHarnessConfig(project),
    visionEnabled: project?.vision?.enabled !== false,
  };
  const simulationSubagent = createSimulationSubagent({ project, persona, scenario });
  const screenshotDir = join(runDir, 'screenshots', scenario.id, persona.id);
  mkdirSync(screenshotDir, { recursive: true });
  const actorSubagent = {
    ...simulationSubagent,
    subagent_id: simulationSubagent.id,
    harness: config.runner,
    role: 'actor',
    status: 'completed',
  };

  const { browser, context, page, attached, created_page } = await openBrowserSession(config);
  const history = [];
  const visited = [];
  const startUrl = new URL(scenario.entry_url || '/', baseUrl).toString();
  const scriptedSteps = scenario.journey_steps || [];

  try {
    let loadStartedAt = Date.now();
    await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    await executeSetupSteps(page, {
      baseUrl,
      setupSteps: scenario.setup_steps || [],
    });
    loadStartedAt = Date.now();

    if (scriptedSteps.length) {
      await captureObservation({
        page,
        root,
        harnessConfig,
        persona,
        scenario,
        config,
        screenshotDir,
        history,
        loadMs: Date.now() - loadStartedAt,
        action: {
          action: 'observe',
          candidate_id: null,
          rationale: 'Captured baseline state after setup steps.',
          confidence: 1,
          decision_mode: 'scripted',
          actor_subagent: actorSubagent,
          planner_subagents: [
            {
              subagent_id: buildSubagentId('planner', persona, scenario, 'scripted-brief'),
              harness: 'scenario',
              role: 'planner',
              status: 'completed',
            },
          ],
        },
      });

      for (const step of scriptedSteps.slice(0, config.max_steps)) {
        loadStartedAt = Date.now();
        await executeScenarioStep(page, { baseUrl, step });
        await captureObservation({
          page,
          root,
          harnessConfig,
          persona,
          scenario,
          config,
          screenshotDir,
          history,
          loadMs: Date.now() - loadStartedAt,
          action: {
            action: step.action || 'click',
            candidate_id: step.selector || step.label || step.text || null,
            rationale: step.description || `Executed scripted step: ${stepDescription(step)}`,
            confidence: 1,
            decision_mode: 'scripted',
            actor_subagent: actorSubagent,
            planner_subagents: [
              {
                subagent_id: buildSubagentId('planner', persona, scenario, 'scripted-brief'),
                harness: 'scenario',
                role: 'planner',
                status: 'completed',
              },
            ],
          },
        });
      }
    } else {
      for (let stepIndex = 0; stepIndex < config.max_steps; stepIndex += 1) {
        const pageState = await extractState(page, { maxCandidates: config.max_candidates });
        const loadMs = Date.now() - loadStartedAt;
        const screenshotPath = join(screenshotDir, `step-${String(stepIndex + 1).padStart(2, '0')}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });

        const shouldAnalyzeVision = project?.vision?.enabled !== false
          && stepIndex < Number(project?.vision?.max_snapshots || 2);
        const vision = shouldAnalyzeVision
          ? await analyzeSnapshotWithHarnesses({
              root,
              harnessConfig,
              screenshotPath,
              persona,
              scenario,
              pageState,
            })
          : { aggregate: null, raw: [] };
        const action = await chooseAction({
          root,
          harnessConfig,
          simulationSubagent,
          persona,
          scenario,
          pageState,
          history,
        });
        const matchedSignals = successSignals(pageState, scenario);

        history.push({
          step: stepIndex + 1,
          url: pageState.url,
          title: pageState.title,
          loadMs,
          screenshot_path: screenshotPath,
          page_state: pageState,
          vision,
          action: {
            ...action,
            actor_subagent: actorSubagent,
          },
          matched_success_criteria: matchedSignals,
          planner_subagents: action.planner_subagents || [],
          actor_subagent: actorSubagent,
          reviewer_subagents: buildReviewerProvenance(vision, persona, scenario),
          decision_mode: action.decision_mode || 'heuristic',
        });
        visited.push(pageState.url);

        if (action.action === 'stop' || !action.candidate_id) {
          break;
        }

        const locator = page.locator(`[data-auto-jobs-candidate="${action.candidate_id}"]`).first();
        const candidateExists = await locator.count();

        if (!candidateExists) {
          break;
        }

        loadStartedAt = Date.now();
        await locator.click({ timeout: 5000 }).catch(async () => {
          await locator.evaluate((element) => element.scrollIntoView({ block: 'center' }));
          await locator.click({ timeout: 5000 });
        });
        await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      }
    }
  } finally {
    if (attached && created_page) {
      await page.close().catch(() => {});
    } else if (!attached) {
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
    }
  }

  const uniqueVisited = uniqueStrings(history.map((step) => step.url));
  const pages = history.map((step) => ({
    ok: true,
    status: 200,
    url: step.url,
    title: step.page_state.title,
    description: '',
    headings: step.page_state.headings,
    buttons: step.page_state.buttons,
    links: step.page_state.internalLinks,
    internalLinks: step.page_state.internalLinks,
    wordCount: step.page_state.wordCount,
    hasNav: step.page_state.hasNav,
    hasMain: step.page_state.hasMain,
    hasFooter: step.page_state.hasFooter,
    hasForm: step.page_state.hasForm,
    hasLang: step.page_state.hasLang,
    labelCount: step.page_state.labelCount,
    inputCount: step.page_state.inputCount,
    imageCount: step.page_state.imageCount,
    imagesWithAlt: step.page_state.imagesWithAlt,
    loadMs: step.loadMs,
    tokens: step.page_state.tokens,
  }));
  const matchedSignals = uniqueStrings(history.flatMap((step) => step.matched_success_criteria));

  return {
    runner: config.runner,
    entryUrl: startUrl,
    simulation_subagent: simulationSubagent,
    pages,
    steps: history,
    screenshots: history.map((step) => step.screenshot_path),
    subagents: history.flatMap((step) => [
      ...(step.planner_subagents || []),
      ...(step.reviewer_subagents || []),
      ...(step.actor_subagent ? [step.actor_subagent] : []),
    ]),
    summary: {
      crawledPages: uniqueVisited.length,
      successfulPages: uniqueVisited.length,
      averageLoadMs: roundNumber(history.reduce((sum, step) => sum + step.loadMs, 0) / Math.max(history.length, 1), 0),
      averageWordCount: roundNumber(history.reduce((sum, step) => sum + step.page_state.wordCount, 0) / Math.max(history.length, 1), 0),
      totalButtons: history.reduce((sum, step) => sum + step.page_state.buttons.length, 0),
      totalForms: history.filter((step) => step.page_state.hasForm).length,
      totalInternalLinks: history.reduce((sum, step) => sum + step.page_state.internalLinks.length, 0),
      totalSteps: history.length,
      successSignalCount: matchedSignals.length,
      completed: matchedSignals.length >= Math.max(1, Math.ceil((scenario.success_criteria || []).length / 2)),
    },
    vision: {
      analyses: history
        .map((step) => ({
          step: step.step,
          screenshot_path: step.screenshot_path,
          aggregate: step.vision.aggregate,
          raw: step.vision.raw,
        }))
        .filter((analysis) => analysis.aggregate),
    },
  };
}
