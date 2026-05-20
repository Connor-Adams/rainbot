import { Link } from 'react-router-dom';
import { DASHBOARD_NAV } from './navConfig';
import { useDashboardNavActive } from './useDashboardNavActive';

export default function MobileBottomNav() {
  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-header border-t border-border bg-surface/95 glass-effect pb-[env(safe-area-inset-bottom,0px)]"
      aria-label="Dashboard sections"
    >
      <div className="flex items-stretch justify-around max-w-[1600px] mx-auto px-1 pt-1">
        {DASHBOARD_NAV.map((item) => (
          <MobileNavItem key={item.id} item={item} />
        ))}
      </div>
    </nav>
  );
}

function MobileNavItem({ item }: { item: (typeof DASHBOARD_NAV)[number] }) {
  const isActive = useDashboardNavActive(item.to, item.id);
  return (
    <Link
      to={item.to}
      className={[
        'flex flex-1 min-w-0 flex-col items-center justify-center gap-0.5 py-2 px-0.5 rounded-t-lg transition-colors duration-200',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-inset',
        isActive ? 'text-primary bg-primary/10' : 'text-text-muted hover:text-text-secondary',
      ].join(' ')}
    >
      <span className="flex-shrink-0 [&>svg]:w-[22px] [&>svg]:h-[22px]" aria-hidden>
        {item.icon}
      </span>
      <span className="text-[10px] sm:text-xs font-medium truncate max-w-full text-center leading-tight">
        {item.label}
      </span>
    </Link>
  );
}
