import { statsApi } from '@/lib/api';
import { useStatsQuery } from '@/hooks/useStatsQuery';
import {
  StatsLoading,
  StatsError,
  StatsSection,
  StatsTable,
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

interface InteractionType {
  interaction_type: string;
  count: string;
}

interface TopAction {
  custom_id: string;
  count: string;
}

interface ResponseTimeDist {
  under_100ms: string;
  between_100_500ms: string;
  between_500_1000ms: string;
  over_1000ms: string;
}

interface InteractionsData {
  typeBreakdown: InteractionType[];
  topActions: TopAction[];
  responseTimeDistribution: ResponseTimeDist;
}

export default function InteractionsStats() {
  const { data, isLoading, error } = useStatsQuery<InteractionsData>({
    queryKey: ['stats', 'interactions'],
    queryFn: ({ signal }) => statsApi.interactions({ signal }),
    refetchInterval: 10000,
  });

  if (isLoading) return <StatsLoading message="Loading interactions..." />;
  if (error) return <StatsError error={error} message="Error loading interactions" />;
  if (!data) return null;

  const rtd: ResponseTimeDist = data.responseTimeDistribution || {
    under_100ms: '0',
    between_100_500ms: '0',
    between_500_1000ms: '0',
    over_1000ms: '0',
  };
  const typeBreakdown = Array.isArray(data.typeBreakdown) ? data.typeBreakdown : [];
  const topActions = Array.isArray(data.topActions) ? data.topActions : [];

  const hasTypeData = typeBreakdown.length > 0;
  const hasActionData = topActions.length > 0;
  const hasRTData =
    safeInt(rtd.under_100ms) > 0 ||
    safeInt(rtd.between_100_500ms) > 0 ||
    safeInt(rtd.between_500_1000ms) > 0 ||
    safeInt(rtd.over_1000ms) > 0;

  if (!hasTypeData && !hasActionData && !hasRTData) {
    return (
      <EmptyState
        icon="🔘"
        message="No interaction data available"
        submessage="Interaction statistics will appear here once users start using buttons and menus"
      />
    );
  }

  const typeData = typeBreakdown
    .map((t, idx) => ({
      name: t.interaction_type || 'Unknown',
      value: safeInt(t.count),
      color: chartColor(idx),
    }))
    .filter((d) => d.value > 0);

  const rtData = [
    { name: '< 100ms', value: safeInt(rtd.under_100ms), color: chartColor(0) },
    { name: '100-500ms', value: safeInt(rtd.between_100_500ms), color: chartColor(1) },
    { name: '500-1000ms', value: safeInt(rtd.between_500_1000ms), color: chartColor(2) },
    { name: '> 1000ms', value: safeInt(rtd.over_1000ms), color: chartColor(3) },
  ].filter((d) => d.value > 0);

  const actionData = topActions.slice(0, 10).map((a) => ({
    name: a.custom_id || 'Unknown',
    value: safeInt(a.count),
  }));

  const actionColumns = [
    {
      id: 'custom_id',
      header: 'Custom ID',
      render: (action: TopAction) => action.custom_id,
      className: 'font-mono text-sm',
    },
    { id: 'count', header: 'Count', render: (action: TopAction) => action.count },
  ];

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        {typeData.length > 0 && (
          <ChartContainer title="Interaction Types" height={280}>
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

        {rtData.length > 0 && (
          <ChartContainer title="Response Time Distribution" height={280}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={rtData}
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
                  {rtData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={chartTheme.tooltip.contentStyle} />
              </PieChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}
      </div>

      {actionData.length > 0 && (
        <ChartContainer title="Top Interactions" height="auto" rowCount={actionData.length}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={actionData} layout="vertical" margin={{ left: 80, right: 20 }}>
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

      {topActions.length > 0 && (
        <StatsSection title="Interaction Details">
          <StatsTable
            columns={actionColumns}
            data={topActions.slice(0, 15)}
            emptyMessage="No interaction data"
            getRowKey={(action: TopAction) => action.custom_id}
          />
        </StatsSection>
      )}
    </div>
  );
}
