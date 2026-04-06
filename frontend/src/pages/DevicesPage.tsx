import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Columns3, Download, Trash2, Server, CheckSquare, Square } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { devicesApi } from '../api/devices'
import { sitesApi } from '../api/sites'
import { cabinetsApi } from '../api/cabinets'
import { vendorsApi } from '../api/vendors'
import { useAuthStore } from '../store/authStore'
import { useUiStore } from '../store/uiStore'
import { useDevices, useDeleteDevice, useDeviceConnectionsPreview } from '../hooks/useDevices'
import { useCreateCabinet } from '../hooks/useCabinets'
import Table, { Column } from '../components/common/Table'
import Modal from '../components/common/Modal'
import SearchInput from '../components/common/SearchInput'
import Pagination from '../components/common/Pagination'
import LoadingSpinner from '../components/common/LoadingSpinner'
import ConfirmDialog from '../components/common/ConfirmDialog'
import { DeviceTypeBadge, DeviceStatusBadge } from '../components/common/Badge'
import LastSeenBadge from '../components/common/LastSeenBadge'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import type { Device, DeviceCreate, DeviceType, DeviceStatus, DeviceFilters, CabinetCreate, SiteCreate } from '../types'
import { checkmkApi } from '../api/checkmk'
import CheckMKBadge from '../components/common/CheckMKBadge'

const DEVICE_TYPES_WITH_PORTS: DeviceType[] = ['switch', 'router', 'patch_panel', 'phone', 'unmanaged_switch', 'firewall', 'access_point']

// Patch panel are managed via the dedicated Patch Panel section
const DEVICE_TYPES: DeviceType[] = ['switch', 'router', 'access_point', 'server', 'patch_panel', 'pdu', 'firewall', 'ups', 'unmanaged_switch', 'workstation', 'printer', 'camera', 'phone', 'other']

/** Convert any MAC to Cisco XXXX.XXXX.XXXX for display purposes. */
function macToCisco(mac: string): string {
  const bare = mac.replace(/[:\-\.]/g, '').toLowerCase()
  if (bare.length !== 12) return mac
  return `${bare.slice(0,4)}.${bare.slice(4,8)}.${bare.slice(8,12)}`
}
const DEVICE_STATUSES: DeviceStatus[] = ['active', 'inactive', 'planned', 'decommissioned']

const defaultForm: DeviceCreate = {
  name: '', device_type: 'switch', status: 'active',
  primary_ip: null, management_ip: null, mac_address: null, serial_number: null,
  asset_tag: null, cabinet_id: null, u_position: null, u_height: 1,
  vendor_id: null, model: null, os_version: null,
  snmp_community: null, snmp_version: 2, ssh_username: null, ssh_password: null, ssh_port: 22, notes: null,
  port_count: null,
}

const defaultCabinetForm: CabinetCreate = { name: '', site_id: 0, u_count: 42 }

