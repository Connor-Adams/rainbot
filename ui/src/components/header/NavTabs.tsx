import { useLocation, useNavigate } from 'react-router-dom';
import { Tabs } from '@connor-adams/designsystem';

type Tab = 'player' | 'soundboard' | 'recordings' | 'stats' | 'status' | 'admin';

const TAB_ITEMS: { value: Tab; label: string }[] = [
  { value: 'player', label: 'Player' },
  { value: 'soundboard', label: 'Soundboard' },
  { value: 'recordings', label: 'Recordings' },
  { value: 'stats', label: 'Statistics' },
  { value: 'status', label: 'Status' },
  { value: 'admin', label: 'Admin' },
];

export default function NavTabs() {
  const location = useLocation();
  const navigate = useNavigate();

  const activeTab = (location.pathname.split('/')[1] || 'player') as Tab;

  return (
    // `min-w-0` is load-bearing, not decoration. This is the middle child of the
    // single-row desktop header, and a flex item's automatic minimum size is its
    // min-content size unless it is overridden — so without this the wrapper
    // refused to shrink below the tab strip's 511px and shoved the right-hand
    // cluster (guild picker, user, status pill) off the right edge of the page
    // at every width under ~1400px. `Tabs overflow="scroll"` already computes a
    // zero automatic minimum for itself (its `overflow-x: auto` does that), so
    // once the wrapper can shrink the strip scrolls instead of pushing.
    <div className="w-full min-w-0 lg:flex-1 lg:flex lg:justify-center">
      {/* overflow="scroll" replaces the overflow-x-auto + no-scrollbar wrapper
          this used to need: Tabs owns the scroll, the faded edges and pulling
          the selected pill into view. */}
      <Tabs
        items={TAB_ITEMS}
        value={activeTab}
        onValueChange={(value) => navigate('/' + value)}
        overflow="scroll"
      />
    </div>
  );
}
