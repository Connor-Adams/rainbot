import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import ConnectionsList from './ConnectionsList';
import ServersList from './ServersList';
import QueueList from './QueueList';

export default function Sidebar() {
  const location = useLocation();
  const route = location.pathname.split('/')[1] || 'player';

  let panels: ReactNode = null;

  if (route === 'player') {
    panels = (
      <>
        <ConnectionsList />
        <QueueList />
      </>
    );
  } else if (route === 'soundboard') {
    panels = <ConnectionsList />;
  } else if (route === 'status') {
    panels = (
      <>
        <ConnectionsList />
        <ServersList />
      </>
    );
  }

  if (!panels) {
    return null;
  }

  return (
    // From lg up the sidebar is bounded to the viewport minus the sticky
    // header and sticks under it, so a long panel scrolls *inside* its own card
    // instead of stretching the page. `QueueList`'s `CardContent` has always
    // carried `flex-1 overflow-y-auto min-h-0`, but nothing above it had a
    // bounded height, so `scrollHeight === clientHeight`, the overflow never
    // engaged, and a 25-track queue grew a 1932px card next to a ~1100px main
    // panel — a 2348px page over half of which was empty.
    //
    // The bound is `--header-h`, which `Header` measures and publishes, rather
    // than a hardcoded `calc(100vh - <guess>)`: this header is 95px at lg and
    // taller as it stacks, and a wrong constant is exactly the bug that gives
    // the soundboard a 400px porthole. If the variable is ever missing both
    // declarations are simply invalid and the sidebar falls back to its old
    // unbounded flow — no silent wrong number.
    //
    // lg-only on purpose. Stacked below lg the sidebar is full width and
    // already sits after the content, so capping it there would only turn a
    // normal page scroll into a scroll trap.
    //
    // The `1.5rem`/`3rem` in the offset and the cap are not viewport guesses:
    // they are `<main>`'s own `sm:py-6` (24px), which is what separates the
    // sidebar's top edge from the header. Subtracting it in both places keeps
    // the same 24px gutter above and below the sidebar whether or not sticky
    // has engaged; leaving it out puts 24px of the card under the fold until
    // the user scrolls.
    <aside className="sidebar order-2 lg:order-1 w-full lg:w-[280px] flex-shrink-0 flex flex-col gap-4 sm:gap-6 lg:sticky lg:top-[calc(var(--header-h)+1.5rem)] lg:max-h-[calc(100dvh-var(--header-h)-3rem)] lg:min-h-0">
      {panels}
    </aside>
  );
}
