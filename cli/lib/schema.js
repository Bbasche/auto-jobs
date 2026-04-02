function validateArray(value, label, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array.`);
    return [];
  }

  return value;
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

  if (project?.browser?.runner && !['deterministic-http', 'playwright-agent'].includes(project.browser.runner)) {
    errors.push('project.browser.runner must be "deterministic-http" or "playwright-agent".');
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
  });

  return errors;
}

export function assertValid(label, errors) {
  if (!errors.length) {
    return;
  }

  throw new Error(`${label} validation failed:\n- ${errors.join('\n- ')}`);
}
