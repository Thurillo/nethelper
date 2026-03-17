import React, { useEffect } from 'react'
import { Outlet, Navigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import { useAuthStore } from '../../store/authStore'
import { usePendingCount } from '../../hooks/useConflicts'

const Layout: React.FC = () => {
  const { user, accessToken } = useAuthStore()

  // Keep pending conflicts count in sync
  usePendingCount()

  if (!user || !accessToken) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="flex h-screen bg-surface-100 overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default Layout
