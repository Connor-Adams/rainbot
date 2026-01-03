import { useState, useEffect } from 'react'
import PlayerTab from '../components/tabs/PlayerTab'
import SoundboardTab from '../components/tabs/SoundboardTab'
import RecordingsTab from '../components/tabs/RecordingsTab'
import StatisticsTab from '../components/tabs/stats/StatisticsTab'

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<'player' | 'soundboard' | 'recordings' | 'stats'>('player')

  useEffect(() => {
    const handleTabChange = (e: CustomEvent<'player' | 'soundboard' | 'recordings' | 'stats'>) => {
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
      {activeTab === 'recordings' && <RecordingsTab />}
      {activeTab === 'stats' && <StatisticsTab />}
    </>
  )
}

