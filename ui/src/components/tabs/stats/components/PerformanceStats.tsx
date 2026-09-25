import { statsApi } from '@/lib/api';
import { useStatsQuery } from '@/hooks/useStatsQuery';
import {
  EmptyState,
  StatsLoading,
  StatsError,
  StatsSection,
  StatsTable,
  ChartContainer,
  chartTheme,
  chartColor,
  StatCard,
} from '@/components/common';
import { StatGrid } from '@connor-adams/designsystem';
import { safeInt } from '@/lib/chartSafety';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface PerformanceOverall {
  avg_ms: string;
  p50_ms: string;
  p95_ms: string;
  p99_ms: string;
  max_ms: string;
  min_ms: string;
  sample_count: string;
}

interface CommandPerf {
  command_name: string;
  avg_ms: string;
  p95_ms: string;
  execution_count: string;
}

interface PerformanceData {
  overall: PerformanceOverall;
  byCommand: CommandPerf[];
}

export default function PerformanceStats() {
  const { data, isLoading, error } = useStatsQuery<PerformanceData>({
    queryKey: ['stats', 'performance'],
    queryFn: ({ signal }) => statsApi.performance({ signal }),
    refetchInterval: 30000,
  });

  if (isLoading) return <StatsLoading message="Loading performance..." />;
  if (error) return <StatsError error={error} message="Error loading performance" />;

  if (!data) {
    return (
      <EmptyState
        icon="⏱️"
        message="No performance data available yet"
        submessage="Performance statistics will appear here as commands are executed"
      />
    );
  }

  const overall = data.overall || {
    avg_ms: '0',
    p50_ms: '0',
    p95_ms: '0',
    p99_ms: '0',
    max_ms: '0',
    min_ms: '0',
    sample_count: '0',
  };
  const byCommand = Array.isArray(data.byCommand) ? data.byCommand : [];

  const commandData = byCommand.slice(0, 10).map((c) => ({
    name: c.command_name || 'Unknown',
    value: safeInt(c.avg_ms),
  }));

  const commandColumns = [
    {
      id: 'command',
      header: 'Command',
      render: (cmd: CommandPerf) => cmd.command_name,
      className: 'px-4 py-2 text-text-secondary',
    },
    {
      id: 'avg_ms',
      header: 'Avg (ms)',
      render: (cmd: CommandPerf) => cmd.avg_ms,
      className: 'px-4 py-2 text-text-secondary',
    },
    {
      id: 'p95_ms',
      header: 'P95 (ms)',
      render: (cmd: CommandPerf) => cmd.p95_ms,
      className: 'px-4 py-2 text-text-secondary',
    },
    {
      id: 'execution_count',
      header: 'Executions',
      render: (cmd: CommandPerf) => cmd.execution_count,
      className: 'px-4 py-2 text-text-secondary',
    },
  ];

  return (
    <div className="space-y-6">
      {/* The seven tiles were `grid-cols-2 md:grid-cols-4 lg:grid-cols-7`;
          `StatGrid columns="auto"` replaces those breakpoints with an
          intrinsically responsive auto-fit grid, which still lands on seven
          tracks at the width the `lg:` rule was written for. Each tile's
          severity colour was carried by its value text, so the value is passed
          as a node rather than a bare string to keep it. */}
      <StatGrid columns="auto" minItemWidth={140} gap="lg">
        <StatCard
          value={<span className="text-primary-light">{overall.sample_count || 0}</span>}
          label="Samples"
        />
        <StatCard
          value={<span className="text-success-light">{overall.avg_ms || 0}ms</span>}
          label="Avg"
        />
        <StatCard
          value={<span className="text-secondary-light">{overall.p50_ms || 0}ms</span>}
          label="P50"
        />
        <StatCard
          value={<span className="text-warning-light">{overall.p95_ms || 0}ms</span>}
          label="P95"
        />
        <StatCard
          value={<span className="text-warning">{overall.p99_ms || 0}ms</span>}
          label="P99"
        />
        <StatCard
          value={<span className="text-text-secondary">{overall.min_ms || 0}ms</span>}
          label="Min"
        />
        <StatCard
          value={<span className="text-danger-light">{overall.max_ms || 0}ms</span>}
          label="Max"
        />
      </StatGrid>

      {commandData.length > 0 && (
        // `height="auto"` with the DS defaults (32px per row, 200px floor) is
        // the old `Math.max(200, commandData.length * 32)`, resolved to real
        // pixels — so the inner height div is gone.
        <ChartContainer
          title="Avg Execution Time by Command (ms)"
          height="auto"
          rowCount={commandData.length}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={commandData} layout="vertical" margin={{ left: 80, right: 20 }}>
              <XAxis type="number" tick={chartTheme.axis.tick} />
              <YAxis type="category" dataKey="name" tick={chartTheme.axis.tick} width={75} />
              <Tooltip contentStyle={chartTheme.tooltip.contentStyle} />
              <Bar dataKey="value" fill={chartColor(0)} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      )}

      {byCommand.length > 0 && (
        <StatsSection title="Command Performance">
          <StatsTable<CommandPerf>
            columns={commandColumns}
            data={byCommand}
            emptyMessage="No command performance data available"
            getRowKey={(cmd) => cmd.command_name}
          />
        </StatsSection>
      )}
    </div>
  );
}
