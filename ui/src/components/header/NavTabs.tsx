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
    <div className="w-full lg:flex-1 lg:flex lg:justify-center overflow-x-auto no-scrollbar">
      <Tabs items={TAB_ITEMS} value={activeTab} onValueChange={(value) => navigate('/' + value)} />
    </div>
  );
}
