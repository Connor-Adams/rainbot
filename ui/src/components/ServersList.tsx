import { useQuery } from '@tanstack/react-query';
import { botApi } from '@/lib/api';
import type { Guild } from '@/types';
import { escapeHtml } from '@/lib/utils';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import EmptyState from '@/components/common/EmptyState';
import ListItem from '@/components/common/ListItem';

export default function ServersList() {
  const { data: status } = useQuery({
    queryKey: ['bot-status'],
    queryFn: () => botApi.getStatus().then((res) => res.data),
    refetchInterval: 5000,
  });

  const guilds = status?.guilds || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Servers</CardTitle>
      </CardHeader>
      <CardContent>
        {guilds.length === 0 ? (
          <EmptyState icon="🏠" message="No servers available" />
        ) : (
          <div className="flex flex-col gap-2">
            {guilds.map((guild: Guild) => (
              <ListItem
                key={guild.id}
                icon="🏠"
                title={escapeHtml(guild.name)}
                subtitle={`${guild.memberCount} members`}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
