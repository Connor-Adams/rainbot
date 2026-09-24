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
  value: string | number;
  label: string;
  icon?: ReactNode;
  className?: string;
}

export default function StatCard({ value, label, icon, className = '' }: StatCardProps) {
  return (
    <DSStatCard
      className={`transition-all hover:border-border-hover hover:-translate-y-0.5 hover:shadow-lg ${className}`.trim()}
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
