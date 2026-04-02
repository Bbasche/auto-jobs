function validateArray(value, label, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array.`);
    return [];
  }

  return value;
}

function validateSetupSteps(steps, label, errors) {
  if (!steps) {
    return;
  }

  if (!Array.isArray(steps)) {
    errors.push(`${label} must be an array when provided.`);
    return;
  }

  const validActions = ['goto', 'click', 'fill', 'select', 'upload', 'press', 'assert', 'wait', 'check', 'uncheck', 'hover'];

  steps.forEach((step, index) => {
    if (!step?.action || !validActions.includes(step.action)) {
      errors.push(`${label}[${index}].action must be one of: ${validActions.join(', ')}.`);
      return;
    }

    if (['click', 'fill', 'select', 'upload', 'check', 'uncheck'].includes(step.action)) {
      if (!(step.selector || step.label || step.placeholder || (step.role && step.name) || step.text)) {
        errors.push(`${label}[${index}] needs a selector, label, placeholder, role+name, or text locator.`);
      }
    }

    if (step.action === 'goto' && !(step.url || step.value)) {
      errors.push(`${label}[${index}] must include url or value for goto actions.`);
    }

    if (['fill', 'select', 'press'].includes(step.action) && step.value === undefined && !Array.isArray(step.values)) {
      errors.push(`${label}[${index}] must include value or values for ${step.action} actions.`);
    }

    if (step.action === 'upload' && !(step.path || Array.isArray(step.paths) || step.value)) {
      errors.push(`${label}[${index}] must include path, paths, or value for upload actions.`);
    }
  });
}

export function validateProjectConfig(project) {
  const errors = [];

  if (!project?.name) {
    errors.push('project.name is required.');
  }

  if (!project?.description) {
    errors.push('project.description is required.');
  }

  if (!project?.target_market) {
    errors.push('project.target_market is required.');
  }

  validateArray(project?.context_files ?? [], 'project.context_files', errors);
  validateArray(project?.competitors ?? [], 'project.competitors', errors);
  validateArray(project?.key_questions ?? [], 'project.key_questions', errors);
  validateArray(project?.key_outcomes ?? [], 'project.key_outcomes', errors);

  if (project?.ai?.harness) {
    const primary = project.ai.harness.primary;
    const secondary = project.ai.harness.secondary;
    const orchestration = project.ai.harness.orchestration;
    const timeoutMs = Number(project.ai.harness.timeout_ms);

    if (primary && !['codex', 'claude'].includes(primary)) {
      errors.push('project.ai.harness.primary must be "codex" or "claude".');
    }

    if (secondary && !['codex', 'claude'].includes(secondary)) {
      errors.push('project.ai.harness.secondary must be "codex" or "claude".');
    }

    if (orchestration && !['single', 'consensus'].includes(orchestration)) {
      errors.push('project.ai.harness.orchestration must be "single" or "consensus".');
    }

    if (project.ai.harness.timeout_ms !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) {
      errors.push('project.ai.harness.timeout_ms must be a positive number.');
    }
  }

  if (project?.browser?.runner && !['deterministic-http', 'playwright-agent', 'chrome-devtools-agent'].includes(project.browser.runner)) {
    errors.push('project.browser.runner must be "deterministic-http", "playwright-agent", or "chrome-devtools-agent".');
  }

  if (project?.browser?.cdp_url !== undefined && typeof project.browser.cdp_url !== 'string') {
    errors.push('project.browser.cdp_url must be a string when provided.');
  }

  if (project?.ai?.subagents) {
    if (project.ai.subagents.execution && !['sequential', 'parallel'].includes(project.ai.subagents.execution)) {
      errors.push('project.ai.subagents.execution must be "sequential" or "parallel".');
    }

    const maxReviewers = Number(project.ai.subagents.max_reviewers);
    if (project.ai.subagents.max_reviewers !== undefined && (!Number.isFinite(maxReviewers) || maxReviewers < 1)) {
      errors.push('project.ai.subagents.max_reviewers must be a positive number.');
    }
  }

  return errors;
}

export function validateJtbdConfig(jtbd) {
  const errors = [];
  const actors = validateArray(jtbd?.actors, 'jtbd.actors', errors);
  const stages = validateArray(jtbd?.stages, 'jtbd.stages', errors);
  const jobs = validateArray(jtbd?.jobs, 'jtbd.jobs', errors);

  actors.forEach((actor, index) => {
    if (!actor?.id || !actor?.name) {
      errors.push(`jtbd.actors[${index}] must include id and name.`);
    }
  });

  stages.forEach((stage, index) => {
    if (!stage?.id || !stage?.name) {
      errors.push(`jtbd.stages[${index}] must include id and name.`);
    }
  });

  jobs.forEach((job, index) => {
    if (!job?.id || !job?.actor || !job?.stage || !job?.title) {
      errors.push(`jtbd.jobs[${index}] must include id, actor, stage, and title.`);
    }

    if (!Array.isArray(job?.desired_outcomes)) {
      errors.push(`jtbd.jobs[${index}].desired_outcomes must be an array.`);
    }
  });

  return errors;
}

export function validatePersonaConfig(personaConfig) {
  const errors = [];
  const personas = validateArray(personaConfig?.personas, 'personas.personas', errors);

  personas.forEach((persona, index) => {
    if (!persona?.id || !persona?.name || !persona?.archetype) {
      errors.push(`personas.personas[${index}] must include id, name, and archetype.`);
    }
  });

  return errors;
}

export function validateInterviewConfig(interviews) {
  const errors = [];

  if (!interviews?.framework) {
    errors.push('interviews.framework is required.');
  }

  const questions = validateArray(interviews?.questions, 'interviews.questions', errors);

  questions.forEach((question, index) => {
    if (!question?.id || !question?.prompt) {
      errors.push(`interviews.questions[${index}] must include id and prompt.`);
    }
  });

  return errors;
}

export function validateScenarioConfig(scenarios) {
  const errors = [];
  const scenarioList = validateArray(scenarios?.scenarios, 'test-scenarios.scenarios', errors);

  scenarioList.forEach((scenario, index) => {
    if (!scenario?.id || !scenario?.name || !scenario?.target_job) {
      errors.push(`test-scenarios.scenarios[${index}] must include id, name, and target_job.`);
    }

    validateSetupSteps(scenario?.setup_steps, `test-scenarios.scenarios[${index}].setup_steps`, errors);
    validateSetupSteps(scenario?.journey_steps, `test-scenarios.scenarios[${index}].journey_steps`, errors);
  });

  return errors;
}

export function assertValid(label, errors) {
  if (!errors.length) {
    return;
  }

  throw new Error(`${label} validation failed:\n- ${errors.join('\n- ')}`);
}
