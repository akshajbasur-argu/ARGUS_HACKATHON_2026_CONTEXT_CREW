import { Outlet } from 'react-router-dom'
import { TopNav } from './TopNav'

export function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <TopNav minimal />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-6 md:py-8">
        <Outlet />
      </main>
      <footer className="border-t border-straw px-4 py-4 text-center font-mono text-xs text-sand">
        GrantFlow &copy; {new Date().getFullYear()}
      </footer>
    </div>
  )
}
