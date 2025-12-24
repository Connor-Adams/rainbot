import { useState } from 'react'
import StatsSummary from './components/StatsSummary'
import CommandsStats from './components/CommandsStats'
import SoundsStats from './components/SoundsStats'
import UsersStats from './components/UsersStats'
import GuildsStats from './components/GuildsStats'
import QueueStats from './components/QueueStats'
import TimeStats from './components/TimeStats'
import HistoryStats from './components/HistoryStats'
import SessionsStats from './components/SessionsStats'
import PerformanceStats from './components/PerformanceStats'
import ErrorsStats from './components/ErrorsStats'
import RetentionStats from './components/RetentionStats'

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

export default function StatisticsTab() {
  const [activeTab, setActiveTab] = useState<StatsTab>('summary')

  return (
    <section className="panel stats-panel bg-gray-800 rounded-2xl border border-gray-700 p-8">
      <div className="stats-header mb-6">
        <h2 className="text-2xl font-bold text-white mb-4">Statistics Dashboard</h2>
        <div className="stats-tabs flex gap-2 flex-wrap">
          <button
            className={`stats-tab-btn px-4 py-2 ${activeTab === 'summary' ? 'active' : ''}`}
            onClick={() => setActiveTab('summary')}
          >
            Summary
          </button>
          <button
            className={`stats-tab-btn px-4 py-2 ${activeTab === 'commands' ? 'active' : ''}`}
            onClick={() => setActiveTab('commands')}
          >
            Commands
          </button>
          <button
            className={`stats-tab-btn px-4 py-2 ${activeTab === 'sounds' ? 'active' : ''}`}
            onClick={() => setActiveTab('sounds')}
          >
            Sounds
          </button>
          <button
            className={`stats-tab-btn px-4 py-2 ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            Users
          </button>
          <button
            className={`stats-tab-btn px-4 py-2 ${activeTab === 'guilds' ? 'active' : ''}`}
            onClick={() => setActiveTab('guilds')}
          >
            Guilds
          </button>
          <button
            className={`stats-tab-btn px-4 py-2 ${activeTab === 'queue' ? 'active' : ''}`}
            onClick={() => setActiveTab('queue')}
          >
            Queue
          </button>
          <button
            className={`stats-tab-btn px-4 py-2 ${activeTab === 'time' ? 'active' : ''}`}
            onClick={() => setActiveTab('time')}
          >
            Time Trends
          </button>
          <button
            className={`stats-tab-btn px-4 py-2 ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            History
          </button>
          <button
            className={`stats-tab-btn px-4 py-2 ${activeTab === 'sessions' ? 'active' : ''}`}
            onClick={() => setActiveTab('sessions')}
          >
            Sessions
          </button>
          <button
            className={`stats-tab-btn px-4 py-2 ${activeTab === 'performance' ? 'active' : ''}`}
            onClick={() => setActiveTab('performance')}
          >
            Performance
          </button>
          <button
            className={`stats-tab-btn px-4 py-2 ${activeTab === 'errors' ? 'active' : ''}`}
            onClick={() => setActiveTab('errors')}
          >
            Errors
          </button>
          <button
            className={`stats-tab-btn px-4 py-2 ${activeTab === 'retention' ? 'active' : ''}`}
            onClick={() => setActiveTab('retention')}
          >
            Retention
          </button>
        </div>
      </div>
      <div id="stats-content" className="space-y-6">
        {activeTab === 'summary' && <StatsSummary />}
        {activeTab === 'commands' && <CommandsStats />}
        {activeTab === 'sounds' && <SoundsStats />}
        {activeTab === 'users' && <UsersStats />}
        {activeTab === 'guilds' && <GuildsStats />}
        {activeTab === 'queue' && <QueueStats />}
        {activeTab === 'time' && <TimeStats />}
        {activeTab === 'history' && <HistoryStats />}
        {activeTab === 'sessions' && <SessionsStats />}
        {activeTab === 'performance' && <PerformanceStats />}
        {activeTab === 'errors' && <ErrorsStats />}
        {activeTab === 'retention' && <RetentionStats />}
      </div>
    </section>
  )
}
