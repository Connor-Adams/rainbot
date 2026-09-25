import type { ReactNode } from 'react';
import { StatCard as DSStatCard } from '@connor-adams/designsystem';

/**
 * KPI tile, backed by the design system's `StatCard`.
 *
 * The hand-rolled version carried four class names — `stat-card`, `stat-icon`,
 * `stat-value`, `stat-label` — that are defined nowhere: not in
 * `ui/src/index.css`, not in `tailwind.config.js`, and not in either
 * `@connor-adams/tokens` or `@connor-adams/designsystem`. Only the Tailwind
 * utilities alongside them ever rendered. The DS component supplies the real
 * `.ca-stat-card__*` layer instead.
 *
 * Preserved from the local version: the `value`/`label`/`icon`/`className`
 * prop shape, the `toLocaleString()` grouping on numeric values, and the hover
 * lift (`.ca-stat-card` has no hover state of its own, so it stays here as
 * Tailwind utilities off the brand's `border.hover` token).
 *
 * Note the DS tile is label-above-value and start-aligned, where the local one
 * was centred with the value in the brand accent. That is the DS taking over
 * layout and typography, which is the point of routing through it.
 */
interface StatCardProps {
  /**
   * `ReactNode`, not `string | number`, so a tile can colour or otherwise mark
   * up its own value — severity on a latency percentile, for instance. Numbers
   * still get `toLocaleString()` grouping; anything else is rendered as given.
   */
  value: ReactNode;
  label: string;
  icon?: ReactNode;
  className?: string;
}

export default function StatCard({ value, label, icon, className = '' }: StatCardProps) {
  return (
    <DSStatCard
      /*
       * `[&_p]:…` clamps the value, which the design system does not: its
       * `.ca-stat-card__value` is `white-space: nowrap` with no overflow
       * handling, so a long free-text value (an error class name, an ungrouped
       * count) paints straight over the neighbouring tile. The hand-rolled tile
       * this replaced had `truncate`, so without this the swap is a regression.
       * Clamping here rather than at each call site — three separate files had
       * started carrying their own copy of it.
       *
       * Target the bare `<p>`, NOT `.ca-stat-card__value`: Tailwind v4 silently
       * emits no rule at all for an arbitrary variant containing BEM double
       * underscores, so the class lands in the DOM and nothing styles it.
       */
      className={`transition-all hover:border-border-hover hover:-translate-y-0.5 hover:shadow-lg [&_p]:overflow-hidden [&_p]:text-ellipsis ${className}`.trim()}
      label={
        icon ? (
          <>
            <span className="mr-1.5" aria-hidden="true">
              {icon}
            </span>
            {label}
          </>
        ) : (
          label
        )
      }
      value={typeof value === 'number' ? value.toLocaleString() : value}
    />
  );
}
