import type { ReactNode } from 'react';
import {
  NavPlayerIcon,
  NavSoundboardIcon,
  NavRecordingsIcon,
  NavStatsIcon,
  NavStatusIcon,
  NavAdminIcon,
} from '@/components/icons';

export type DashboardNavId = 'player' | 'soundboard' | 'recordings' | 'stats' | 'status' | 'admin';

export type DashboardNavItem = {
  id: DashboardNavId;
  to: string;
  label: string;
  icon: ReactNode;
};

export const DASHBOARD_NAV: DashboardNavItem[] = [
  { id: 'player', to: '/player', label: 'Player', icon: <NavPlayerIcon size={20} /> },
  {
    id: 'soundboard',
    to: '/soundboard',
    label: 'Soundboard',
    icon: <NavSoundboardIcon size={20} />,
  },
  {
    id: 'recordings',
    to: '/recordings',
    label: 'Recordings',
    icon: <NavRecordingsIcon size={20} />,
  },
  { id: 'stats', to: '/stats/summary', label: 'Statistics', icon: <NavStatsIcon size={20} /> },
  { id: 'status', to: '/status', label: 'Status', icon: <NavStatusIcon size={20} /> },
  { id: 'admin', to: '/admin', label: 'Admin', icon: <NavAdminIcon size={20} /> },
];
