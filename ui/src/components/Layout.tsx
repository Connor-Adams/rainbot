import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import { RouteErrorBoundary } from './ErrorBoundary';
import { useAuthStore } from '../stores/authStore';

export default function Layout() {
  const { user, logout } = useAuthStore();
  const { pathname } = useLocation();

  return (
    <div className="app flex flex-col min-h-screen">
      <Header user={user} onLogout={logout} />
      <main className="main flex flex-1 flex-col lg:flex-row gap-4 sm:gap-6 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 w-full max-w-[1600px] mx-auto">
        {/* The routed content comes FIRST in the DOM and the sidebar second,
            with `lg:order-*` putting the sidebar back on the left from lg up.
            Below lg the two stack, and source order is what decides which one
            you meet first — by scroll, by Tab key and by screen reader alike.
            With the sidebar first, a tablet user reaching the player's
            play/pause button had to travel past Voice Connections and a
            25-track queue to get there (the transport controls sat at y=2420
            of a 3373px page). Ordering with CSS alone would have fixed the
            scroll and left the Tab order still wrong.

            The error boundary is unaffected by the swap: it lives inside this
            column, so it still wraps only the outlet. */}
        <div className="content order-1 lg:order-2 flex-1 flex flex-col gap-8 min-w-0">
          {/* Catches a lazy route chunk that failed to download. It is INSIDE
              the chrome on purpose: the app's other boundary sits above
              `BrowserRouter` in `main.tsx`, so a rejected chunk caught there
              would replace the header and the tab bar too and strand the user
              with nowhere to click. Keyed on the pathname so it resets when the
              user navigates to a tab that does load. */}
          <RouteErrorBoundary key={pathname}>
            <Outlet />
          </RouteErrorBoundary>
        </div>
        <Sidebar />
      </main>
    </div>
  );
}
