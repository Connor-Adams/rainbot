import type { User } from '@/types';
import { useQuery } from '@tanstack/react-query';
import { botApi } from '@/lib/api';
import Logo from './header/Logo';
import NavTabs from './header/NavTabs';
import UserInfo from './header/UserInfo';
import StatusIndicator from './header/StatusIndicator';
import GuildPicker from './header/GuildPicker';

interface HeaderProps {
  user: User | null;
  onLogout: () => void;
}

export default function Header({ user, onLogout }: HeaderProps) {
  const { data: status } = useQuery({
    queryKey: ['bot-status'],
    queryFn: ({ signal }) => botApi.getStatus({ signal }).then((res) => res.data),
    refetchInterval: 5000,
  });

  return (
    <header className="flex flex-col lg:flex-row lg:items-center px-4 sm:px-6 lg:px-8 py-4 lg:py-5 border-b border-border bg-surface sticky top-0 z-header gap-4 lg:gap-6">
      <div className="flex items-center justify-between w-full lg:w-auto">
        <Logo />
        <div className="flex items-center gap-3 lg:hidden">
          <StatusIndicator
            isOnline={status?.online ?? false}
            statusText={status?.online ? status.username || 'Online' : 'Offline'}
          />
        </div>
      </div>
      <NavTabs />
      <div className="flex items-center flex-wrap gap-3 lg:gap-4 flex-shrink-0">
        <GuildPicker />
        {user && <UserInfo user={user} onLogout={onLogout} />}
        <div className="hidden lg:block">
          <StatusIndicator
            isOnline={status?.online ?? false}
            statusText={status?.online ? status.username || 'Online' : 'Offline'}
          />
        </div>
      </div>
    </header>
  );
}
