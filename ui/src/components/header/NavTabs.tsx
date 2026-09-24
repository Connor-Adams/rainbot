import { Tabs } from '@connor-adams/designsystem';

type Tab = 'player' | 'soundboard' | 'recordings' | 'stats' | 'status' | 'admin';

interface NavTabsProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

const TAB_ITEMS: { value: Tab; label: string }[] = [
  { value: 'player', label: 'Player' },
  { value: 'soundboard', label: 'Soundboard' },
  { value: 'recordings', label: 'Recordings' },
  { value: 'stats', label: 'Statistics' },
  { value: 'status', label: 'Status' },
  { value: 'admin', label: 'Admin' },
];

export default function NavTabs({ activeTab, onTabChange }: NavTabsProps) {
  return (
    <div className="w-full lg:flex-1 lg:flex lg:justify-center">
      {/* overflow="scroll" replaces the overflow-x-auto + no-scrollbar wrapper
          this used to need: Tabs owns the scroll, the faded edges and pulling
          the selected pill into view. */}
      <Tabs
        items={TAB_ITEMS}
        value={activeTab}
        onValueChange={(value) => onTabChange(value as Tab)}
        overflow="scroll"
      />
    </div>
  );
}
