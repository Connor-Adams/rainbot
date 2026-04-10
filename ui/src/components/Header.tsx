import type { User } from '@/types';
import { useQuery } from '@tanstack/react-query';
import { botApi } from '@/lib/api';
import Logo from './header/Logo';
import UserInfo from './header/UserInfo';
import StatusIndicator from './header/StatusIndicator';

interface HeaderProps {
  user: User | null;
  onLogout: () => void;
}

export default function Header({ user, onLogout }: HeaderProps) {
  const { data: status } = useQuery({
    queryKey: ['bot-status'],
    queryFn: () => botApi.getStatus().then((res) => res.data),
    refetchInterval: 5000,
  });

  return (
    <header className="flex flex-row flex-wrap items-center justify-between gap-4 px-4 sm:px-6 lg:px-8 py-4 border-b border-border bg-surface/90 glass-effect sticky top-0 z-header">
      <div className="flex items-center min-w-0 flex-shrink-0">
        <Logo />
      </div>
      <div className="flex items-center flex-wrap gap-3 sm:gap-4 justify-end ml-auto">
        {user && <UserInfo user={user} onLogout={onLogout} />}
        <StatusIndicator
          isOnline={status?.online ?? false}
          statusText={status?.online ? status.username || 'Online' : 'Offline'}
        />
      </div>
    </header>
  );
}
