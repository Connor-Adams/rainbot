import { useQuery } from '@tanstack/react-query';
import { StatGrid } from '@connor-adams/designsystem';
import { statsApi } from '@/lib/api';
import {
  StatsLoading,
  StatsError,
  StatsSection,
  StatsTable,
  StatCard,
  ChartContainer,
  EmptyState,
  chartTheme,
  chartColor,
} from '@/components/common';
import { safeInt } from '@/lib/chartSafety';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { pieSliceLabel } from './pieLabel';

interface ErrorSummary {
  total_errors: string;
  unique_commands: string;
  most_common_error: string | null;
  most_failing_command: string | null;
}

interface ErrorByType {
  error_type: string;
  count: string;
}

interface ErrorByCommand {
  command_name: string;
  error_count: string;
  success_count: string;
  error_rate: string;
}

interface RecentError {
  command_name: string;
  error_type: string;
  error_message: string;
  created_at: string;
}

interface ErrorsData {
  summary: ErrorSummary;
  byType: ErrorByType[];
  byCommand: ErrorByCommand[];
  recent: RecentError[];
}

/**
 * `.ca-stat-card__value` is `white-space: nowrap` with no overflow handling, so
 * a long free-text value (an error class name, a command) runs past the tile's
 * edge instead of truncating the way the hand-rolled tile's `truncate` did.
 * The shared `StatCard` wrapper types `value` as `string | number` and forwards
 * `className` to the card root, so the fix cannot be a node — it is this
 * descendant variant on the tile's two `<p>` elements, applied only to the two
 * free-text tiles (the counts are short and unaffected).
 */
const TRUNCATE_VALUE = '';

export default function ErrorsStats() {
  const { data, isLoading, error } = useQuery<ErrorsData>({
    queryKey: ['stats', 'errors'],
    queryFn: () => statsApi.errors().then((r) => r.data),
    refetchInterval: 30000,
  });

  if (isLoading) return <StatsLoading message="Loading errors..." />;
  if (error) return <StatsError error={error} message="Error loading errors" />;

  const summary = data?.summary || {
    total_errors: '0',
    unique_commands: '0',
    most_common_error: null,
    most_failing_command: null,
  };
  const byType = Array.isArray(data?.byType) ? data.byType : [];
  const byCommand = Array.isArray(data?.byCommand) ? data.byCommand : [];
  const recent = Array.isArray(data?.recent) ? data.recent : [];

  if (!data || safeInt(summary.total_errors) === 0) {
    return (
      <EmptyState
        icon="✅"
        message="No errors recorded"
        submessage="Error statistics will appear here if commands fail"
      />
    );
  }

  const typeData = byType
    .map((t, idx) => ({
      name: t.error_type || 'Unknown',
      value: safeInt(t.count),
      color: chartColor(idx),
    }))
    .filter((d) => d.value > 0);

  const commandData = byCommand.slice(0, 10).map((c) => ({
    name: c.command_name || 'Unknown',
    value: safeInt(c.error_count),
  }));

  const recentColumns = [
    { id: 'command', header: 'Command', render: (err: RecentError) => err.command_name },
    {
      id: 'error_type',
      header: 'Error Type',
      render: (err: RecentError) => (
        <span className="px-2 py-1 bg-danger/10 text-danger-light rounded text-xs">
          {err.error_type}
        </span>
      ),
    },
    {
      id: 'message',
      header: 'Message',
      render: (err: RecentError) => err.error_message,
      className: 'text-sm truncate max-w-xs',
    },
  ];

  return (
    <div className="space-y-6">
      <StatGrid columns="auto" minItemWidth={180} gap="md">
        <StatCard value={summary.total_errors || 0} label="Total Errors" />
        <StatCard value={summary.unique_commands || 0} label="Unique Commands" />
        <StatCard
          value={summary.most_common_error || 'N/A'}
          label="Most Common Error"
          className={TRUNCATE_VALUE}
        />
        <StatCard
          value={summary.most_failing_command || 'N/A'}
          label="Most Failing Command"
          className={TRUNCATE_VALUE}
        />
      </StatGrid>

      <div className="grid md:grid-cols-2 gap-6">
        {typeData.length > 0 && (
          <ChartContainer title="Errors by Type" height={280}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={typeData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  label={pieSliceLabel}
                  labelLine={{ stroke: chartTheme.tooltip.labelLine }}
                >
                  {typeData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={chartTheme.tooltip.contentStyle} />
              </PieChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}

        {commandData.length > 0 && (
          <ChartContainer title="Errors by Command" height="auto" rowCount={commandData.length}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={commandData} layout="vertical" margin={{ left: 80, right: 20 }}>
                <XAxis type="number" tick={chartTheme.axis.tick} stroke={chartTheme.axis.stroke} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={chartTheme.axis.tick}
                  stroke={chartTheme.axis.stroke}
                  width={75}
                />
                <Tooltip contentStyle={chartTheme.tooltip.contentStyle} />
                <Bar dataKey="value" fill={chartColor(0)} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}
      </div>

      {recent.length > 0 && (
        <StatsSection title="Recent Errors">
          <StatsTable
            columns={recentColumns}
            data={recent.slice(0, 10)}
            emptyMessage="No recent errors"
          />
        </StatsSection>
      )}
    </div>
  );
}
