import express from 'npm:express@5.2.1';
import { createLogger } from '../utils/logger.ts';
import { loadConfig } from '../utils/config.ts';
import process from 'node:process';

const log = createLogger('HTTP_UI');

const config = loadConfig();
const app = express();
const port = config.dashboardPort || 3001;

// Basic health check
app.get('/health', (_req, res) => {
  res.status(200).send('OK');
});

app.listen(port, () => {
  log.info(`UI server started on port ${port}`, { port });
});
