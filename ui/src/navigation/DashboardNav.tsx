import { Link } from 'react-router-dom';
import { DASHBOARD_NAV } from './navConfig';
import { useDashboardNavActive } from './useDashboardNavActive';

const baseLink =
  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background border';
const inactive =
  'text-text-secondary border-transparent hover:bg-surface-hover hover:text-text-primary';
const active = 'bg-primary/15 text-primary border-primary/40';

export default function DashboardNav({ className = '' }: { className?: string }) {
  return (
    <nav className={`flex flex-col gap-0.5 ${className}`} aria-label="Dashboard sections">
      {DASHBOARD_NAV.map((item) => (
        <NavItem key={item.id} item={item} />
      ))}
    </nav>
  );
}

function NavItem({ item }: { item: (typeof DASHBOARD_NAV)[number] }) {
  const isActive = useDashboardNavActive(item.to, item.id);
  return (
    <Link to={item.to} className={`${baseLink} ${isActive ? active : inactive}`}>
      <span className="flex-shrink-0 opacity-90" aria-hidden>
        {item.icon}
      </span>
      <span>{item.label}</span>
    </Link>
  );
}
