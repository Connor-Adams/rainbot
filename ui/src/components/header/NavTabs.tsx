interface NavTabsProps {
  activeTab: 'player' | 'soundboard' | 'recordings' | 'stats' | 'status' | 'admin'
  onTabChange: (
    tab: 'player' | 'soundboard' | 'recordings' | 'stats' | 'status' | 'admin'
  ) => void
}

export default function NavTabs({ activeTab, onTabChange }: NavTabsProps) {
  const tabs = [
    { id: 'player' as const, label: 'Player' },
    { id: 'soundboard' as const, label: 'Soundboard' },
    { id: 'recordings' as const, label: 'Recordings' },
    { id: 'stats' as const, label: 'Statistics' },
    { id: 'status' as const, label: 'Status' },
    { id: 'admin' as const, label: 'Admin' },
  ]

  return (
    <nav className="flex items-center gap-2 w-full lg:flex-1 lg:justify-center overflow-x-auto no-scrollbar">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`
            px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-all duration-200 whitespace-nowrap
            rounded-full border
            ${
              activeTab === tab.id
                ? 'text-primary border-primary/60 bg-primary/10'
                : 'text-text-secondary border-transparent hover:text-text-primary hover:border-border'
            }
          `}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
