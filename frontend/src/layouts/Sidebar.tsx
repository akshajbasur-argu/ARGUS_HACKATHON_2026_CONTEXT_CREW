import { NavLink } from 'react-router-dom'
import { cn } from '@/shared/utils/cn'

export interface NavItem {
  label: string
  href: string
  icon: string  // SVG path data (24x24 viewBox)
}

interface SidebarProps {
  items: NavItem[]
  open: boolean
  onClose: () => void
}

export function Sidebar({ items, open, onClose }: SidebarProps) {
  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-soil/40 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={cn(
          'fixed left-0 top-14 z-30 flex h-[calc(100vh-3.5rem)] w-64 flex-col border-r border-sand bg-parchment transition-transform duration-200',
          'lg:translate-x-0 lg:static lg:z-auto',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="flex flex-col gap-1">
            {items.map((item) => (
              <li key={item.href}>
                <NavLink
                  to={item.href}
                  end
                  onClick={onClose}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-md px-3 py-2.5 font-body text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-clay/10 text-clay border-l-2 border-clay -ml-px'
                        : 'text-bark hover:bg-straw/50 hover:text-soil',
                    )
                  }
                >
                  <svg className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                  </svg>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* Footer */}
        <div className="border-t border-straw px-4 py-3">
          <p className="font-mono text-[10px] text-sand">GrantFlow v0.1.0</p>
        </div>
      </aside>
    </>
  )
}
