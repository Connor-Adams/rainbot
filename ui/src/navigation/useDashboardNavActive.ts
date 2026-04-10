import { useLocation } from 'react-router-dom';
import type { DashboardNavId } from './navConfig';

/** Primary nav: stats highlights for any `/stats/*` path; other items match `to` exactly. */
export function useDashboardNavActive(to: string, id: DashboardNavId): boolean {
  const { pathname } = useLocation();
  if (id === 'stats') return pathname.startsWith('/stats');
  return pathname === to;
}
