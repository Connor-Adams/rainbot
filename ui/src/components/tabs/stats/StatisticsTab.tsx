import { useEffect, useState } from 'react';
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
import { trackingApi } from '@/lib/api';

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

export default function StatisticsTab() {
  const [activeTab, setActiveTab] = useState<StatsTab>('summary');
  useEffect(() => {
    const startedAt = Date.now();

    return () => {
      const durationMs = Date.now() - startedAt;
      trackingApi
        .trackEvent({
          eventType: 'stats_tab_view',
          eventTarget: activeTab,
          durationMs,
        })
        .catch(() => {});
    };
  }, [activeTab]);

  return (
    <section className="panel stats-panel bg-surface rounded-2xl border border-border p-4 sm:p-6">
      <StatsSSE />
      <div className="stats-header mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-text-primary mb-4">
          Statistics Dashboard
        </h2>
        <div className="stats-tabs flex gap-2 overflow-x-auto no-scrollbar pb-1">
          <button
            className={tabClass('summary')}
            onClick={() => setActiveTab('summary')}
          >
            Summary
          </button>
          <button
            className={tabClass('commands')}
            onClick={() => setActiveTab('commands')}
          >
            Commands
          </button>
          <button
            className={tabClass('sounds')}
            onClick={() => setActiveTab('sounds')}
          >
            Sounds
          </button>
          <button
            className={tabClass('users')}
            onClick={() => setActiveTab('users')}
          >
            Users
          </button>
          <button
            className={tabClass('guilds')}
            onClick={() => setActiveTab('guilds')}
          >
            Guilds
          </button>
          <button
            className={tabClass('queue')}
            onClick={() => setActiveTab('queue')}
          >
            Queue
          </button>
          <button
            className={tabClass('time')}
            onClick={() => setActiveTab('time')}
          >
            Time Trends
          </button>
          <button
            className={tabClass('history')}
            onClick={() => setActiveTab('history')}
          >
            History
          </button>
          <button
            className={tabClass('sessions')}
            onClick={() => setActiveTab('sessions')}
          >
            Sessions
          </button>
          <button
            className={tabClass('performance')}
            onClick={() => setActiveTab('performance')}
          >
            Performance
          </button>
          <button
            className={tabClass('errors')}
            onClick={() => setActiveTab('errors')}
          >
            Errors
          </button>
          <button
            className={tabClass('retention')}
            onClick={() => setActiveTab('retention')}
          >
            Retention
          </button>
          <button
            className={tabClass('search')}
            onClick={() => setActiveTab('search')}
          >
            Search
          </button>
          <button
            className={tabClass('user-sessions')}
            onClick={() => setActiveTab('user-sessions')}
          >
            User Sessions
          </button>
          <button
            className={tabClass('user-tracks')}
            onClick={() => setActiveTab('user-tracks')}
          >
            User Tracks
          </button>
          <button
            className={tabClass('engagement')}
            onClick={() => setActiveTab('engagement')}
          >
            Engagement
          </button>
          <button
            className={tabClass('interactions')}
            onClick={() => setActiveTab('interactions')}
          >
            Interactions
          </button>
          <button
            className={tabClass('playback-states')}
            onClick={() => setActiveTab('playback-states')}
          >
            Playback States
          </button>
          <button
            className={tabClass('web-analytics')}
            onClick={() => setActiveTab('web-analytics')}
          >
            Web Analytics
          </button>
          <button
            className={tabClass('guild-events')}
            onClick={() => setActiveTab('guild-events')}
          >
            Guild Events
          </button>
          <button
            className={tabClass('api-latency')}
            onClick={() => setActiveTab('api-latency')}
          >
            API Latency
          </button>
        </div>
      </div>
      <div id="stats-content" className="space-y-6">
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
