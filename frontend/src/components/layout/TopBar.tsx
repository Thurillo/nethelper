import React, { useState, useRef, useEffect } from 'react'
import { useLocation, Link, useNavigate } from 'react-router-dom'
import { Menu, ChevronRight, Search, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../../store/authStore'
import { useUiStore } from '../../store/uiStore'
import { UserRoleBadge } from '../common/Badge'
import { devicesApi } from '../../api/devices'

const ROUTE_LABELS: Record<string, string> = {
  '': 'Pannello di controllo',
  'sedi': 'Sedi',
  'armadi': 'Armadi',
  'dispositivi': 'Dispositivi',
  'topologia': 'Topologia',
  'patch-panel': 'Patch Panel',
  'switch': 'Switch',
  'connessioni': 'Connessioni',
  'vlan': 'VLAN',
  'prefissi': 'Prefissi IP',
  'scansione': 'Scansione',
  'pianificazione': 'Pianificazione',
  'conflitti': 'Conflitti',
  'storico': 'Storico modifiche',
  'utenti': 'Utenti',
  'vendor': 'Vendor',
  'backup': 'Backup & Restore',
}

const DEVICE_TYPE_LABELS: Record<string, string> = {
  switch: 'Switch', router: 'Router', ap: 'Access Point', server: 'Server',
  firewall: 'Firewall', ups: 'UPS', patch_panel: 'Patch Panel', workstation: 'Workstation',
  printer: 'Stampante', camera: 'Camera', phone: 'Telefono', other: 'Altro',
}

// ─── Global search ────────────────────────────────────────────────────────────

const GlobalSearch: React.FC = () => {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  const { data, isFetching } = useQuery({
    queryKey: ['global-search', q],
    queryFn: () => devicesApi.list({ q, size: 8 }),
    enabled: q.trim().length >= 2,
    staleTime: 10_000,
  })

  const results = data?.items ?? []

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur() }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const handleSelect = (id: number, type: string) => {
    const path = type === 'patch_panel' ? `/patch-panel/${id}` : `/dispositivi/${id}`
    navigate(path)
    setQ('')
    setOpen(false)
  }

  const showDropdown = open && q.trim().length >= 2

  return (
    <div ref={ref} className="relative w-72 hidden md:block">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="Cerca… (⌘K)"
          className="w-full pl-8 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors"
        />
        {q && (
          <button
            onClick={() => { setQ(''); setOpen(false) }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
          {isFetching && results.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-400">Ricerca…</div>
          ) : results.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-400">Nessun risultato per "{q}"</div>
          ) : (
            <ul>
              {results.map(d => (
                <li key={d.id}>
                  <button
                    onClick={() => handleSelect(d.id, d.device_type)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{d.name}</div>
                      <div className="text-xs text-gray-400 truncate">
                        {DEVICE_TYPE_LABELS[d.device_type] ?? d.device_type}
                        {d.primary_ip && <span className="ml-2 font-mono">{d.primary_ip}</span>}
                        {d.cabinet_name && <span className="ml-2">{d.cabinet_name}</span>}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
              {(data?.total ?? 0) > results.length && (
                <li className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100">
                  +{(data?.total ?? 0) - results.length} altri risultati — vai su Dispositivi per cercare
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

// ─── TopBar ───────────────────────────────────────────────────────────────────

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

      {/* Global search */}
      <GlobalSearch />

      {/* User info */}
      <div className="flex items-center gap-2.5 flex-shrink-0">
        {user?.role && <UserRoleBadge role={user.role} />}
        <span className="text-sm font-medium text-gray-700 hidden sm:block">{user?.username}</span>
      </div>
    </header>
  )
}

export default TopBar
