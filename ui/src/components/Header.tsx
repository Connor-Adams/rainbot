import type { User } from '@/types';
import { useLayoutEffect, useRef } from 'react';
import { useBotStatusQuery } from '@/hooks/useLiveQuery';
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
  const headerRef = useRef<HTMLElement>(null);

  // Publish the header's own measured height as `--header-h` on <html>.
  //
  // Anything that wants to fill "the viewport minus the sticky header" needs
  // that number, and it is NOT a constant: this header reflows from one row
  // into four as it narrows, and measures 95px at lg+, 199px at 768 and 239px
  // at 375. A hardcoded `calc(100vh - 400px)` is how the soundboard ended up
  // with a 400px porthole onto 60 sounds; measuring is the fix, not a better
  // guess. Consumers use `var(--header-h)` with no fallback on purpose — if it
  // is ever unset the declaration is simply invalid and the element falls back
  // to its unbounded default rather than to a wrong number.
  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const publish = () => {
      document.documentElement.style.setProperty(
        '--header-h',
        `${Math.round(el.getBoundingClientRect().height)}px`
      );
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty('--header-h');
    };
  }, []);

  const { data: status } = useBotStatusQuery();

  return (
    <header
      ref={headerRef}
      className="flex flex-col lg:flex-row lg:items-center px-4 sm:px-6 lg:px-8 py-4 lg:py-5 border-b border-border bg-surface sticky top-0 z-header gap-4 lg:gap-6"
    >
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