const DevicesPage: React.FC = () => {
  const navigate = useNavigate()
  const { isAdmin } = useAuthStore()
  const { addToast } = useUiStore()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<DeviceFilters>({})
  const [search, setSearch] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editing, setEditing] = useState<Device | null>(null)
  const [form, setForm] = useState<DeviceCreate>(defaultForm)
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Device | null>(null)
  const [previewEnabled, setPreviewEnabled] = useState(false)
  const [colMenuOpen, setColMenuOpen] = useState(false)
  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkAction, setBulkAction] = useState<'cabinet' | 'status' | 'delete' | null>(null)
  const [bulkCabinetId, setBulkCabinetId] = useState<number | ''>('')
  const [bulkStatus, setBulkStatus] = useState<string>('')
  const [bulkConfirmDelete, setBulkConfirmDelete] = useState(false)
  const [showCabinetModal, setShowCabinetModal] = useState(false)
  const [cabinetForm, setCabinetForm] = useState<CabinetCreate>(defaultCabinetForm)
  const [cabinetError, setCabinetError] = useState<string | null>(null)
  const [showSiteModal, setShowSiteModal] = useState(false)
  const [siteForm, setSiteForm] = useState<SiteCreate>({ name: '', address: null })
  const [siteError, setSiteError] = useState<string | null>(null)
  const colMenuRef = useRef<HTMLDivElement>(null)
  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    new Set(['name', 'device_type', 'primary_ip', 'mac_address', 'cabinet', 'status', 'vendor', 'model', 'notes', 'last_seen', 'checkmk'])
  )

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) setColMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggleCol = (key: string) =>
    setVisibleCols(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s })

  const { data, isLoading } = useDevices({ ...filters, search: search || undefined, page, size: 20, exclude_device_type: 'patch_panel' })
  const { data: noCablesCount } = useQuery({
    queryKey: ['devices', 'no-cables-count'],
    queryFn: () => devicesApi.list({ no_cables: true, exclude_device_type: 'patch_panel', size: 1 }),
    staleTime: 60_000,
  })
  const { data: sitesData } = useQuery({ queryKey: ['sites', 'all'], queryFn: () => sitesApi.list({ size: 100 }), staleTime: 60_000 })
  const { data: cabinetsData } = useQuery({ queryKey: ['cabinets', 'all'], queryFn: () => cabinetsApi.list({ size: 100 }), staleTime: 60_000 })
  const { data: vendorsData } = useQuery({ queryKey: ['vendors', 'all'], queryFn: () => vendorsApi.list({ size: 100 }), staleTime: 60_000 })
  const { data: checkmkStatus } = useQuery({ queryKey: ['checkmk', 'status'], queryFn: checkmkApi.getStatus, staleTime: 60_000, retry: false })

  const createCabinet = useCreateCabinet()

  const createSiteInline = useMutation({
    mutationFn: (d: SiteCreate) => sitesApi.create(d),
    onSuccess: (newSite) => {
      qc.invalidateQueries({ queryKey: ['sites'] })
      setCabinetForm((p) => ({ ...p, site_id: newSite.id }))
      setShowSiteModal(false)
      setSiteForm({ name: '', address: null })
      setSiteError(null)
    },
    onError: () => setSiteError('Errore durante la creazione della locazione'),
  })

  const handleCreateSiteInline = () => {
    if (!siteForm.name.trim()) { setSiteError('Il nome è obbligatorio'); return }
    createSiteInline.mutate(siteForm)
  }

  const handleCreateCabinet = () => {
    if (!cabinetForm.name) { setCabinetError('Il nome è obbligatorio'); return }
    if (!cabinetForm.site_id) { setCabinetError('Seleziona una locazione (o creane una con il pulsante +)'); return }
    createCabinet.mutate(cabinetForm, {
      onSuccess: (newCab) => {
        qc.invalidateQueries({ queryKey: ['cabinets'], exact: false })
        setForm((p) => ({ ...p, cabinet_id: newCab.id }))
        setShowCabinetModal(false)
        setCabinetForm(defaultCabinetForm)
        setCabinetError(null)
      },
      onError: () => setCabinetError('Errore durante la creazione dell\'armadio'),
    })
  }

  const createDevice = useMutation({
    mutationFn: (d: DeviceCreate) => devicesApi.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['devices'] }); addToast('Dispositivo creato', 'success'); closeModal() },
    onError: () => { setError('Errore durante il salvataggio'); addToast('Errore durante la creazione', 'error') },
  })

  const updateDevice = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<DeviceCreate> }) => devicesApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['devices'] }); addToast('Dispositivo aggiornato', 'success'); closeModal() },
    onError: () => { setError('Errore durante il salvataggio'); addToast('Errore durante il salvataggio', 'error') },
  })

  const deleteDevice = useDeleteDevice()
  const { data: connectionsPreview, isLoading: previewLoading } = useDeviceConnectionsPreview(deleteTarget?.id, previewEnabled)

  const bulkUpdateMutation = useMutation({
    mutationFn: (args: { ids: number[]; data: { cabinet_id?: number | null; status?: string } }) =>
      devicesApi.bulkUpdate(args.ids, args.data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['devices'] })
      addToast(`${res.updated} dispositivi aggiornati`, 'success')
      setSelectedIds(new Set())
      setBulkAction(null)
    },
    onError: () => addToast('Errore durante l\'aggiornamento bulk', 'error'),
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: number[]) => devicesApi.bulkDelete(ids),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['devices'] })
      addToast(`${res.deleted} dispositivi eliminati`, 'success')
      setSelectedIds(new Set())
      setBulkAction(null)
      setBulkConfirmDelete(false)
    },
    onError: () => addToast('Errore durante l\'eliminazione bulk', 'error'),
  })

  const toggleSelect = (id: number) => setSelectedIds(prev => {
    const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s
  })
  const toggleSelectAll = () => {
    const pageIds = (data?.items ?? []).map(d => d.id)
    const allSelected = pageIds.every(id => selectedIds.has(id))
    setSelectedIds(prev => {
      const s = new Set(prev)
      if (allSelected) pageIds.forEach(id => s.delete(id))
      else pageIds.forEach(id => s.add(id))
      return s
    })
  }
  const pageIds = (data?.items ?? []).map(d => d.id)
  const allPageSelected = pageIds.length > 0 && pageIds.every(id => selectedIds.has(id))
  const somePageSelected = pageIds.some(id => selectedIds.has(id))

  const openCreate = () => { setEditing(null); setForm(defaultForm); setError(null); setIsModalOpen(true) }
  const openEdit = (d: Device) => {
    setEditing(d)
    setForm({
      name: d.name, device_type: d.device_type, status: d.status,
      primary_ip: d.primary_ip, management_ip: d.management_ip,
      mac_address: d.mac_address,
      serial_number: d.serial_number, asset_tag: d.asset_tag,
      cabinet_id: d.cabinet_id, u_position: d.u_position, u_height: d.u_height,
      vendor_id: d.vendor_id, model: d.model, os_version: d.os_version,
      snmp_community: d.snmp_community, snmp_version: d.snmp_version,
      ssh_username: d.ssh_username, ssh_password: null, ssh_port: d.ssh_port ?? undefined, notes: d.notes,
    })
    setError(null)
    setIsModalOpen(true)
  }
  const closeModal = () => { setIsModalOpen(false); setEditing(null); setError(null) }

  const exportCsv = async () => {
    const all = await devicesApi.list({ ...filters, search: search || undefined, size: 9999, exclude_device_type: 'patch_panel' })
    const rows = all.items
    const headers = ['Nome', 'Tipo', 'Stato', 'IP Primario', 'MAC', 'Armadio', 'Vendor', 'Modello', 'IP Gestione', 'Ultimo scan', 'Note']
    const escape = (v: string | null | undefined) => {
      if (v == null) return ''
      const s = String(v)
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
    }
    const lines = [
      headers.join(','),
      ...rows.map(d => [
        d.name, d.device_type, d.status, d.primary_ip, d.mac_address,
        d.cabinet_name, d.vendor_name, d.model, d.management_ip,
        d.last_seen ? new Date(d.last_seen).toLocaleString('it-IT') : '',
        d.notes,
      ].map(escape).join(',')),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `dispositivi_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name) { setError('Il nome è obbligatorio'); return }
    if (editing) updateDevice.mutate({ id: editing.id, data: form })
    else createDevice.mutate(form)
  }

  const allColumns: Column<Device>[] = [
    { key: 'select', header: (
      <button onClick={(e) => { e.stopPropagation(); toggleSelectAll() }} className="p-0.5 text-gray-400 hover:text-primary-600">
        {allPageSelected ? <CheckSquare size={16} className="text-primary-600" /> : somePageSelected ? <CheckSquare size={16} className="text-gray-400" /> : <Square size={16} />}
      </button>
    ) as any, render: (d) => (
      <button onClick={(e) => { e.stopPropagation(); toggleSelect(d.id) }} className="p-0.5 text-gray-400 hover:text-primary-600">
        {selectedIds.has(d.id) ? <CheckSquare size={16} className="text-primary-600" /> : <Square size={16} />}
      </button>
    )},
    { key: 'name', header: 'Nome', sortable: true, render: (d) => {
      const nameIsIp = d.name === d.primary_ip
      const label = nameIsIp && d.notes ? d.notes : d.name
      const sub = nameIsIp && d.notes ? d.name : null
      return (
        <div>
          <span className={`font-medium ${nameIsIp && !d.notes ? 'text-gray-400 font-mono text-xs' : 'text-gray-900'}`}>{label}</span>
          {sub && <div className="text-xs text-gray-400 font-mono leading-tight">{sub}</div>}
        </div>
      )
    }},
    { key: 'device_type', header: 'Tipo', render: (d) => <DeviceTypeBadge type={d.device_type} /> },
    { key: 'primary_ip', header: 'IP', render: (d) => <span className="text-gray-600 font-mono text-xs">{d.primary_ip ?? '—'}</span> },
    { key: 'mac_address', header: 'MAC', render: (d) => (
      d.mac_address
        ? <span className="text-gray-500 font-mono text-xs">{d.mac_address}</span>
        : <span className="text-gray-300 text-xs">—</span>
    )},
    { key: 'cabinet', header: 'Armadio', render: (d) => <span className="text-gray-500 text-xs">{d.cabinet_name ?? '—'}</span> },
    { key: 'status', header: 'Stato', render: (d) => <DeviceStatusBadge status={d.status} /> },
    { key: 'vendor', header: 'Vendor', render: (d) => <span className="text-gray-500 text-xs">{d.vendor_name ?? '—'}</span> },
    { key: 'model', header: 'Modello', render: (d) => <span className="text-gray-600 text-xs">{d.model ?? '—'}</span> },
    { key: 'notes', header: 'Note', render: (d) => (
      d.notes
        ? <span className="text-gray-600 text-xs max-w-xs truncate block" title={d.notes}>{d.notes}</span>
        : <span className="text-gray-300 text-xs">—</span>
    )},
    { key: 'last_seen', header: 'Ultimo scan', render: (d) => (
      <div className="flex items-center gap-1.5">
        <LastSeenBadge lastSeen={d.last_seen} compact />
        <span className="text-gray-400 text-xs">{d.last_seen ? format(new Date(d.last_seen), 'dd/MM HH:mm', { locale: it }) : '—'}</span>
      </div>
    )},
    { key: 'checkmk', header: 'CheckMK', render: (d) => {
      if (!checkmkStatus) return null
      const s = checkmkStatus[d.id]
      if (!s) return d.checkmk_host_name ? <CheckMKBadge status="not_found" /> : null
      return <CheckMKBadge status={s.state_label as any} />
    }},
  ]

  const columns: Column<Device>[] = allColumns.filter(c => c.key === 'actions' || c.key === 'select' || visibleCols.has(c.key as string))

  if (isAdmin()) {
    allColumns.push({ key: 'actions', header: '', render: (d) => (
      <div className="flex gap-2">
        <button onClick={(e) => { e.stopPropagation(); openEdit(d) }} className="text-xs text-primary-600 hover:underline">Modifica</button>
        <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(d); setPreviewEnabled(true) }} className="text-xs text-red-500 hover:underline">Elimina</button>
      </div>
    )})
  }

  const f = (label: string, key: keyof DeviceCreate, type: string = 'text', props?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        value={(form[key] as string | number | undefined) ?? ''}
        onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value || null }))}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        {...props}
      />
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dispositivi</h1>
          <p className="text-sm text-gray-500 mt-1">Gestisci i dispositivi di rete</p>
        </div>
        {isAdmin() && (
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700">
            <Plus size={16} />Nuovo Dispositivo
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap bg-white rounded-xl border border-gray-200 p-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Cerca dispositivo..." className="w-64" />
        <select value={filters.device_type ?? ''} onChange={(e) => setFilters((f) => ({ ...f, device_type: e.target.value as DeviceType || undefined }))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
          <option value="">Tutti i tipi</option>
          {DEVICE_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
        </select>
        <select value={filters.status ?? ''} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as DeviceStatus || undefined }))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
          <option value="">Tutti gli stati</option>
          <option value="active">Attivo</option>
          <option value="inactive">Inattivo</option>
          <option value="planned">Pianificato</option>
          <option value="decommissioned">Dismesso</option>
        </select>
        <select value={filters.site_id ?? ''} onChange={(e) => setFilters((f) => ({ ...f, site_id: e.target.value ? Number(e.target.value) : undefined }))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
          <option value="">Tutte le sedi</option>
          {sitesData?.items.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        {/* Senza connessioni toggle */}
        <label className="flex items-center gap-2 cursor-pointer select-none px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors">
          <input
            type="checkbox"
            checked={!!filters.no_cables}
            onChange={e => { setFilters(f => ({ ...f, no_cables: e.target.checked || undefined })); setPage(1) }}
            className="rounded border-gray-300 text-orange-500 focus:ring-orange-400"
          />
          <span className="text-sm text-gray-700 whitespace-nowrap">
            Senza connessioni
            {noCablesCount && noCablesCount.total > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700">
                {noCablesCount.total}
              </span>
            )}
          </span>
        </label>

        {/* Export CSV */}
        <button
          onClick={exportCsv}
          className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600 ml-auto"
          title="Esporta CSV"
        >
          <Download size={14} />
          CSV
        </button>

        {/* Column visibility toggle */}
        <div className="relative" ref={colMenuRef}>
          <button
            onClick={() => setColMenuOpen(p => !p)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
          >
            <Columns3 size={14} />
            Colonne
          </button>
          {colMenuOpen && (
            <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-xl shadow-lg p-3 min-w-[160px]">
              {[
                { key: 'name', label: 'Nome' },
                { key: 'primary_ip', label: 'IP' },
                { key: 'mac_address', label: 'MAC' },
                { key: 'cabinet', label: 'Armadio' },
                { key: 'status', label: 'Stato' },
                { key: 'vendor', label: 'Vendor' },
                { key: 'model', label: 'Modello' },
                { key: 'notes', label: 'Note' },
                { key: 'last_seen', label: 'Ultimo scan' },
              ].map(col => (
                <label key={col.key} className="flex items-center gap-2 py-1 cursor-pointer text-sm text-gray-700 hover:text-gray-900">
                  <input
                    type="checkbox"
                    checked={visibleCols.has(col.key)}
                    onChange={() => toggleCol(col.key)}
                    className="rounded text-primary-600"
                  />
                  {col.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {isLoading ? <LoadingSpinner centered /> : (
        <>
          <Table columns={columns} data={data?.items ?? []} keyExtractor={(d) => d.id} onRowClick={(d) => navigate(`/dispositivi/${d.id}`)} emptyTitle="Nessun dispositivo" emptyDescription="Crea il primo dispositivo." />
          {data && <Pagination page={page} pages={data.pages} total={data.total} size={data.size} onPageChange={setPage} />}
        </>
      )}

      {/* ── Bulk action floating bar ─────────────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-gray-900 text-white rounded-2xl shadow-2xl px-5 py-3 animate-in slide-in-from-bottom-4 duration-200">
          <span className="text-sm font-medium text-gray-300 whitespace-nowrap">{selectedIds.size} selezionati</span>
          <div className="w-px h-5 bg-gray-600" />

          {/* Sposta in armadio */}
          {bulkAction === 'cabinet' ? (
            <div className="flex items-center gap-2">
              <select
                value={bulkCabinetId}
                onChange={e => setBulkCabinetId(e.target.value ? Number(e.target.value) : '')}
                className="text-sm bg-gray-800 border border-gray-600 rounded-lg px-2 py-1 text-white"
              >
                <option value="">— seleziona armadio —</option>
                <option value="0">Nessun armadio</option>
                {cabinetsData?.items.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button
                onClick={() => bulkUpdateMutation.mutate({ ids: Array.from(selectedIds), data: { cabinet_id: bulkCabinetId === '' ? undefined : bulkCabinetId === 0 ? null : bulkCabinetId } })}
                disabled={bulkCabinetId === '' || bulkUpdateMutation.isPending}
                className="px-3 py-1 text-sm bg-primary-600 hover:bg-primary-500 rounded-lg disabled:opacity-50"
              >Applica</button>
              <button onClick={() => setBulkAction(null)} className="px-2 py-1 text-sm text-gray-400 hover:text-white">✕</button>
            </div>
          ) : (
            <button onClick={() => { setBulkAction('cabinet'); setBulkCabinetId('') }}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg hover:bg-gray-700 transition-colors">
              <Server size={14} />Sposta armadio
            </button>
          )}

          <div className="w-px h-5 bg-gray-600" />

          {/* Cambia stato */}
          {bulkAction === 'status' ? (
            <div className="flex items-center gap-2">
              <select
                value={bulkStatus}
                onChange={e => setBulkStatus(e.target.value)}
                className="text-sm bg-gray-800 border border-gray-600 rounded-lg px-2 py-1 text-white"
              >
                <option value="">— seleziona stato —</option>
                <option value="active">Attivo</option>
                <option value="inactive">Inattivo</option>
                <option value="planned">Pianificato</option>
                <option value="decommissioned">Dismesso</option>
              </select>
              <button
                onClick={() => bulkUpdateMutation.mutate({ ids: Array.from(selectedIds), data: { status: bulkStatus } })}
                disabled={!bulkStatus || bulkUpdateMutation.isPending}
                className="px-3 py-1 text-sm bg-primary-600 hover:bg-primary-500 rounded-lg disabled:opacity-50"
              >Applica</button>
              <button onClick={() => setBulkAction(null)} className="px-2 py-1 text-sm text-gray-400 hover:text-white">✕</button>
            </div>
          ) : (
            <button onClick={() => { setBulkAction('status'); setBulkStatus('') }}
              className="text-sm px-3 py-1.5 rounded-lg hover:bg-gray-700 transition-colors">
              Cambia stato
            </button>
          )}

          <div className="w-px h-5 bg-gray-600" />

          {/* Elimina */}
          {bulkConfirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-red-400">Eliminare {selectedIds.size} dispositivi?</span>
              <button
                onClick={() => bulkDeleteMutation.mutate(Array.from(selectedIds))}
                disabled={bulkDeleteMutation.isPending}
                className="px-3 py-1 text-sm bg-red-600 hover:bg-red-500 rounded-lg disabled:opacity-50"
              >Conferma</button>
              <button onClick={() => setBulkConfirmDelete(false)} className="px-2 py-1 text-sm text-gray-400 hover:text-white">✕</button>
            </div>
          ) : (
            <button onClick={() => setBulkConfirmDelete(true)}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg hover:bg-red-800 text-red-400 hover:text-red-300 transition-colors">
              <Trash2 size={14} />Elimina
            </button>
          )}

          <div className="w-px h-5 bg-gray-600" />
          <button onClick={() => { setSelectedIds(new Set()); setBulkAction(null); setBulkConfirmDelete(false) }}
            className="text-sm text-gray-400 hover:text-white px-2">
            Annulla
          </button>
        </div>
      )}

      {/* Create/Edit modal */}
      <Modal isOpen={isModalOpen} onClose={closeModal} title={editing ? 'Modifica dispositivo' : 'Nuovo dispositivo'} size="xl"
        footer={
          <>
            <button onClick={closeModal} className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Annulla</button>
            <button onClick={handleSubmit} disabled={createDevice.isPending || updateDevice.isPending} className="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
              {createDevice.isPending || updateDevice.isPending ? 'Salvataggio...' : 'Salva'}
            </button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {f('Nome *', 'name')}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo *</label>
              <select value={form.device_type} onChange={(e) => setForm((p) => ({ ...p, device_type: e.target.value as DeviceType }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                {DEVICE_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stato</label>
              <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as DeviceStatus }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                {DEVICE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
              <select value={form.vendor_id ?? ''} onChange={(e) => setForm((p) => ({ ...p, vendor_id: e.target.value ? Number(e.target.value) : null }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                <option value="">-- Nessun vendor --</option>
                {vendorsData?.items.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            {f('Modello', 'model')}
            {f('IP primario', 'primary_ip')}
            {f('IP di gestione', 'management_ip')}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">MAC Address</label>
              <input
                type="text"
                value={form.mac_address ?? ''}
                onChange={(e) => setForm((p) => ({ ...p, mac_address: e.target.value || null }))}
                placeholder="es. AA:BB:CC:DD:EE:FF o AABB.CCDD.EEFF"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono"
              />
              {form.mac_address && (
                <p className="text-xs text-gray-400 mt-1">
                  Cisco: <span className="font-mono">{macToCisco(form.mac_address)}</span>
                </p>
              )}
            </div>
            {f('Numero seriale', 'serial_number')}
            {f('Asset tag', 'asset_tag')}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Armadio</label>
              <div className="flex gap-1">
                <select value={form.cabinet_id ?? ''} onChange={(e) => setForm((p) => ({ ...p, cabinet_id: e.target.value ? Number(e.target.value) : null }))} className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                  <option value="">-- Nessun armadio --</option>
                  {cabinetsData?.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {isAdmin() && (
                  <button type="button" onClick={() => { setCabinetForm(defaultCabinetForm); setCabinetError(null); setShowCabinetModal(true) }}
                    className="px-2 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600" title="Crea nuovo armadio">
                    <Plus size={16} />
                  </button>
                )}
              </div>
            </div>
            {f('Posizione U', 'u_position', 'number')}
            {f('Altezza U', 'u_height', 'number')}
            {!editing && DEVICE_TYPES_WITH_PORTS.includes(form.device_type) && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Numero porte</label>
                <input
                  type="number"
                  min={1}
                  max={512}
                  value={form.port_count ?? ''}
                  onChange={(e) => setForm((p) => ({ ...p, port_count: e.target.value ? Number(e.target.value) : null }))}
                  placeholder="es. 24"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <p className="text-xs text-gray-400 mt-1">Crea automaticamente le porte nella tab Interfacce</p>
              </div>
            )}
          </div>
          <details className="border border-gray-200 rounded-lg">
            <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-gray-700 hover:bg-gray-50">Configurazione SNMP / SSH</summary>
            <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
              {f('Community SNMP', 'snmp_community')}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Versione SNMP</label>
                <select value={form.snmp_version} onChange={(e) => setForm((p) => ({ ...p, snmp_version: Number(e.target.value) }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                  <option value={1}>v1</option>
                  <option value={2}>v2c</option>
                  <option value={3}>v3</option>
                </select>
              </div>
              {f('Username SSH', 'ssh_username')}
              {f('Password SSH', 'ssh_password', 'password')}
              {f('Porta SSH', 'ssh_port', 'number')}
            </div>
          </details>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
            <textarea value={form.notes ?? ''} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value || null }))} rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
          </div>
        </form>
      </Modal>

      {/* Inline cabinet creation modal */}
      <Modal isOpen={showCabinetModal} onClose={() => setShowCabinetModal(false)} title="Nuovo armadio" size="sm"
        footer={
          <>
            <button onClick={() => setShowCabinetModal(false)} className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Annulla</button>
            <button onClick={handleCreateCabinet} disabled={createCabinet.isPending} className="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
              {createCabinet.isPending ? 'Salvataggio...' : 'Crea'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {cabinetError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{cabinetError}</p>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
            <input type="text" value={cabinetForm.name} onChange={(e) => setCabinetForm((p) => ({ ...p, name: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="es. Armadio A1" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Locazione *</label>
            <div className="flex gap-1">
              <select value={cabinetForm.site_id} onChange={(e) => setCabinetForm((p) => ({ ...p, site_id: Number(e.target.value) }))}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                <option value={0}>-- Seleziona locazione --</option>
                {sitesData?.items.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <button type="button" onClick={() => { setSiteForm({ name: '', address: null }); setSiteError(null); setShowSiteModal(true) }}
                className="px-2 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600" title="Crea nuova locazione">
                <Plus size={16} />
              </button>
            </div>
            {!sitesData?.items.length && (
              <p className="text-xs text-amber-600 mt-1">Nessuna locazione. Creane una con il pulsante +</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dimensione (U)</label>
            <input type="number" min={1} max={100} value={cabinetForm.u_count ?? 42}
              onChange={(e) => setCabinetForm((p) => ({ ...p, u_count: Number(e.target.value) }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
        </div>
      </Modal>

      {/* Inline site creation modal (from cabinet modal) */}
      <Modal isOpen={showSiteModal} onClose={() => setShowSiteModal(false)} title="Nuova locazione" size="sm"
        footer={
          <>
            <button onClick={() => setShowSiteModal(false)} className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Annulla</button>
            <button onClick={handleCreateSiteInline} disabled={createSiteInline.isPending} className="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
              {createSiteInline.isPending ? 'Salvataggio...' : 'Crea'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {siteError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{siteError}</p>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
            <input type="text" value={siteForm.name} onChange={(e) => setSiteForm((p) => ({ ...p, name: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="es. Locazione principale" autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Indirizzo (opzionale)</label>
            <input type="text" value={siteForm.address ?? ''} onChange={(e) => setSiteForm((p) => ({ ...p, address: e.target.value || null }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="es. Via Roma 1, Milano" />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => { setDeleteTarget(null); setPreviewEnabled(false) }}
        onConfirm={() => {
          if (deleteTarget) deleteDevice.mutate(deleteTarget.id, { onSuccess: () => { setDeleteTarget(null); setPreviewEnabled(false) } })
        }}
        title="Elimina dispositivo"
        message={
          previewLoading
            ? `Verifica connessioni di "${deleteTarget?.name}" in corso...`
            : connectionsPreview && connectionsPreview.cables_total > 0
              ? connectionsPreview.pp_connections.length > 0
                ? `⚠️ "${deleteTarget?.name}" ha ${connectionsPreview.cables_total} cavo/i attivi, di cui ${connectionsPreview.pp_connections.length} verso patch panel:\n${connectionsPreview.pp_connections.map(c => `• ${c.pp_name} — ${c.pp_port} ↔ ${c.device_port}`).join('\n')}\n\nI cavi verranno rimossi. Le porte del patch panel rimarranno disponibili.`
                : `"${deleteTarget?.name}" ha ${connectionsPreview.cables_total} cavo/i attivi che verranno rimossi. Continuare?`
              : `Sei sicuro di voler eliminare "${deleteTarget?.name}"? L'operazione non può essere annullata.`
        }
        confirmLabel="Elimina"
        isLoading={deleteDevice.isPending || previewLoading}
        variant={connectionsPreview && connectionsPreview.pp_connections.length > 0 ? 'warning' : 'danger'}
      />
    </div>
  )
}

export default DevicesPage
