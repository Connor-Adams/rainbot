import { useState } from 'react'
import StatsSummary from './stats/components/StatsSummary'
import CommandsStats from './stats/components/CommandsStats'
import SoundsStats from './stats/components/SoundsStats'
import UsersStats from '../stats/UsersStats'
import UserSoundsStats from '../stats/UserSoundsStats'
import GuildsStats from './stats/components/GuildsStats'
import QueueStats from './stats/components/QueueStats'
import TimeStats from './stats/components/TimeStats'
import HistoryStats from './stats/components/HistoryStats'
import SessionsStats from './stats/components/SessionsStats'
import PerformanceStats from './stats/components/PerformanceStats'
import ErrorsStats from './stats/components/ErrorsStats'
import RetentionStats from './stats/components/RetentionStats'

type StatsTab =
  | 'summary'
  | 'commands'
  | 'sounds'
  | 'users'
  | 'user-sounds'
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
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)

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
            className={`stats-tab-btn px-4 py-2 ${activeTab === 'user-sounds' ? 'active' : ''}`}
            onClick={() => setActiveTab('user-sounds')}
          >
            User Sounds
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
        {activeTab === 'users' && (
          <UsersStats
            onSelectUser={(userId: string) => {
              setSelectedUserId(userId)
              setActiveTab('user-sounds')
            }}
          />
        )}
        {activeTab === 'user-sounds' && <UserSoundsStats userId={selectedUserId || ''} />}
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
