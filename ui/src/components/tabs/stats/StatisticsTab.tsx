import { useState } from 'react';
import { Tabs } from '@connor-adams/designsystem';
import StatsSummary from './components/StatsSummary';
import CommandsStats from './components/CommandsStats';
import SoundsStats from './components/SoundsStats';
import UsersStats from './components/UsersStats';
import GuildsStats from './components/GuildsStats';
import QueueStats from './components/QueueStats';
import TimeStats from './components/TimeStats';
import HistoryStats from './components/HistoryStats';
import SessionsStats from './components/SessionsStats';
import PerformanceStats from './components/PerformanceStats';
import ErrorsStats from './components/ErrorsStats';
import RetentionStats from './components/RetentionStats';
import StatsSSE from './StatsSSE';
import SearchStats from './components/SearchStats';
import UserSessionsStats from './components/UserSessionsStats';
import UserTracksStats from './components/UserTracksStats';
import EngagementStats from './components/EngagementStats';
import InteractionsStats from './components/InteractionsStats';
import PlaybackStatesStats from './components/PlaybackStatesStats';
import WebAnalyticsStats from './components/WebAnalyticsStats';
import GuildEventsStats from './components/GuildEventsStats';
import ApiLatencyStats from './components/ApiLatencyStats';
import { StatsErrorBoundary } from '@/components/ErrorBoundary';

type StatsTab =
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

/**
 * One panel container holds whichever section is active, so every tab's
 * `aria-controls` points at that single id and the panel names itself after the
 * selected tab via `aria-labelledby`.
 */
const PANEL_ID = 'stats-content';
const tabIdFor = (tab: StatsTab) => `stats-tab-${tab}`;

const TAB_ITEMS: { value: StatsTab; label: string }[] = [
  { value: 'summary', label: 'Summary' },
  { value: 'commands', label: 'Commands' },
  { value: 'sounds', label: 'Sounds' },
  { value: 'users', label: 'Users' },
  { value: 'guilds', label: 'Guilds' },
  { value: 'queue', label: 'Queue' },
  { value: 'time', label: 'Time Trends' },
  { value: 'history', label: 'History' },
  { value: 'sessions', label: 'Sessions' },
  { value: 'performance', label: 'Performance' },
  { value: 'errors', label: 'Errors' },
  { value: 'retention', label: 'Retention' },
  { value: 'search', label: 'Search' },
  { value: 'user-sessions', label: 'User Sessions' },
  { value: 'user-tracks', label: 'User Tracks' },
  { value: 'engagement', label: 'Engagement' },
  { value: 'interactions', label: 'Interactions' },
  { value: 'playback-states', label: 'Playback States' },
  { value: 'web-analytics', label: 'Web Analytics' },
  { value: 'guild-events', label: 'Guild Events' },
  { value: 'api-latency', label: 'API Latency' },
];

const TABS = TAB_ITEMS.map((item) => ({
  ...item,
  tabId: tabIdFor(item.value),
  panelId: PANEL_ID,
}));

export default function StatisticsTab() {
  const [activeTab, setActiveTab] = useState<StatsTab>('summary');

  return (
    <section className="panel stats-panel bg-surface rounded-2xl border border-border p-4 sm:p-6">
      <StatsSSE />
      <div className="stats-header mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-text-primary mb-4">
          Statistics Dashboard
        </h2>
        {/* overflow="scroll" replaces the overflow-x-auto + ca-no-scrollbar
            wrapper these 21 pills used to need: Tabs owns the single scrolling
            row, the faded edges and pulling the selected pill into view. */}
        <Tabs
          items={TABS}
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as StatsTab)}
          overflow="scroll"
          aria-label="Statistics sections"
        />
      </div>
      <div
        id={PANEL_ID}
        role="tabpanel"
        aria-labelledby={tabIdFor(activeTab)}
        tabIndex={0}
        className="space-y-6"
      >
        <StatsErrorBoundary>
          {activeTab === 'summary' && <StatsSummary key="summary" />}
          {activeTab === 'commands' && <CommandsStats key="commands" />}
          {activeTab === 'sounds' && <SoundsStats key="sounds" />}
          {activeTab === 'users' && <UsersStats key="users" />}
          {activeTab === 'guilds' && <GuildsStats key="guilds" />}
          {activeTab === 'queue' && <QueueStats key="queue" />}
          {activeTab === 'time' && <TimeStats key="time" />}
          {activeTab === 'history' && <HistoryStats key="history" />}
          {activeTab === 'sessions' && <SessionsStats key="sessions" />}
          {activeTab === 'performance' && <PerformanceStats key="performance" />}
          {activeTab === 'errors' && <ErrorsStats key="errors" />}
          {activeTab === 'retention' && <RetentionStats key="retention" />}
          {activeTab === 'search' && <SearchStats key="search" />}
          {activeTab === 'user-sessions' && <UserSessionsStats key="user-sessions" />}
          {activeTab === 'user-tracks' && <UserTracksStats key="user-tracks" />}
          {activeTab === 'engagement' && <EngagementStats key="engagement" />}
          {activeTab === 'interactions' && <InteractionsStats key="interactions" />}
          {activeTab === 'playback-states' && <PlaybackStatesStats key="playback-states" />}
          {activeTab === 'web-analytics' && <WebAnalyticsStats key="web-analytics" />}
          {activeTab === 'guild-events' && <GuildEventsStats key="guild-events" />}
          {activeTab === 'api-latency' && <ApiLatencyStats key="api-latency" />}
        </StatsErrorBoundary>
      </div>
    </section>
  );
}
