const { spawnSync } = require('node:child_process');

const rawService =
  process.env.RAILWAY_SERVICE_NAME ||
  process.env.RAILWAY_SERVICE ||
  process.env.SERVICE ||
  '';

const normalized = rawService.trim().toLowerCase();

const aliases = {
  raincloud: 'raincloud',
  '@rainbot/raincloud': 'raincloud',
  'rainbot-worker': 'rainbot-worker',
  rainbot: 'rainbot-worker',
  '@rainbot/rainbot-worker': 'rainbot-worker',
  'pranjeet-worker': 'pranjeet-worker',
  pranjeet: 'pranjeet-worker',
  '@rainbot/pranjeet-worker': 'pranjeet-worker',
  'hungerbot-worker': 'hungerbot-worker',
  hungerbot: 'hungerbot-worker',
  '@rainbot/hungerbot-worker': 'hungerbot-worker',
  ui: 'ui',
  '@rainbot/ui': 'ui',
};

const service = aliases[normalized];

if (!service) {
  console.error(
    `Unknown Railway service "${rawService}". Set RAILWAY_SERVICE_NAME to one of: ` +
      `${Object.keys(aliases).join(', ')}`
  );
  process.exit(1);
}

const commands = {
  raincloud: ['node', 'apps/raincloud/index.js'],
  'rainbot-worker': ['node', 'apps/rainbot/dist/index.js'],
  'pranjeet-worker': ['node', 'apps/pranjeet/dist/index.js'],
  'hungerbot-worker': ['node', 'apps/hungerbot/dist/index.js'],
  ui: ['yarn', 'workspace', '@rainbot/ui', 'start:prod'],
};

const [command, ...args] = commands[service];
const result = spawnSync(command, args, { stdio: 'inherit' });

process.exit(result.status ?? 1);
