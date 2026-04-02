import { clampNumber, slugify } from './helpers.js';

const NAME_POOL = [
  'Alex',
  'Jordan',
  'Casey',
  'Taylor',
  'Morgan',
  'Riley',
  'Avery',
  'Parker',
  'Skyler',
  'Quinn',
  'Harper',
  'Rowan',
];

const TECH_COMFORT = ['low', 'moderate', 'high'];
const PATIENCE = ['low', 'medium', 'high'];
const EXPLORATION_STYLE = ['goal-directed', 'balanced', 'exploratory'];
const BUSINESS_SIZE = ['solo', 'small team', 'growing team'];
const CURRENT_SOLUTIONS = [
  ['spreadsheets', 'notes'],
  ['email', 'documents'],
  ['legacy software', 'manual follow-up'],
  ['chat tools', 'shared trackers'],
];
const READING_PROPENSITY = ['skims', 'selective', 'detailed'];
const LOCATIONS = ['New York, USA', 'Austin, USA', 'London, UK', 'Cape Town, South Africa', 'Toronto, Canada'];

function rotate(list, index, pinnedValue = null) {
  if (pinnedValue && list.includes(pinnedValue)) {
    return pinnedValue;
  }

  return list[index % list.length];
}

function buildVariationMap(index, vary = []) {
  const pinned = new Map();
  const lower = new Set(vary.map((value) => String(value).trim().toLowerCase()).filter(Boolean));

  if (lower.has('tech_comfort')) {
    pinned.set('tech_comfort', TECH_COMFORT[index % TECH_COMFORT.length]);
  }

  if (lower.has('patience')) {
    pinned.set('patience', PATIENCE[index % PATIENCE.length]);
  }

  if (lower.has('exploration_style')) {
    pinned.set('exploration_style', EXPLORATION_STYLE[index % EXPLORATION_STYLE.length]);
  }

  if (lower.has('business_size')) {
    pinned.set('business_size', BUSINESS_SIZE[index % BUSINESS_SIZE.length]);
  }

  if (lower.has('reading_propensity')) {
    pinned.set('reading_propensity', READING_PROPENSITY[index % READING_PROPENSITY.length]);
  }

  return pinned;
}

function buildContextWindow({ persona, actorName, projectDescription }) {
  const explorationArticle = /^[aeiou]/i.test(persona.behavioral_traits.exploration_style) ? 'an' : 'a';

  return [
    `${persona.name} fits the ${actorName} archetype.`,
    `They are using a ${persona.demographics.business_size} workflow and currently rely on ${persona.demographics.current_tools.join(', ')}.`,
    `Their main goal is to ${persona.primary_jobs[0] || 'make progress efficiently'}.`,
    `They have ${persona.behavioral_traits.patience} patience, ${explorationArticle} ${persona.behavioral_traits.exploration_style} exploration style, and ${persona.behavioral_traits.reading_propensity} reading habits.`,
    `They are evaluating whether ${projectDescription || 'this product'} can help without adding more overhead.`,
  ].join(' ');
}

function derivePrimaryJobs(jtbd, actorId) {
  return jtbd.jobs
    .filter((job) => job.actor === actorId)
    .map((job) => job.title)
    .slice(0, 3);
}

function deriveFrustrations(jtbd, actorId) {
  const frustrations = jtbd.jobs
    .filter((job) => job.actor === actorId)
    .flatMap((job) => job.pain_points || []);

  return [...new Set(frustrations)].slice(0, 4);
}

function buildPersonaId(actorName, name, sequence, existingIds) {
  let index = sequence;
  let candidate = `vu_${slugify(actorName)}_${slugify(name)}_${String(index).padStart(2, '0')}`;

  while (existingIds.has(candidate)) {
    index += 1;
    candidate = `vu_${slugify(actorName)}_${slugify(name)}_${String(index).padStart(2, '0')}`;
  }

  existingIds.add(candidate);
  return candidate;
}

function actorSelectionPlan(actors, archetype, count) {
  if (archetype && archetype !== 'all') {
    const actor = actors.find((item) => item.id === archetype || item.name.toLowerCase() === archetype.toLowerCase());

    if (!actor) {
      throw new Error(`Unknown archetype: ${archetype}`);
    }

    return [{ actor, count }];
  }

  if (actors.length === 1) {
    return [{ actor: actors[0], count }];
  }

  const plan = actors.map((actor) => ({ actor, count: 0 }));

  for (let index = 0; index < count; index += 1) {
    plan[index % plan.length].count += 1;
  }

  return plan.filter((entry) => entry.count > 0);
}

export function generatePersonas({
  project,
  jtbd,
  count = 3,
  archetype = 'all',
  vary = [],
  existingPersonas = [],
}) {
  const actorPlans = actorSelectionPlan(jtbd.actors, archetype, clampNumber(Number(count) || 1, 1, 50));
  const existingIds = new Set(existingPersonas.map((persona) => persona.id));
  const personas = [];
  let generatedSoFar = 0;

  actorPlans.forEach(({ actor, count: actorCount }) => {
    const primaryJobs = derivePrimaryJobs(jtbd, actor.id);
    const frustrations = deriveFrustrations(jtbd, actor.id);

    for (let index = 0; index < actorCount; index += 1) {
      const globalIndex = generatedSoFar + index;
      const traitMap = buildVariationMap(globalIndex, vary);
      const name = NAME_POOL[globalIndex % NAME_POOL.length];
      const techComfort = rotate(TECH_COMFORT, globalIndex, traitMap.get('tech_comfort'));
      const patience = rotate(PATIENCE, globalIndex + 1, traitMap.get('patience'));
      const explorationStyle = rotate(EXPLORATION_STYLE, globalIndex + 2, traitMap.get('exploration_style'));
      const businessSize = rotate(BUSINESS_SIZE, globalIndex, traitMap.get('business_size'));
      const currentTools = CURRENT_SOLUTIONS[globalIndex % CURRENT_SOLUTIONS.length];
      const readingPropensity = rotate(READING_PROPENSITY, globalIndex + 1, traitMap.get('reading_propensity'));
      const id = buildPersonaId(actor.name, name, index + 1, existingIds);

      const persona = {
        id,
        name,
        archetype: actor.name,
        demographics: {
          age: 27 + ((globalIndex * 5) % 19),
          location: LOCATIONS[globalIndex % LOCATIONS.length],
          business: actor.name,
          business_size: businessSize,
          tech_comfort: techComfort,
          current_tools: currentTools,
        },
        primary_jobs: primaryJobs.length ? primaryJobs : ['make progress with less friction'],
        frustrations: frustrations.length ? frustrations : ['Too much manual work', 'Unclear onboarding'],
        context_window: '',
        behavioral_traits: {
          patience,
          exploration_style: explorationStyle,
          error_tolerance: patience === 'low' ? 'low' : 'moderate',
          reading_propensity: readingPropensity,
        },
        source: 'generated',
        generated_at: new Date().toISOString(),
      };

      persona.context_window = buildContextWindow({
        persona,
        actorName: actor.name,
        projectDescription: project.description,
      });

      personas.push(persona);
    }

    generatedSoFar += actorCount;
  });

  return personas;
}

export function mergePersonas(existingConfig, newPersonas) {
  return {
    personas: [...(existingConfig?.personas || []), ...newPersonas],
  };
}

export function summarizePersonaBatch(personas) {
  const archetypes = [...new Set(personas.map((persona) => persona.archetype))];
  return `${personas.length} persona(s) across ${archetypes.length} archetype(s): ${archetypes.join(', ')}`;
}
