import type { ReactNode } from 'react'
import Header from './Header'
import Sidebar from './Sidebar'
import { useAuthStore } from '../stores/authStore'
import { useToast } from '../hooks/useToast'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuthStore()
  const { ToastContainer } = useToast()

  return (
    <div className="app flex flex-col min-h-screen">
      <Header user={user} onLogout={logout} />
      <main className="main flex flex-1 gap-6 px-8 py-6 w-full max-w-[1600px] mx-auto">
        <Sidebar />
        <div className="content flex-1 flex flex-col gap-8 min-w-0">{children}</div>
      </main>
      <ToastContainer />
    </div>
  )
}

