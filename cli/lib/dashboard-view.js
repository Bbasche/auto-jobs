import { createServer } from 'http';
import { readFileSync, writeFileSync } from 'fs';
import { getProjectPaths } from './paths.js';
import { escapeHtml, formatDateTime } from './helpers.js';
import { listRuns, loadProjectFiles, readRunManifest } from './config.js';

function latestScore(history) {
  const numericRuns = (history?.runs || []).filter((run) => typeof run.overall === 'number');
  return numericRuns[numericRuns.length - 1] || null;
}

function buildDashboardData(root = process.cwd()) {
  const state = loadProjectFiles(root);
  const manifests = listRuns(root).map((run) => ({
    name: run.name,
    manifest: readRunManifest(run.path),
  }));

  return {
    project: state.project,
    jtbd: state.jtbd,
    history: state.scoresHistory,
    latestScore: latestScore(state.scoresHistory),
    runs: manifests,
    generatedAt: new Date().toISOString(),
  };
}

export function renderDashboardHtml(data) {
  const payload = JSON.stringify(data);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(data.project?.name || 'Auto-Jobs Dashboard')}</title>
    <style>
      :root {
        --bg: #efe5d6;
        --panel: #fffaf1;
        --ink: #1f1e1b;
        --muted: #655e57;
        --accent: #ba5d2c;
        --accent-2: #245f73;
        --line: rgba(31, 30, 27, 0.12);
        --good: #1f7a4d;
        --warn: #af7a1f;
        --bad: #a6402b;
      }

      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Iowan Old Style", "Palatino Linotype", Georgia, serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(36, 95, 115, 0.12), transparent 30%),
          radial-gradient(circle at top right, rgba(186, 93, 44, 0.15), transparent 25%),
          linear-gradient(180deg, #efe5d6 0%, #f7f0e6 100%);
      }

      .shell {
        width: min(1180px, calc(100% - 32px));
        margin: 24px auto 48px;
      }

      .hero, .panel {
        background: rgba(255, 250, 241, 0.85);
        border: 1px solid var(--line);
        border-radius: 24px;
        box-shadow: 0 20px 50px rgba(31, 30, 27, 0.08);
        backdrop-filter: blur(8px);
      }

      .hero {
        padding: 28px;
        display: grid;
        gap: 24px;
      }

      .eyebrow {
        text-transform: uppercase;
        letter-spacing: 0.16em;
        font-size: 0.78rem;
        color: var(--muted);
      }

      h1, h2, h3, h4 {
        margin: 0;
        font-weight: 600;
        line-height: 1;
      }

      h1 {
        font-size: clamp(2.4rem, 7vw, 4.8rem);
      }

      p {
        margin: 0;
        color: var(--muted);
        line-height: 1.6;
      }

      .stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 14px;
      }

      .stat {
        padding: 18px;
        border-radius: 18px;
        background: linear-gradient(180deg, rgba(255,255,255,0.75), rgba(255,255,255,0.45));
        border: 1px solid var(--line);
      }

      .stat strong {
        display: block;
        font-size: 1.9rem;
        margin-top: 8px;
      }

      .grid {
        display: grid;
        grid-template-columns: 1.3fr 1fr;
        gap: 20px;
        margin-top: 20px;
      }

      .panel-wide {
        margin-top: 20px;
      }

      .panel {
        padding: 22px;
      }

      .section-title {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 16px;
      }

      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .chip {
        border-radius: 999px;
        padding: 8px 12px;
        font-size: 0.88rem;
        background: rgba(36, 95, 115, 0.08);
        color: var(--accent-2);
      }

      .trend {
        display: grid;
        gap: 10px;
      }

      .bar {
        display: grid;
        grid-template-columns: 118px 1fr 56px;
        align-items: center;
        gap: 12px;
        font-size: 0.92rem;
      }

      .track {
        height: 12px;
        border-radius: 999px;
        background: rgba(31, 30, 27, 0.08);
        overflow: hidden;
      }

      .fill {
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, var(--accent-2), var(--accent));
      }

      .jtbd-scroll {
        overflow-x: auto;
        padding-bottom: 6px;
      }

      .jtbd-table {
        width: 100%;
        min-width: 980px;
        border-collapse: separate;
        border-spacing: 10px;
        table-layout: fixed;
      }

      .jtbd-table th,
      .jtbd-table td {
        width: auto;
      }

      .jtbd-label, .jtbd-stage, .jtbd-card {
        border: 1px solid var(--line);
        border-radius: 16px;
        padding: 12px;
        background: rgba(255, 255, 255, 0.62);
        vertical-align: top;
      }

      .jtbd-stage {
        font-size: 0.9rem;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        text-align: center;
        min-height: 56px;
        line-height: 1.2;
        white-space: normal;
      }

      .jtbd-card h4 {
        font-size: 1rem;
        margin-bottom: 8px;
        line-height: 1.2;
        overflow-wrap: anywhere;
      }

      .jtbd-card p,
      .jtbd-label p {
        overflow-wrap: anywhere;
      }

      .jtbd-card ul, .run-list, .issue-list {
        padding: 0;
        margin: 0;
        list-style: none;
      }

      .jtbd-card li, .run-item, .issue-item {
        padding: 10px 0;
        border-top: 1px solid rgba(31, 30, 27, 0.08);
      }

      .jtbd-card li:first-child, .run-item:first-child, .issue-item:first-child {
        border-top: 0;
        padding-top: 0;
      }

      .run-item strong {
        display: block;
        margin-bottom: 6px;
      }

      .muted {
        color: var(--muted);
      }

      .good { color: var(--good); }
      .warn { color: var(--warn); }
      .bad { color: var(--bad); }

      @media (max-width: 900px) {
        .grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <section class="hero">
        <div>
          <div class="eyebrow">Auto-Jobs Dashboard</div>
          <h1>${escapeHtml(data.project?.name || 'Untitled Project')}</h1>
        </div>
        <p>${escapeHtml(data.project?.description || 'No project description yet.')}</p>
        <div class="stats" id="stats"></div>
      </section>

      <section class="panel panel-wide">
        <div class="section-title">
          <h2>JTBD Map</h2>
          <span class="muted">Actors x stages</span>
        </div>
        <div id="jtbd-map"></div>
      </section>

      <div class="grid">
        <section class="panel">
          <div class="section-title">
            <h2>Score History</h2>
            <span class="muted">Generated ${escapeHtml(formatDateTime(data.generatedAt))}</span>
          </div>
          <div id="score-history" class="trend"></div>
        </section>
      </div>

      <div class="grid">
        <section class="panel">
          <div class="section-title">
            <h2>Recent Runs</h2>
            <span class="muted">Reports and manifests</span>
          </div>
          <ul id="runs" class="run-list"></ul>
        </section>

        <section class="panel">
          <div class="section-title">
            <h2>JTBD Outcome Gaps</h2>
            <span class="muted">Latest scored run</span>
          </div>
          <ul id="issues" class="issue-list"></ul>
        </section>
      </div>
    </div>

    <script>
      const data = ${payload};

      function badgeClass(score) {
        if (score >= 7) return 'good';
        if (score >= 5.5) return 'warn';
        return 'bad';
      }

      function renderStats() {
        const stats = [
          ['Actors', data.jtbd?.actors?.length || 0],
          ['Stages', data.jtbd?.stages?.length || 0],
          ['Jobs', data.jtbd?.jobs?.length || 0],
          ['Latest Score', data.latestScore?.overall ? data.latestScore.overall + '/10' : 'n/a'],
        ];

        document.getElementById('stats').innerHTML = stats.map(([label, value]) => \`
          <article class="stat">
            <span class="eyebrow">\${label}</span>
            <strong>\${value}</strong>
          </article>
        \`).join('');
      }

      function renderJTBDMap() {
        const root = document.getElementById('jtbd-map');
        const stages = [...(data.jtbd?.stages || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
        const actors = data.jtbd?.actors || [];
        const jobs = data.jtbd?.jobs || [];
        const actorColumnWidth = 240;
        const stageColumnWidth = 220;
        const tableMinWidth = actorColumnWidth + (stageColumnWidth * stages.length);

        root.innerHTML = \`
          <div class="jtbd-scroll">
            <table class="jtbd-table" style="min-width: \${tableMinWidth}px;">
              <colgroup>
                <col style="width: \${actorColumnWidth}px;" />
                \${stages.map(() => \`<col style="width: \${stageColumnWidth}px;" />\`).join('')}
              </colgroup>
              <thead>
                <tr>
                  <th class="jtbd-label muted">Actor</th>
                  \${stages.map((stage) => \`<th class="jtbd-stage">\${stage.name}</th>\`).join('')}
                </tr>
              </thead>
              <tbody>
                \${actors.map((actor) => \`
                  <tr>
                    <td class="jtbd-label">
                      <strong>\${actor.name}</strong>
                      <p>\${actor.description || ''}</p>
                    </td>
                    \${stages.map((stage) => {
                      const cellJobs = jobs.filter((job) => job.actor === actor.id && job.stage === stage.id);
                      if (!cellJobs.length) {
                        return '<td class="jtbd-card muted">No mapped job yet.</td>';
                      }

                      return \`<td class="jtbd-card">
                        \${cellJobs.map((job) => \`
                          <div>
                            <h4>\${job.title}</h4>
                            <p>\${job.description || ''}</p>
                          </div>
                        \`).join('<hr style="border:none;border-top:1px solid rgba(31,30,27,0.08);margin:10px 0;" />')}
                      </td>\`;
                    }).join('')}
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          </div>
        \`;
      }

      function renderScoreHistory() {
        const root = document.getElementById('score-history');
        const runs = (data.history?.runs || []).filter((run) => typeof run.overall === 'number');

        if (!runs.length) {
          root.innerHTML = '<p class="muted">No scored test runs yet.</p>';
          return;
        }

        root.innerHTML = runs.slice(-8).reverse().map((run) => \`
          <div class="bar">
            <span>\${run.id}</span>
            <div class="track"><div class="fill" style="width:\${Math.max(8, run.overall * 10)}%"></div></div>
            <strong class="\${badgeClass(run.overall)}">\${run.overall}/10</strong>
          </div>
        \`).join('');
      }

      function renderRuns() {
        const root = document.getElementById('runs');
        const runs = data.runs || [];

        if (!runs.length) {
          root.innerHTML = '<li class="run-item muted">No runs yet.</li>';
          return;
        }

        root.innerHTML = runs.slice(0, 10).map(({ name, manifest }) => \`
          <li class="run-item">
            <strong>\${name}</strong>
            <div class="chips">
              <span class="chip">\${manifest?.type || 'unknown'}</span>
              <span class="chip">\${manifest?.persona_count || 0} personas</span>
              \${manifest?.overall ? \`<span class="chip \${badgeClass(manifest.overall)}">\${manifest.overall}/10</span>\` : ''}
            </div>
            <p>\${manifest?.report_path || 'No report path recorded.'}</p>
          </li>
        \`).join('');
      }

      function renderOutcomeGaps() {
        const root = document.getElementById('issues');
        const latest = data.latestScore;
        const outcomes = latest?.outcomes || [];

        if (!outcomes.length) {
          root.innerHTML = '<li class="issue-item muted">No outcome scores available yet.</li>';
          return;
        }

        root.innerHTML = outcomes
          .sort((a, b) => (b.gap || 0) - (a.gap || 0))
          .slice(0, 8)
          .map((outcome) => \`
            <li class="issue-item">
              <strong>\${outcome.statement}</strong>
              <span class="\${badgeClass(10 - (outcome.gap || 0))}">Gap \${outcome.gap}</span>
            </li>
          \`)
          .join('');
      }

      renderStats();
      renderJTBDMap();
      renderScoreHistory();
      renderRuns();
      renderOutcomeGaps();
    </script>
  </body>
</html>`;
}

export function buildDashboard(root = process.cwd()) {
  const paths = getProjectPaths(root);
  const data = buildDashboardData(root);
  const html = renderDashboardHtml(data);

  writeFileSync(paths.dashboardIndexPath, html, 'utf-8');

  return {
    data,
    htmlPath: paths.dashboardIndexPath,
  };
}

export function startDashboardServer({ root = process.cwd(), port = 4040 }) {
  const paths = getProjectPaths(root);
  const server = createServer((request, response) => {
    if (request.url === '/' || request.url === '/index.html') {
      const html = readFileSync(paths.dashboardIndexPath, 'utf-8');
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(html);
      return;
    }

    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => resolve(server));
  });
}
