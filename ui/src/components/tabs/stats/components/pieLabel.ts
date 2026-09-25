import type { PieLabelRenderProps } from 'recharts';

/**
 * Slice label shared by every donut chart in the stats tab: `Name (42%)`.
 *
 * recharts 3 widened `PieLabelRenderProps` so `name` and `percent` are both
 * optional, which is why this cannot simply be an inline arrow annotated with
 * the shape it expects. A slice with no name or no percent renders as an empty
 * label rather than `undefined (NaN%)`.
 */
export function pieSliceLabel({ name, percent }: PieLabelRenderProps): string {
  if (name == null || percent == null) return '';
  return `${name} (${(percent * 100).toFixed(0)}%)`;
}
