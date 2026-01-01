import { useQuery } from '@tanstack/react-query'
import { botApi } from '@/lib/api'
import type { Connection } from '@/types'
import { escapeHtml } from '@/lib/utils'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui'
import EmptyState from '@/components/common/EmptyState'
import ListItem from '@/components/common/ListItem'

export default function ConnectionsList() {
  const { data: status } = useQuery({
    queryKey: ['bot-status'],
    queryFn: () => botApi.getStatus().then((res) => res.data),
    refetchInterval: 5000,
  })

  const connections = status?.connections || []

  return (
    <Card>
      <CardHeader>
        <CardTitle>Voice Connections</CardTitle>
      </CardHeader>
      <CardContent>
        {connections.length === 0 ? (
          <EmptyState
            icon="🔇"
            message="No active connections"
            submessage="Join a voice channel to get started"
          />
        ) : (
          <div className="flex flex-col gap-2">
            {connections.map((conn: Connection) => (
              <ListItem
                key={conn.guildId}
                icon="🔊"
                title={escapeHtml(conn.channelName)}
                subtitle={
                  conn.nowPlaying ? (
                    <span className="text-success font-mono">♪ {escapeHtml(conn.nowPlaying)}</span>
                  ) : (
                    'Idle'
                  )
                }
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

