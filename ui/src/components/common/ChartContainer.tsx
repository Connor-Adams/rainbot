import type { ReactNode } from 'react';
import { ChartFrame } from '@connor-adams/designsystem';

/**
 * Card shell for a chart, backed by the design system's `ChartFrame`.
 *
 * `ChartFrame` supplies the raised surface, the title/subtitle/actions header
 * row and — the part this wrapper used to hand-roll badly — a plot box of a
 * KNOWN height. That last bit matters: recharts' `<ResponsiveContainer
 * height="100%">` measures its parent, so a parent with only a `max-height`
 * (which is what this wrapper set before) measures as 0 and the chart never
 * paints. Callers worked around it by wrapping every chart in their own
 * `h-[300px]` div. Pass `height` instead and delete that div.
 *
 * `ChartFrame` is chart-library agnostic; `children` is whatever you render —
 * a `<ResponsiveContainer>`, a raw `<svg>`, a `<Skeleton>`. For the series and
 * axis colors use `chartTheme` / `chartColor`, re-exported from this barrel.
 */
interface ChartContainerProps {
  /** Header heading. Widened from `string` to `ReactNode`. */
  title?: ReactNode;
  /** Secondary line under the title. */
  subtitle?: ReactNode;
  /** Right-aligned header controls. */
  actions?: ReactNode;
  /** Legend or source note under the plot. */
  footer?: ReactNode;
  children: ReactNode;
  /** Plot height in px, or `'auto'` to derive it from `rowCount`. */
  height?: number | 'auto';
  /** Rows in the chart — drives the height when `height="auto"`. */
  rowCount?: number;
  /** Px per row in `'auto'` mode. */
  rowHeight?: number;
  /** Floor for the resolved height. */
  minHeight?: number;
  /**
   * Ceiling for the resolved height. Accepts the legacy CSS string form
   * (`'400px'`) as well as a number; either way it becomes `ChartFrame`'s
   * clamp ceiling rather than a CSS `max-height`. Left unset it falls through
   * to `ChartFrame`'s own ceiling — the old `'400px'` default is deliberately
   * NOT reinstated, since it would silently clamp any taller `height`.
   */
  maxHeight?: number | string;
  /** Shell padding scale. `'none'` lets the plot bleed to the card edge. */
  padding?: 'default' | 'compact' | 'none';
  className?: string;
}

/** `'400px'` → `400`. Returns undefined for anything unparseable. */
function toPx(value: number | string | undefined): number | undefined {
  if (value == null) return undefined;
  if (typeof value === 'number') return value;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default function ChartContainer({
  title,
  subtitle,
  actions,
  footer,
  children,
  height = 300,
  rowCount,
  rowHeight,
  minHeight,
  maxHeight,
  padding,
  className = '',
}: ChartContainerProps) {
  return (
    <ChartFrame
      className={`mb-6 ${className}`.trim()}
      title={title}
      subtitle={subtitle}
      actions={actions}
      footer={footer}
      height={height}
      rowCount={rowCount}
      rowHeight={rowHeight}
      minHeight={minHeight}
      maxHeight={toPx(maxHeight)}
      padding={padding}
    >
      {children}
    </ChartFrame>
  );
}
