// Export all common components for easy importing
export { default as StatsLoading } from './StatsLoading';
export { default as StatsError } from './StatsError';
export { default as StatsSection } from './StatsSection';
export { default as StatCard } from './StatCard';
export { default as StatsTable } from './StatsTable';
export { default as ChartContainer } from './ChartContainer';
export { default as EmptyState } from './EmptyState';

// The chart palette and frame theme, re-exported so a chart component needs one
// import for the container and its colours. These come from the design system's
// `/chart` SUBPATH deliberately: it has no React and no CSS imports, so pulling
// the palette in does not drag the component stylesheet along.
//
// Every member is a CSS `var(--chart-*)` string, never a resolved colour — that
// is what makes a chart follow the light/dark theme AND the `data-brand` scope
// with no JS. Hand them straight to recharts; do not resolve them and do not
// reach for `getComputedStyle`. Member names mirror what they replace:
// `chartTheme.tooltip.contentStyle` drops into `contentStyle`,
// `chartTheme.axis.tick` into `tick={…}`, `chartTheme.grid` into
// `<CartesianGrid {...chartTheme.grid} />`.
export {
  chartTheme,
  chartColors,
  chartColor,
  chartLineColor,
} from '@connor-adams/designsystem/chart';
export type { ChartTheme, ChartColors, ChartColorToken } from '@connor-adams/designsystem/chart';
