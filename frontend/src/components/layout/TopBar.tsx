import React from 'react'
import { useLocation, Link } from 'react-router-dom'
import { Menu, ChevronRight } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useUiStore } from '../../store/uiStore'
import { UserRoleBadge } from '../common/Badge'

const ROUTE_LABELS: Record<string, string> = {
  '': 'Pannello di controllo',
  'sedi': 'Sedi',
  'armadi': 'Armadi',
  'dispositivi': 'Dispositivi',
  'topologia': 'Topologia',
  'patch-panel': 'Patch Panel',
  'vlan': 'VLAN',
  'prefissi': 'Prefissi IP',
  'scansione': 'Scansione',
  'pianificazione': 'Pianificazione',
  'conflitti': 'Conflitti',
  'storico': 'Storico modifiche',
  'utenti': 'Utenti',
  'vendor': 'Vendor',
}

const TopBar: React.FC = () => {
  const location = useLocation()
  const { user } = useAuthStore()
  const { toggleSidebar } = useUiStore()

  const pathParts = location.pathname.split('/').filter(Boolean)

  const breadcrumbs = [
    { label: 'Home', to: '/' },
    ...pathParts.map((part, idx) => ({
      label: ROUTE_LABELS[part] ?? (isNaN(Number(part)) ? part : `#${part}`),
      to: '/' + pathParts.slice(0, idx + 1).join('/'),
    })),
  ]

  // Use last crumb as page title
  const currentPage = breadcrumbs[breadcrumbs.length - 1]

  return (
    <header className="h-14 bg-white border-b border-gray-200/80 shadow-sm flex items-center px-4 gap-3 sticky top-0 z-30 flex-shrink-0">
      {/* Mobile menu toggle */}
      <button
        onClick={toggleSidebar}
        className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 lg:hidden transition-colors"
        aria-label="Toggle sidebar"
      >
        <Menu size={20} />
      </button>

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm flex-1 min-w-0" aria-label="breadcrumb">
        {breadcrumbs.length === 1 ? (
          <span className="font-semibold text-gray-900">{currentPage.label}</span>
        ) : (
          breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={crumb.to}>
              {idx > 0 && (
                <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
              )}
              {idx === breadcrumbs.length - 1 ? (
                <span className="font-semibold text-gray-900 truncate">{crumb.label}</span>
              ) : (
                <Link
                  to={crumb.to}
                  className="text-gray-400 hover:text-gray-600 truncate transition-colors"
                >
                  {crumb.label}
                </Link>
              )}
            </React.Fragment>
          ))
        )}
      </nav>

      {/* User info */}
      <div className="flex items-center gap-2.5 flex-shrink-0">
        {user?.role && <UserRoleBadge role={user.role} />}
        <span className="text-sm font-medium text-gray-700 hidden sm:block">{user?.username}</span>
      </div>
    </header>
  )
}

export default TopBar
