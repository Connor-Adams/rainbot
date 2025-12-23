import { useState } from 'react'
import StatsSummary from '../stats/StatsSummary'
import CommandsStats from '../stats/CommandsStats'
import SoundsStats from '../stats/SoundsStats'
import UsersStats from '../stats/UsersStats'
import GuildsStats from '../stats/GuildsStats'
import QueueStats from '../stats/QueueStats'
import TimeStats from '../stats/TimeStats'
import HistoryStats from '../stats/HistoryStats'

type StatsTab = 'summary' | 'commands' | 'sounds' | 'users' | 'guilds' | 'queue' | 'time' | 'history'

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
            Listening History
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
      </div>
    </section>
  )
}

