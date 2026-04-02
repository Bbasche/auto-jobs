import { buildDashboard, startDashboardServer } from '../lib/dashboard-view.js';
import { printInfo, printSuccess } from '../lib/ui.js';

export function registerDashboardCommand(program) {
  program
    .command('dashboard')
    .description('Launch the local dashboard UI')
    .option('--port <port>', 'Port to serve the dashboard on', '4040')
    .option('--build-only', 'Generate the dashboard HTML without starting a server')
    .action(async (options) => {
      const output = buildDashboard();
      printSuccess(`Dashboard HTML written to ${output.htmlPath}`);

      if (options.buildOnly) {
        return;
      }

      const port = Number(options.port) || 4040;
      const server = await startDashboardServer({ port });
      printInfo(`Dashboard available at http://localhost:${port}`);
      printInfo('Press Ctrl+C to stop the server.');

      const shutdown = () => {
        server.close(() => process.exit(0));
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    });
}
