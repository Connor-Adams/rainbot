import type { User } from '@/types';
import { Button } from '@/components/ui';

interface UserInfoProps {
  user: User;
  onLogout: () => void;
}

export default function UserInfo({ user, onLogout }: UserInfoProps) {
  return (
    <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 bg-surface-elevated rounded-full border border-border hover:border-border-hover transition-colors">
      <img
        className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 border-border"
        src={user.avatarUrl}
        alt={`${user.username}'s avatar`}
      />
      <span className="text-xs sm:text-sm font-medium text-text-primary hidden sm:inline">
        {user.username}
        {user.discriminator !== '0' ? `#${user.discriminator}` : ''}
      </span>
      <Button variant="secondary" size="sm" onClick={onLogout}>
        Logout
      </Button>
    </div>
  );
}
