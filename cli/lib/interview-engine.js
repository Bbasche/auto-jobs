import { renderBullets } from './helpers.js';

function selectPersonas(personas, { personaId, archetype }) {
  if (personaId) {
    const match = personas.find((persona) => persona.id === personaId);

    if (!match) {
      throw new Error(`Unknown persona: ${personaId}`);
    }

    return [match];
  }

  if (archetype && archetype !== 'all') {
    const matches = personas.filter(
      (persona) => persona.archetype.toLowerCase() === archetype.toLowerCase() || persona.id === archetype,
    );

    if (!matches.length) {
      throw new Error(`No personas found for archetype: ${archetype}`);
    }

    return matches;
  }

  return personas;
}

function answerQuestion(persona, question, project) {
  const lower = question.toLowerCase();
  const firstJob = persona.primary_jobs[0] || 'make progress quickly';
  const firstFrustration = persona.frustrations[0] || 'extra manual work';
  const currentTools = persona.demographics.current_tools.join(', ');

  if (lower.includes('today') || lower.includes('current process') || lower.includes('handle this job')) {
    return `I usually piece this together with ${currentTools}. I am trying to ${firstJob}, but the process still feels more manual than I want.`;
  }

  if (lower.includes('trigger') || lower.includes('look for a new way')) {
    return `I start looking for a new option when ${firstFrustration.toLowerCase()} starts slowing me down or making me second-guess the work.`;
  }

  if (lower.includes('frustrating') || lower.includes('pain')) {
    return `The hardest part is ${firstFrustration.toLowerCase()}. My patience is ${persona.behavioral_traits.patience}, so if I hit that kind of friction more than once I start looking for a shortcut.`;
  }

  if (lower.includes('trust')) {
    return `I would trust a new product faster if it was clear, predictable, and showed me exactly what happens next. If I have to guess, I back off.`;
  }

  if (lower.includes('ideal') || lower.includes('feel like')) {
    return `In an ideal version, I would know where to start, finish the important step quickly, and feel confident that the result actually moved me forward.`;
  }

  if (lower.includes('working') || lower.includes('success')) {
    return `I judge success by whether I can ${firstJob.toLowerCase()} with less backtracking, less explanation, and less time spent checking my own work.`;
  }

  return `From my perspective as ${persona.name}, I want tools that help me ${firstJob.toLowerCase()} without piling on extra reading or setup.`;
}

function inferLatentNeeds(transcripts) {
  const frustrations = transcripts.flatMap((transcript) => transcript.persona.frustrations || []);
  const unique = [...new Set(frustrations)];

  return unique.slice(0, 5).map((frustration) => `Users need relief from: ${frustration}`);
}

function inferValidationSignals(transcripts) {
  const jobs = transcripts.flatMap((transcript) => transcript.persona.primary_jobs || []);
  const unique = [...new Set(jobs)];

  return unique.slice(0, 5).map((job) => `Repeated demand for workflows that help users ${job.toLowerCase()}`);
}

function inferSurprises(transcripts) {
  const traits = transcripts.map((transcript) => transcript.persona.behavioral_traits);
  const surprises = [];

  if (traits.some((trait) => trait.reading_propensity === 'skims')) {
    surprises.push('Skimming behavior means dense explanatory copy is easy to miss.');
  }

  if (traits.some((trait) => trait.patience === 'low')) {
    surprises.push('Low-patience personas abandon ambiguous steps quickly, especially before first value.');
  }

  if (traits.some((trait) => trait.exploration_style === 'goal-directed')) {
    surprises.push('Goal-directed personas ignore side routes unless the core path is unmistakably clear.');
  }

  return surprises.length ? surprises : ['No major surprises surfaced beyond the current JTBD map.'];
}

function inferJtbdUpdates(transcripts) {
  const updates = new Set();

  transcripts.forEach((transcript) => {
    const pain = transcript.persona.frustrations[0] || 'manual friction';
    updates.add(`Expand the JTBD map for ${transcript.persona.archetype} to capture pain around ${pain.toLowerCase()}.`);
  });

  return [...updates].slice(0, 5);
}

function inferFeatureRecommendations(transcripts) {
  return transcripts.slice(0, 5).map((transcript, index) => ({
    feature: index === 0 ? 'Clear first-step guidance' : `Reduce friction around ${transcript.persona.primary_jobs[0].toLowerCase()}`,
    priority: index < 2 ? 'high' : 'medium',
    job_addressed: transcript.persona.primary_jobs[0],
    personas: transcript.persona.name,
  }));
}

function buildExecutiveSummary(transcripts, project) {
  const personaCount = transcripts.length;
  const lowPatienceCount = transcripts.filter((transcript) => transcript.persona.behavioral_traits.patience === 'low').length;

  return [
    `${personaCount} simulated interview(s) were run against ${project.name}.`,
    `${lowPatienceCount} persona(s) showed low tolerance for unclear onboarding, and nearly every interview reinforced the importance of reaching value quickly.`,
    'Across the batch, the strongest themes were speed to confidence, clarity of next steps, and reducing manual verification.',
  ].join(' ');
}

export function runInterviewBatch({ project, personas, interviews, filters = {} }) {
  const selectedPersonas = selectPersonas(personas, filters);

  if (!selectedPersonas.length) {
    throw new Error('No personas available for interviews. Run `auto-jobs generate-personas` first.');
  }

  const transcripts = selectedPersonas.map((persona) => {
    const exchanges = interviews.questions.flatMap((question) => [
      {
        role: 'interviewer',
        content: question.prompt,
      },
      {
        role: 'persona',
        content: answerQuestion(persona, question.prompt, project),
      },
    ]);

    return {
      persona,
      exchanges,
    };
  });

  return {
    transcripts,
    synthesis: {
      executive_summary: buildExecutiveSummary(transcripts, project),
      latent_needs: inferLatentNeeds(transcripts),
      validation_signals: inferValidationSignals(transcripts),
      surprise_findings: inferSurprises(transcripts),
      recommended_jtbd_updates: inferJtbdUpdates(transcripts),
      recommended_features: inferFeatureRecommendations(transcripts),
      recommended_bug_fixes: [
        'Tighten the primary path so users do not need to infer what happens next.',
        'Reduce copy density in key activation moments.',
      ],
    },
    metadata: {
      framework: interviews.framework,
      persona_count: selectedPersonas.length,
      model: 'deterministic-phase-1',
      transcript_count: transcripts.length,
      transcript_personas: renderBullets(selectedPersonas.map((persona) => persona.id)),
    },
  };
}
