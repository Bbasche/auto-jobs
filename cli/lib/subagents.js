import { slugify } from './helpers.js';

function personaTraits(persona) {
  const traits = persona.behavioral_traits || {};
  const demographics = persona.demographics || {};

  return [
    `patience=${traits.patience || 'medium'}`,
    `exploration=${traits.exploration_style || 'balanced'}`,
    `reading=${traits.reading_propensity || 'selective'}`,
    `tech=${demographics.tech_comfort || 'moderate'}`,
    `business_size=${demographics.business_size || 'unknown'}`,
  ].join(', ');
}

export function createSimulationSubagent({ project, persona, scenario }) {
  const id = `sa_${slugify(persona.id)}_${slugify(scenario.id)}`;
  const goals = [
    scenario.name,
    ...(scenario.success_criteria || []),
  ].filter(Boolean);

  const brief = [
    `You are ${persona.name}, a simulated ${persona.archetype}.`,
    `Product: ${project.name}.`,
    `Scenario: ${scenario.name}.`,
    `Primary jobs: ${(persona.primary_jobs || []).join(' | ') || 'Reach the intended outcome quickly.'}`,
    `Frustrations: ${(persona.frustrations || []).join(' | ') || 'Unclear steps and extra manual work.'}`,
    `Traits: ${personaTraits(persona)}.`,
    `Success criteria: ${goals.join(' | ') || 'Reach first value without confusion.'}`,
    'Act like a focused user, not a QA engineer. Prefer the path you would naturally take.',
  ].join('\n');

  return {
    id,
    harness: project?.ai?.harness?.primary || 'codex',
    persona_id: persona.id,
    scenario_id: scenario.id,
    name: `${persona.name} - ${scenario.name}`,
    brief,
    goals,
  };
}
