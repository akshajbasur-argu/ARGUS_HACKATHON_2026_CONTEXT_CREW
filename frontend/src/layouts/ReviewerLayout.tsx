import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { TopNav } from './TopNav'
import { Sidebar, type NavItem } from './Sidebar'

const NAV_ITEMS: NavItem[] = [
  {
    label: 'My Review Queue',
    href: '/reviewer/queue',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  },
  {
    label: 'Completed Reviews',
    href: '/reviewer/completed',
    icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  },
]

export function ReviewerLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <TopNav
        showHamburger
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
      />
      <div className="flex flex-1">
        <Sidebar
          items={NAV_ITEMS}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
