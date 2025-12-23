import ServerSelector from './ServerSelector'
import ConnectionsList from './ConnectionsList'
import ServersList from './ServersList'
import QueueList from './QueueList'

export default function Sidebar() {
  return (
    <aside className="sidebar w-[280px] flex-shrink-0 flex flex-col gap-6">
      <ServerSelector />
      <ConnectionsList />
      <ServersList />
      <QueueList />
    </aside>
  )
}

