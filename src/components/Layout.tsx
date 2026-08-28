import { useState } from 'react'
import Sidebar from './Sidebar'
import Navbar from './Navbar'
import { type Page, type AuthUser } from '@/types'

interface LayoutProps {
  auth: AuthUser
  currentPage: Page
  navigate: (p: Page) => void
  onLogout: () => void
  currentClient: string
  setCurrentClient: (c: string) => void
  children: React.ReactNode
}

export default function Layout({ auth, currentPage, navigate, onLogout, currentClient, setCurrentClient, children }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
      <Sidebar
        auth={auth}
        currentPage={currentPage}
        navigate={navigate}
        onLogout={onLogout}
        collapsed={collapsed}
        onToggle={() => setCollapsed(v => !v)}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Navbar
          auth={auth}
          currentPage={currentPage}
          navigate={navigate}
          onLogout={onLogout}
          currentClient={currentClient}
          setCurrentClient={setCurrentClient}
        />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
