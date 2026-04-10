import DashboardNav from '../navigation/DashboardNav';
import ServerSelector from './ServerSelector';
import ConnectionsList from './ConnectionsList';
import ServersList from './ServersList';
import QueueList from './QueueList';

export default function Sidebar() {
  return (
    <aside className="sidebar w-full lg:w-[280px] flex-shrink-0 flex flex-col gap-4 sm:gap-6">
      <div className="hidden lg:block rounded-2xl border border-border bg-surface-elevated/90 p-2 shadow-sm">
        <p className="px-3 pt-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Dashboard
        </p>
        <DashboardNav />
      </div>
      <ServerSelector />
      <ConnectionsList />
      <ServersList />
      <QueueList />
    </aside>
  );
}
