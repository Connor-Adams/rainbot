'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.createWorkerServer = createWorkerServer;
const express_1 = __importDefault(require('express'));
/**
 * Creates a standard Express server for a worker bot, with health endpoints and JSON body parsing.
 * Usage: import { createWorkerServer } from 'utils/workerServer';
 */
function createWorkerServer({ healthReady, readyInfo, port, onStart }) {
  const app = (0, express_1.default)();
  app.use(express_1.default.json());
  // /health/live endpoint (plain text OK)
  app.get('/health/live', (_req, res) => {
    res.status(200).type('text/plain').send('OK');
  });
  // /health/ready endpoint (JSON, 200 if ready, 503 if not)
  app.get('/health/ready', async (_req, res) => {
    let ready = true;
    if (healthReady) {
      try {
        ready = await healthReady();
      } catch {
        ready = false;
      }
    }
    res.status(ready ? 200 : 503).json({
      status: ready ? 'ok' : 'starting',
      uptime: process.uptime(),
      ...((readyInfo && readyInfo()) || {}),
      timestamp: Date.now(),
    });
  });
  // Start server
  app.listen(port, () => {
    console.log(`[WorkerServer] Listening on port ${port}`);
    if (onStart) onStart(app);
  });
  return app;
}
//# sourceMappingURL=workerServer.js.map
