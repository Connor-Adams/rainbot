import type { User } from '@/types'
import { useQuery } from '@tanstack/react-query'
import { botApi } from '@/lib/api'
import { useState } from 'react'
import Logo from './header/Logo'
import NavTabs from './header/NavTabs'
import UserInfo from './header/UserInfo'
import StatusIndicator from './header/StatusIndicator'

interface HeaderProps {
  user: User | null
  onLogout: () => void
}

export default function Header({ user, onLogout }: HeaderProps) {
  const [activeTab, setActiveTab] = useState<'player' | 'soundboard' | 'recordings' | 'stats'>('player')

  const { data: status } = useQuery({
    queryKey: ['bot-status'],
    queryFn: () => botApi.getStatus().then((res) => res.data),
    refetchInterval: 5000,
  })

  const handleTabChange = (tab: 'player' | 'soundboard' | 'recordings' | 'stats') => {
    setActiveTab(tab)
    window.dispatchEvent(new CustomEvent('tab-change', { detail: tab }))
  }

  return (
    <header className="flex items-center px-8 py-5 border-b border-border bg-surface/85 glass-effect sticky top-0 z-header gap-8">
      <Logo />
      <NavTabs activeTab={activeTab} onTabChange={handleTabChange} />
      <div className="flex items-center gap-4 flex-shrink-0">
        {user && <UserInfo user={user} onLogout={onLogout} />}
        <StatusIndicator
          isOnline={status?.online ?? false}
          statusText={status?.online ? status.username || 'Online' : 'Offline'}
        />
      </div>
    </header>
  )
}

