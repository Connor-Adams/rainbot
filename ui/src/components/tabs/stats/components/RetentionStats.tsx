import { statsApi } from '@/lib/api';
import { useStatsQuery } from '@/hooks/useStatsQuery';
import {
  EmptyState,
  StatsLoading,
  StatsError,
  StatsSection,
  StatsTable,
} from '@/components/common';
import { Progress } from '@connor-adams/designsystem';
import { safeInt, safeDateLabel } from '@/lib/chartSafety';

interface CohortAnalysis {
  cohort_month: string;
  users_joined: string;
  still_active: string;
  retention_rate: string;
}

interface ActiveUser {
  period: string;
  active_users: string;
}

interface ReturningUser {
  period: string;
  returning_users: string;
  return_rate: string;
}

interface RetentionData {
  cohorts: CohortAnalysis[];
  activeUsers: ActiveUser[];
  returning: ReturningUser[];
}

export default function RetentionStats() {
  const { data, isLoading, error } = useStatsQuery<RetentionData>({
    queryKey: ['stats', 'retention'],
    queryFn: ({ signal }) => statsApi.retention({ signal }),
    refetchInterval: 30000,
  });

  if (isLoading) return <StatsLoading message="Loading retention..." />;
  if (error) return <StatsError error={error} message="Error loading retention" />;

  if (!data) {
    return (
      <EmptyState
        icon="📈"
        message="No retention data available yet"
        submessage="Retention statistics will appear here as users interact over time"
      />
    );
  }

  const cohorts = Array.isArray(data.cohorts) ? data.cohorts : [];
  const activeUsers = Array.isArray(data.activeUsers) ? data.activeUsers : [];
  const returning = Array.isArray(data.returning) ? data.returning : [];

  if (cohorts.length === 0 && activeUsers.length === 0) {
    return (
      <EmptyState
        icon="📈"
        message="No retention data available yet"
        submessage="Retention statistics will appear here as users interact over time"
      />
    );
  }

  const cohortColumns = [
    {
      id: 'cohort',
      header: 'Cohort',
      render: (cohort: CohortAnalysis) => safeDateLabel(cohort.cohort_month),
      className: 'px-4 py-2 text-text-secondary',
    },
    {
      id: 'users_joined',
      header: 'Users Joined',
      render: (cohort: CohortAnalysis) => cohort.users_joined,
      className: 'px-4 py-2 text-text-secondary',
    },
    {
      id: 'still_active',
      header: 'Still Active',
      render: (cohort: CohortAnalysis) => cohort.still_active,
      className: 'px-4 py-2 text-text-secondary',
    },
    {
      id: 'retention_rate',
      header: 'Retention Rate',
      render: (cohort: CohortAnalysis) => (
        <span
          className={`px-2 py-1 rounded text-xs ${parseFloat(cohort.retention_rate) > 50 ? 'bg-success/10 text-success-light' : 'bg-danger/10 text-danger-light'}`}
        >
          {parseFloat(cohort.retention_rate || '0').toFixed(1)}%
        </span>
      ),
      className: 'px-4 py-2 text-text-secondary',
    },
  ];

  const returningColumns = [
    {
      id: 'period',
      header: 'Period',
      render: (r: ReturningUser) => safeDateLabel(r.period),
      className: 'px-4 py-2 text-text-secondary',
    },
    {
      id: 'returning_users',
      header: 'Returning Users',
      render: (r: ReturningUser) => r.returning_users,
      className: 'px-4 py-2 text-text-secondary',
    },
    {
      id: 'return_rate',
      header: 'Return Rate',
      render: (r: ReturningUser) => `${parseFloat(r.return_rate || '0').toFixed(1)}%`,
      className: 'px-4 py-2 text-text-secondary',
    },
  ];

  return (
    <div className="space-y-6">
      {activeUsers.length > 0 && (
        <StatsSection title="Active Users Over Time">
          <div className="space-y-2">
            {activeUsers.slice(-14).map((u, idx) => {
              const maxVal = Math.max(...activeUsers.map((x) => safeInt(x.active_users)), 1);
              const val = safeInt(u.active_users);
              const pct = (val / maxVal) * 100;
              return (
                <Progress
                  key={idx}
                  size="lg"
                  tone="primary"
                  value={pct}
                  label={safeDateLabel(u.period)}
                  valueText={String(val)}
                />
              );
            })}
          </div>
        </StatsSection>
      )}

      {cohorts.length > 0 && (
        <StatsSection title="Cohort Analysis">
          <StatsTable<CohortAnalysis>
            columns={cohortColumns}
            data={cohorts}
            emptyMessage="No cohort data available"
            getRowKey={(cohort) => cohort.cohort_month}
          />
        </StatsSection>
      )}

      {returning.length > 0 && (
        <StatsSection title="Returning Users">
          <StatsTable<ReturningUser>
            columns={returningColumns}
            data={returning}
            emptyMessage="No returning-user data available"
            getRowKey={(r) => r.period}
          />
        </StatsSection>
      )}
    </div>
  );
}
