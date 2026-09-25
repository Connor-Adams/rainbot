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
   * and bare numeric strings get `toLocaleString()` grouping (see
   * `groupIfPlainNumber`); anything else is rendered as given.
   */
  value: ReactNode;
  label: string;
  icon?: ReactNode;
  className?: string;
}

/**
 * A bare decimal number in canonical form: optional `-`, no leading zeros
 * (other than a lone `0`), at most 15 integer digits, optional fractional part.
 *
 * Most stats endpoints return counts as STRINGS (Postgres `count(*)` arrives as
 * text over `pg`), so grouping only `typeof value === 'number'` meant
 * `ApiLatencyStats` printed `1284922` next to `StatsSummary`'s `184,922` in the
 * same dashboard.
 *
 * The rule is deliberately narrow, because wrong grouping on an identifier is
 * worse than no grouping on a count:
 *
 * - **15 integer digits max.** A Discord snowflake is 17-19 digits, so it can
 *   never match. The bound also sits inside `Number.MAX_SAFE_INTEGER`, so the
 *   `Number()` below is always exact.
 * - **No leading zeros.** A zero-padded value is a code or an id, not a count.
 * - **Nothing but digits, one optional `-` and one optional `.`.** Units
 *   (`12000000ms`), percentages (`99.4%`), formatted durations (`973h 55m`),
 *   clock times and free text (`TypeError`) all fail the test and pass through
 *   untouched.
 */
const PLAIN_NUMBER = /^-?(?:0|[1-9]\d{0,14})(?:\.\d+)?$/;

/**
 * Group the integer part and re-attach the fractional digits verbatim.
 * `Number('1234567.8901').toLocaleString()` would round to `1,234,567.89`
 * (`maximumFractionDigits` defaults to 3), which silently changes a reported
 * value — so only the whole part goes through `toLocaleString()`.
 */
function groupIfPlainNumber(value: string): string {
  if (!PLAIN_NUMBER.test(value)) return value;
  const [whole, fraction] = value.split('.');
  const grouped = Number(whole).toLocaleString();
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
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
      value={
        typeof value === 'number'
          ? value.toLocaleString()
          : typeof value === 'string'
            ? groupIfPlainNumber(value)
            : value
      }
    />
  );
}
