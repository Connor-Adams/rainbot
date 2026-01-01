import type { User } from '@/types'
import { useQuery } from '@tanstack/react-query'
import { botApi } from '@/lib/api'
import { useState } from 'react'

interface HeaderProps {
  user: User | null
  onLogout: () => void
}

export default function Header({ user, onLogout }: HeaderProps) {
  const [activeTab, setActiveTab] = useState<'player' | 'soundboard' | 'stats'>('player')

  const { data: status } = useQuery({
    queryKey: ['bot-status'],
    queryFn: () => botApi.getStatus().then((res) => res.data),
    refetchInterval: 5000,
  })

  const handleTabClick = (tab: 'player' | 'soundboard' | 'stats') => {
    setActiveTab(tab)
    // This will be handled by the DashboardPage component
    window.dispatchEvent(new CustomEvent('tab-change', { detail: tab }))
  }

  return (
    <header className="header flex items-center px-8 py-5 border-b border-gray-700 bg-gray-900/85 backdrop-blur-xl sticky top-0 z-100 gap-8">
      <div className="logo flex items-center gap-3 flex-shrink-0">
        <span className="logo-icon text-3xl">🌧️</span>
        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
          Rainbot, It'll make you cum... probably.
        </h1>
      </div>
      <div className="header-nav flex items-center gap-2 flex-1 justify-center" id="nav-tabs">
        <button
          className={`nav-tab px-4 py-2 ${activeTab === 'player' ? 'active' : ''}`}
          onClick={() => handleTabClick('player')}
        >
          Player
        </button>
        <button
          className={`nav-tab px-4 py-2 ${activeTab === 'soundboard' ? 'active' : ''}`}
          onClick={() => handleTabClick('soundboard')}
        >
          Soundboard
        </button>
        <button
          className={`nav-tab px-4 py-2 ${activeTab === 'stats' ? 'active' : ''}`}
          onClick={() => handleTabClick('stats')}
        >
          Statistics
        </button>
      </div>
      <div className="header-right flex items-center gap-4 flex-shrink-0">
        {user && (
          <div className="user-info flex items-center gap-3 px-4 py-2 bg-gray-800 rounded-full border border-gray-700">
            <img
              className="user-avatar w-8 h-8 rounded-full border-2 border-gray-700"
              src={user.avatarUrl}
              alt="User avatar"
            />
            <span className="user-name text-sm font-medium text-white">
              {user.username}
              {user.discriminator !== '0' ? `#${user.discriminator}` : ''}
            </span>
            <button className="btn btn-secondary btn-small" onClick={onLogout}>
              Logout
            </button>
          </div>
        )}
        <div className="status flex items-center gap-2 px-4 py-2 bg-gray-800 rounded-full border border-gray-700">
          <span
            className={`status-dot w-2 h-2 rounded-full ${
              status?.online ? 'online' : 'offline'
            }`}
          ></span>
          <span className="status-text text-sm text-gray-400 font-medium">
            {status?.online ? status.username || 'Online' : 'Offline'}
          </span>
        </div>
      </div>
    </header>
  )
}

