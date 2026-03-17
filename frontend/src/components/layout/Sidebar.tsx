import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, MapPin, Server, Network, GitBranch, Grid3X3,
  Layers, Globe, Scan, Clock, AlertTriangle, History, Users,
  Building2, LogOut, ChevronLeft, ChevronRight, Wifi, Settings
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

const mainNav: NavItem[] = [
  { to: '/',             icon: <LayoutDashboard size={17} />, label: 'Pannello di controllo' },
  { to: '/sedi',         icon: <MapPin size={17} />,          label: 'Sedi' },
  { to: '/armadi',       icon: <Server size={17} />,          label: 'Armadi' },
  { to: '/dispositivi',  icon: <Network size={17} />,         label: 'Dispositivi' },
  { to: '/topologia',    icon: <GitBranch size={17} />,       label: 'Topologia' },
]

const networkNav: NavItem[] = [
  { to: '/patch-panel',  icon: <Grid3X3 size={17} />,  label: 'Patch Panel' },
  { to: '/vlan',         icon: <Layers size={17} />,   label: 'VLAN' },
  { to: '/prefissi',     icon: <Globe size={17} />,    label: 'Prefissi IP' },
]

const scanNav: NavItem[] = [
  { to: '/scansione',    icon: <Scan size={17} />,          label: 'Scansione' },
  { to: '/pianificazione',icon: <Clock size={17} />,         label: 'Pianificazione' },
  { to: '/conflitti',    icon: <AlertTriangle size={17} />,  label: 'Conflitti' },
  { to: '/storico',      icon: <History size={17} />,        label: 'Storico modifiche' },
]

const adminNav: NavItem[] = [
  { to: '/utenti', icon: <Users size={17} />,    label: 'Utenti' },
  { to: '/vendor', icon: <Building2 size={17} />, label: 'Vendor' },
]

interface NavGroupProps {
  label: string
  items: NavItem[]
  collapsed: boolean
  pendingConflicts?: number
}

const NavGroup: React.FC<NavGroupProps> = ({ label, items, collapsed, pendingConflicts = 0 }) => (
  <div className="mb-1">
    {!collapsed && (
      <p className="px-3 mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-500/70 select-none">
        {label}
      </p>
    )}
    {items.map((item) => (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.to === '/'}
        title={collapsed ? item.label : undefined}
        className={({ isActive }) =>
          clsx(
            'relative flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium',
            'transition-all duration-150 group',
            isActive
              ? 'bg-white/15 text-white shadow-sm'
              : 'text-gray-400 hover:bg-white/8 hover:text-gray-200'
          )
        }
      >
        {({ isActive }) => (
          <>
            {/* Active indicator */}
            {isActive && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-primary-400 rounded-r-full" />
            )}

            <span className={clsx('flex-shrink-0', isActive ? 'text-white' : 'text-gray-500 group-hover:text-gray-300')}>
              {item.icon}
            </span>

            {!collapsed && (
              <span className="flex-1 truncate">{item.label}</span>
            )}

            {/* Badge conflitti */}
            {item.to === '/conflitti' && pendingConflicts > 0 && (
              <span className={clsx(
                'bg-orange-500 text-white text-xs font-bold rounded-full flex items-center justify-center flex-shrink-0',
                collapsed
                  ? 'absolute -top-0.5 -right-0.5 w-4 h-4 text-[10px]'
                  : 'min-w-[20px] h-5 px-1'
              )}>
                {pendingConflicts > 99 ? '99+' : pendingConflicts}
              </span>
            )}

            {/* Tooltip collapsed */}
            {collapsed && (
              <span className="pointer-events-none absolute left-full ml-3 px-2.5 py-1.5 bg-gray-800 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 z-50 border border-gray-700 shadow-lg transition-opacity">
                {item.label}
                {item.to === '/conflitti' && pendingConflicts > 0 && (
                  <span className="ml-1 text-orange-400">({pendingConflicts})</span>
                )}
              </span>
            )}
          </>
        )}
      </NavLink>
    ))}
  </div>
)

const Sidebar: React.FC = () => {
  const { user, isAdmin } = useAuthStore()
  const { sidebarOpen, toggleSidebar, pendingConflicts } = useUiStore()
  const logout = useLogout()
  const collapsed = !sidebarOpen

  return (
    <aside
      className={clsx(
        'flex flex-col flex-shrink-0 h-screen sticky top-0',
        'bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950',
        'border-r border-white/5',
        'transition-all duration-200',
        collapsed ? 'w-[60px]' : 'w-[220px]'
      )}
    >
      {/* ── Logo ─────────────────────────────── */}
      <div className={clsx(
        'flex items-center border-b border-white/8 flex-shrink-0',
        collapsed ? 'justify-center px-0 py-4' : 'gap-3 px-4 py-4'
      )}>
        <div className="w-8 h-8 bg-primary-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md shadow-primary-900/50">
          <Wifi size={15} className="text-white" />
        </div>
        {!collapsed && (
          <span className="font-bold text-white text-base tracking-tight">NetHelper</span>
        )}
        <button
          onClick={toggleSidebar}
          className={clsx(
            'p-1 rounded-lg text-gray-600 hover:text-gray-300 hover:bg-white/10 transition-colors',
            collapsed ? 'hidden' : 'ml-auto'
          )}
          aria-label={collapsed ? 'Espandi' : 'Comprimi'}
        >
          <ChevronLeft size={15} />
        </button>
      </div>

      {/* Collapse toggle when collapsed */}
      {collapsed && (
        <button
          onClick={toggleSidebar}
          className="mx-auto mt-2 p-1.5 rounded-lg text-gray-600 hover:text-gray-300 hover:bg-white/10 transition-colors"
          aria-label="Espandi"
        >
          <ChevronRight size={15} />
        </button>
      )}

      {/* ── Nav ──────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-2 space-y-4 scrollbar-hide">
        <NavGroup label="Generale"   items={mainNav}    collapsed={collapsed} />
        <NavGroup label="Rete"       items={networkNav} collapsed={collapsed} />
        <NavGroup label="Operazioni" items={scanNav}    collapsed={collapsed} pendingConflicts={pendingConflicts} />
        {isAdmin() && (
          <NavGroup label="Admin" items={adminNav} collapsed={collapsed} />
        )}
      </nav>

      {/* ── User ─────────────────────────────── */}
      <div className={clsx(
        'border-t border-white/8 flex-shrink-0',
        collapsed ? 'p-2' : 'p-3'
      )}>
        {collapsed ? (
          <button
            onClick={() => logout.mutate()}
            className="w-full flex justify-center p-2 rounded-xl text-gray-500 hover:text-red-400 hover:bg-white/10 group relative transition-colors"
            title="Esci"
          >
            <LogOut size={16} />
            <span className="pointer-events-none absolute left-full ml-3 px-2.5 py-1.5 bg-gray-800 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 z-50 border border-gray-700 shadow-lg">
              Esci
            </span>
          </button>
        ) : (
          <div className="flex items-center gap-2.5 px-1">
            {/* Avatar */}
            <div className="w-8 h-8 rounded-xl bg-primary-700/60 border border-primary-600/40 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-primary-200">
                {user?.username?.[0]?.toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate leading-none">{user?.username}</p>
              <p className="text-xs text-gray-500 capitalize mt-0.5 leading-none">
                {user?.role === 'admin' ? '● Admin' : '● Sola lettura'}
              </p>
            </div>
            <button
              onClick={() => logout.mutate()}
              className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-white/10 transition-colors flex-shrink-0"
              title="Esci"
            >
              <LogOut size={14} />
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}

export default Sidebar
