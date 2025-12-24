import { useState, useEffect } from 'react'
import PlayerTab from '../components/tabs/PlayerTab'
import SoundboardTab from '../components/tabs/SoundboardTab'
import StatisticsTab from '../components/tabs/stats/StatisticsTab'

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<'player' | 'soundboard' | 'stats'>('player')

  useEffect(() => {
    const handleTabChange = (e: CustomEvent<'player' | 'soundboard' | 'stats'>) => {
      setActiveTab(e.detail)
    }

    window.addEventListener('tab-change', handleTabChange as EventListener)
    return () => {
      window.removeEventListener('tab-change', handleTabChange as EventListener)
    }
  }, [])

  return (
    <>
      {activeTab === 'player' && <PlayerTab />}
      {activeTab === 'soundboard' && <SoundboardTab />}
      {activeTab === 'stats' && <StatisticsTab />}
    </>
  )
}

