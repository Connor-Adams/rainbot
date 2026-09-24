import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import ConnectionsList from './ConnectionsList';
import ServersList from './ServersList';
import QueueList from './QueueList';

export default function Sidebar() {
  const location = useLocation();
  const route = location.pathname.split('/')[1] || 'player';

  let panels: ReactNode = null;

  if (route === 'player') {
    panels = (
      <>
        <ConnectionsList />
        <QueueList />
      </>
    );
  } else if (route === 'soundboard') {
    panels = <ConnectionsList />;
  } else if (route === 'status') {
    panels = (
      <>
        <ConnectionsList />
        <ServersList />
      </>
    );
  }

  if (!panels) {
    return null;
  }

  return (
    <aside className="sidebar w-full lg:w-[280px] flex-shrink-0 flex flex-col gap-4 sm:gap-6">
      {panels}
    </aside>
  );
}
