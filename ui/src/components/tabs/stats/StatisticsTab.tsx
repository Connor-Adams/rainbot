import { Navigate, useParams } from 'react-router-dom';
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
import { isStatsSectionId, type StatsSectionId } from './statsNavConfig';
import StatsSubNav from './StatsSubNav';

function StatsContent({ section }: { section: StatsSectionId }) {
  return (
    <StatsErrorBoundary>
      {section === 'summary' && <StatsSummary key="summary" />}
      {section === 'commands' && <CommandsStats key="commands" />}
      {section === 'sounds' && <SoundsStats key="sounds" />}
      {section === 'users' && <UsersStats key="users" />}
      {section === 'guilds' && <GuildsStats key="guilds" />}
      {section === 'queue' && <QueueStats key="queue" />}
      {section === 'time' && <TimeStats key="time" />}
      {section === 'history' && <HistoryStats key="history" />}
      {section === 'sessions' && <SessionsStats key="sessions" />}
      {section === 'performance' && <PerformanceStats key="performance" />}
      {section === 'errors' && <ErrorsStats key="errors" />}
      {section === 'retention' && <RetentionStats key="retention" />}
      {section === 'search' && <SearchStats key="search" />}
      {section === 'user-sessions' && <UserSessionsStats key="user-sessions" />}
      {section === 'user-tracks' && <UserTracksStats key="user-tracks" />}
      {section === 'engagement' && <EngagementStats key="engagement" />}
      {section === 'interactions' && <InteractionsStats key="interactions" />}
      {section === 'playback-states' && <PlaybackStatesStats key="playback-states" />}
      {section === 'web-analytics' && <WebAnalyticsStats key="web-analytics" />}
      {section === 'guild-events' && <GuildEventsStats key="guild-events" />}
      {section === 'api-latency' && <ApiLatencyStats key="api-latency" />}
    </StatsErrorBoundary>
  );
}

export default function StatisticsTab() {
  const { section } = useParams<{ section: string }>();

  if (!section || !isStatsSectionId(section)) {
    return <Navigate to="/stats/summary" replace />;
  }

  const activeSection: StatsSectionId = section;

  return (
    <section className="panel stats-panel surface-panel p-4 sm:p-6 animate-fade-in">
      <StatsSSE />
      <div className="mb-6">
        <h2 className="text-page-title">Statistics</h2>
        <p className="mt-1 text-sm text-text-secondary">Metrics and analytics for your bot</p>
      </div>

      <div className="flex flex-col md:flex-row gap-6 md:gap-8 lg:gap-10">
        <StatsSubNav activeSection={activeSection} />
        <div id="stats-content" className="flex-1 min-w-0 space-y-6">
          <StatsContent section={activeSection} />
        </div>
      </div>
    </section>
  );
}
