import { useBotStatusQuery } from '@/hooks/useLiveQuery';
import type { Guild } from '@/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import EmptyState from '@/components/common/EmptyState';
import ListItem from '@/components/common/ListItem';

export default function ServersList() {
  const { data: status } = useBotStatusQuery();

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
                title={guild.name}
                subtitle={`${guild.memberCount} members`}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
