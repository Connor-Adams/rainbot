interface NavTabsProps {
  activeTab: 'player' | 'soundboard' | 'stats'
  onTabChange: (tab: 'player' | 'soundboard' | 'stats') => void
}

export default function NavTabs({ activeTab, onTabChange }: NavTabsProps) {
  const tabs = [
    { id: 'player' as const, label: 'Player' },
    { id: 'soundboard' as const, label: 'Soundboard' },
    { id: 'stats' as const, label: 'Statistics' },
  ]

  return (
    <nav className="flex items-center gap-2 flex-1 justify-center">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`
            px-4 py-2 text-sm font-medium transition-all duration-200
            border-b-2 mb-[-2px]
            ${
              activeTab === tab.id
                ? 'text-primary border-primary'
                : 'text-text-secondary border-transparent hover:text-text-primary'
            }
          `}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
