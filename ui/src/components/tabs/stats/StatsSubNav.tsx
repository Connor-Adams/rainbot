import { Link, useNavigate } from 'react-router-dom';
import { STATS_NAV_GROUPS, type StatsSectionId } from './statsNavConfig';

type Props = {
  activeSection: StatsSectionId;
};

export default function StatsSubNav({ activeSection }: Props) {
  const navigate = useNavigate();

  return (
    <>
      <div className="md:hidden">
        <label htmlFor="stats-section-select" className="sr-only">
          Statistics section
        </label>
        <select
          id="stats-section-select"
          value={activeSection}
          onChange={(e) => navigate(`/stats/${e.target.value}`)}
          className="w-full rounded-xl border border-border bg-surface-elevated px-4 py-3 text-sm font-medium text-text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
        >
          {STATS_NAV_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <nav
        className="hidden md:flex flex-col w-full md:w-52 lg:w-56 flex-shrink-0 gap-6 pr-0 md:pr-2"
        aria-label="Statistics sections"
      >
        {STATS_NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              {group.label}
            </p>
            <ul className="flex flex-col gap-0.5">
              {group.sections.map((s) => {
                const isActive = activeSection === s.id;
                return (
                  <li key={s.id}>
                    <Link
                      to={`/stats/${s.id}`}
                      className={[
                        'block rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                        isActive
                          ? 'bg-primary/15 text-primary border border-primary/35'
                          : 'text-text-secondary border border-transparent hover:bg-surface-hover hover:text-text-primary',
                      ].join(' ')}
                    >
                      {s.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </>
  );
}
