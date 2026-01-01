/**
 * Chart.js Safety Utilities
 * Prevents browser crashes from invalid data
 */

// Safe number parser - returns 0 for any invalid value (NaN, Infinity, undefined, null)
export function safeInt(val: unknown): number {
  if (val === null || val === undefined) return 0;
  const num = typeof val === 'number' ? val : parseInt(String(val), 10);
  if (!Number.isFinite(num)) return 0;
  return num;
}

// Safe float parser
export function safeFloat(val: unknown): number {
  if (val === null || val === undefined) return 0;
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  if (!Number.isFinite(num)) return 0;
  return num;
}

// Safe string getter
export function safeString(val: unknown, fallback = 'Unknown'): string {
  if (val === null || val === undefined) return fallback;
  const str = String(val);
  return str.length > 0 ? str : fallback;
}

// Safe date formatter
export function safeDateLabel(dateVal: unknown): string {
  if (!dateVal) return 'Unknown';
  try {
    const date = new Date(dateVal as string | number | Date);
    if (isNaN(date.getTime())) return 'Unknown';
    return date.toLocaleDateString();
  } catch {
    return 'Unknown';
  }
}

// Validate chart data array - ensures all values are finite numbers
export function validateChartData(data: number[]): boolean {
  return data.length > 0 && data.every(Number.isFinite);
}

// Prepare safe chart dataset
export function prepareSafeData<T>(
  items: T[],
  labelFn: (item: T) => string,
  valueFn: (item: T) => number,
  maxItems = 50
): { labels: string[]; values: number[]; isValid: boolean } {
  const limited = items.slice(0, maxItems);
  const labels = limited.map(labelFn);
  const values = limited.map(valueFn);
  const isValid = labels.length > 0 && validateChartData(values);
  return { labels, values, isValid };
}
