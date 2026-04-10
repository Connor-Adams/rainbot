export type StatsSectionId =
  | 'summary'
  | 'commands'
  | 'sounds'
  | 'users'
  | 'guilds'
  | 'queue'
  | 'time'
  | 'history'
  | 'sessions'
  | 'performance'
  | 'errors'
  | 'retention'
  | 'search'
  | 'user-sessions'
  | 'user-tracks'
  | 'engagement'
  | 'interactions'
  | 'playback-states'
  | 'web-analytics'
  | 'guild-events'
  | 'api-latency';

const ALL_IDS: StatsSectionId[] = [
  'summary',
  'commands',
  'sounds',
  'users',
  'guilds',
  'queue',
  'time',
  'history',
  'sessions',
  'performance',
  'errors',
  'retention',
  'search',
  'user-sessions',
  'user-tracks',
  'engagement',
  'interactions',
  'playback-states',
  'web-analytics',
  'guild-events',
  'api-latency',
];

const ID_SET = new Set<string>(ALL_IDS);

export function isStatsSectionId(value: string): value is StatsSectionId {
  return ID_SET.has(value);
}

export type StatsNavGroup = { label: string; sections: { id: StatsSectionId; label: string }[] };

export const STATS_NAV_GROUPS: StatsNavGroup[] = [
  {
    label: 'Overview',
    sections: [{ id: 'summary', label: 'Summary' }],
  },
  {
    label: 'Usage',
    sections: [
      { id: 'commands', label: 'Commands' },
      { id: 'sounds', label: 'Sounds' },
      { id: 'users', label: 'Users' },
      { id: 'guilds', label: 'Guilds' },
      { id: 'queue', label: 'Queue' },
      { id: 'search', label: 'Search' },
    ],
  },
  {
    label: 'Sessions & history',
    sections: [
      { id: 'sessions', label: 'Sessions' },
      { id: 'user-sessions', label: 'User sessions' },
      { id: 'history', label: 'History' },
      { id: 'retention', label: 'Retention' },
    ],
  },
  {
    label: 'Playback',
    sections: [
      { id: 'time', label: 'Time trends' },
      { id: 'playback-states', label: 'Playback states' },
      { id: 'user-tracks', label: 'User tracks' },
    ],
  },
  {
    label: 'System',
    sections: [
      { id: 'performance', label: 'Performance' },
      { id: 'errors', label: 'Errors' },
      { id: 'api-latency', label: 'API latency' },
      { id: 'interactions', label: 'Interactions' },
      { id: 'engagement', label: 'Engagement' },
    ],
  },
  {
    label: 'Web & events',
    sections: [
      { id: 'web-analytics', label: 'Web analytics' },
      { id: 'guild-events', label: 'Guild events' },
    ],
  },
];
