import type { CommandStat } from '@/types';
import { escapeHtml } from '@/lib/utils';
import {
  StatsLoading,
  StatsError,
  StatsSection,
  StatsTable,
  EmptyState,
  ChartContainer,
  chartColor,
  chartTheme,
} from '@/components/common';
import { useStatsQuery } from '@/hooks/useStatsQuery';
import { statsApi } from '@/lib/api';
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

export default function CommandsStats() {
  const { data, isLoading, error } = useStatsQuery({
    queryKey: ['stats', 'commands'],
    queryFn: () => statsApi.commands(),
  });

  if (isLoading) return <StatsLoading message="Loading command statistics..." />;
  if (error) return <StatsError error={error} />;

  // Safe data access with defaults
  const commands = Array.isArray(data?.commands) ? data.commands : [];

  if (!data || commands.length === 0) {
    return (
      <EmptyState
        icon="📊"
        message="No command data available yet"
        submessage="Command statistics will appear as users interact with the bot"
      />
    );
  }

  const totalCount = safeInt(data.total);
  const successCount = commands.reduce(
    (sum: number, c: CommandStat) => sum + safeInt(c.success_count),
    0
  );
  const errorCount = Math.max(0, totalCount - successCount);

  const barChartData = commands.slice(0, 10).map((c: CommandStat) => ({
    name: c.command_name || 'Unknown',
    value: safeInt(c.count),
  }));

  // Colours are assigned before the filter, so a zeroed slice never shifts the
  // remaining slices' colours — same as when these were hard-coded hex.
  const doughnutData = [
    { name: 'Success', value: successCount, color: chartColor(0) },
    { name: 'Errors', value: errorCount, color: chartColor(1) },
  ].filter((d) => d.value > 0);

  const columns = [
    {
      id: 'command',
      header: 'Command',
      render: (cmd: CommandStat) => escapeHtml(cmd.command_name),
      className: 'px-4 py-3 text-sm text-text-primary',
    },
    {
      id: 'count',
      header: 'Count',
      render: (cmd: CommandStat) => (
        <span className="font-mono">{safeInt(cmd.count).toLocaleString()}</span>
      ),
      className: 'px-4 py-3 text-sm text-text-secondary',
    },
    {
      id: 'success',
      header: 'Success',
      render: (cmd: CommandStat) => (
        <span className="font-mono">{safeInt(cmd.success_count).toLocaleString()}</span>
      ),
      className: 'px-4 py-3 text-sm text-text-secondary',
    },
    {
      id: 'errors',
      header: 'Errors',
      render: (cmd: CommandStat) => (
        <span className="font-mono">{safeInt(cmd.error_count).toLocaleString()}</span>
      ),
      className: 'px-4 py-3 text-sm text-text-secondary',
    },
    {
      id: 'success_rate',
      header: 'Success Rate',
      render: (cmd: CommandStat) => {
        const sc = safeInt(cmd.success_count);
        const ec = safeInt(cmd.error_count);
        const total = sc + ec;
        const rate = total > 0 ? ((sc / total) * 100).toFixed(1) : '0';
        return <span className="font-mono">{rate}%</span>;
      },
      className: 'px-4 py-3 text-sm text-text-secondary',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        {barChartData.length > 0 && (
          <ChartContainer
            title="Top Commands"
            height="auto"
            rowCount={barChartData.length}
            className="mb-0!"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barChartData} layout="vertical" margin={{ left: 80, right: 20 }}>
                <XAxis type="number" tick={chartTheme.axis.tick} />
                <YAxis type="category" dataKey="name" tick={chartTheme.axis.tick} width={75} />
                <Tooltip contentStyle={chartTheme.tooltip.contentStyle} />
                <Bar dataKey="value" fill={chartColor(0)} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}
        {doughnutData.length > 0 && (
          <ChartContainer title="Success Rate" height={280} className="mb-0!">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={doughnutData}
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
                  {doughnutData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={chartTheme.tooltip.contentStyle} />
              </PieChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}
      </div>
      <StatsSection title="Command Details">
        <StatsTable
          columns={columns}
          data={commands}
          emptyMessage="No command data available"
          getRowKey={(cmd: CommandStat) => cmd.command_name}
        />
      </StatsSection>
    </div>
  );
}
