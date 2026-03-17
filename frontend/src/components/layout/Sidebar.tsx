import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, MapPin, Server, Network, GitBranch, Grid3X3,
  Layers, Globe, Scan, Clock, AlertTriangle, History, Users,
  Building2, LogOut, ChevronLeft, ChevronRight, Wifi
} from 'lucide-react'
import { clsx } from 'clsx'
import { useAuthStore } from '../../store/authStore'
import { useUiStore } from '../../store/uiStore'
import { useLogout } from '../../hooks/useAuth'

interface NavItem {
  to: string
  icon: React.ReactNode
  label: string
  badge?: number
  adminOnly?: boolean
}

const NavItems: NavItem[] = [
  { to: '/', icon: <LayoutDashboard size={18} />, label: 'Pannello di controllo' },
  { to: '/sedi', icon: <MapPin size={18} />, label: 'Sedi' },
  { to: '/armadi', icon: <Server size={18} />, label: 'Armadi' },
  { to: '/dispositivi', icon: <Network size={18} />, label: 'Dispositivi' },
  { to: '/topologia', icon: <GitBranch size={18} />, label: 'Topologia' },
  { to: '/patch-panel', icon: <Grid3X3 size={18} />, label: 'Patch Panel' },
  { to: '/vlan', icon: <Layers size={18} />, label: 'VLAN' },
  { to: '/prefissi', icon: <Globe size={18} />, label: 'Prefissi IP' },
  { to: '/scansione', icon: <Scan size={18} />, label: 'Scansione' },
  { to: '/pianificazione', icon: <Clock size={18} />, label: 'Pianificazione' },
  { to: '/conflitti', icon: <AlertTriangle size={18} />, label: 'Conflitti' },
  { to: '/storico', icon: <History size={18} />, label: 'Storico modifiche' },
]

const AdminNavItems: NavItem[] = [
  { to: '/utenti', icon: <Users size={18} />, label: 'Utenti', adminOnly: true },
  { to: '/vendor', icon: <Building2 size={18} />, label: 'Vendor', adminOnly: true },
]

const Sidebar: React.FC = () => {
  const { user, isAdmin } = useAuthStore()
  const { sidebarOpen, toggleSidebar, pendingConflicts } = useUiStore()
  const logout = useLogout()

  return (
    <aside
      className={clsx(
        'flex flex-col bg-gray-900 text-white transition-all duration-200 flex-shrink-0 h-screen sticky top-0',
        sidebarOpen ? 'w-56' : 'w-16'
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-700">
        <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <Wifi size={16} className="text-white" />
        </div>
        {sidebarOpen && (
          <span className="font-bold text-lg tracking-tight">NetHelper</span>
        )}
        <button
          onClick={toggleSidebar}
          className="ml-auto p-1 rounded hover:bg-gray-700 text-gray-400 flex-shrink-0"
          aria-label={sidebarOpen ? 'Comprimi sidebar' : 'Espandi sidebar'}
        >
          {sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {NavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors relative group',
                isActive
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              )
            }
            title={!sidebarOpen ? item.label : undefined}
          >
            <span className="flex-shrink-0">{item.icon}</span>
            {sidebarOpen && <span className="flex-1 truncate">{item.label}</span>}
            {item.to === '/conflitti' && pendingConflicts > 0 && (
              <span className={clsx(
                'bg-orange-500 text-white text-xs font-bold rounded-full flex items-center justify-center flex-shrink-0',
                sidebarOpen ? 'min-w-[20px] h-5 px-1' : 'absolute top-1 right-1 w-4 h-4 text-xs'
              )}>
                {pendingConflicts > 99 ? '99+' : pendingConflicts}
              </span>
            )}
            {/* Tooltip for collapsed state */}
            {!sidebarOpen && (
              <span className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50 border border-gray-700">
                {item.label}
                {item.to === '/conflitti' && pendingConflicts > 0 && ` (${pendingConflicts})`}
              </span>
            )}
          </NavLink>
        ))}

        {/* Admin section */}
        {isAdmin() && (
          <>
            <div className={clsx('mt-4 mb-2', sidebarOpen ? 'px-3' : 'px-2')}>
              {sidebarOpen ? (
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Impostazioni</p>
              ) : (
                <div className="border-t border-gray-700" />
              )}
            </div>
            {AdminNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors relative group',
                    isActive
                      ? 'bg-primary-600 text-white'
                      : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  )
                }
                title={!sidebarOpen ? item.label : undefined}
              >
                <span className="flex-shrink-0">{item.icon}</span>
                {sidebarOpen && <span className="truncate">{item.label}</span>}
                {!sidebarOpen && (
                  <span className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50 border border-gray-700">
                    {item.label}
                  </span>
                )}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      {/* User info + logout */}
      <div className="border-t border-gray-700 p-3">
        {sidebarOpen ? (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-primary-700 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-white">{user?.username?.[0]?.toUpperCase()}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white truncate">{user?.username}</p>
              <p className="text-xs text-gray-400 capitalize">{user?.role}</p>
            </div>
            <button
              onClick={() => logout.mutate()}
              className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white"
              title="Esci"
            >
              <LogOut size={14} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => logout.mutate()}
            className="w-full flex justify-center p-2 rounded hover:bg-gray-700 text-gray-400 hover:text-white group relative"
            title="Esci"
          >
            <LogOut size={16} />
            <span className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50 border border-gray-700">
              Esci
            </span>
          </button>
        )}
      </div>
    </aside>
  )
}

export default Sidebar
