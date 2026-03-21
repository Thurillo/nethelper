import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { devicesApi } from '../api/devices'
import { sitesApi } from '../api/sites'
import { cabinetsApi } from '../api/cabinets'
import { vendorsApi } from '../api/vendors'
import { useAuthStore } from '../store/authStore'
import { useDevices, useDeleteDevice } from '../hooks/useDevices'
import Table, { Column } from '../components/common/Table'
import Modal from '../components/common/Modal'
import SearchInput from '../components/common/SearchInput'
import Pagination from '../components/common/Pagination'
import LoadingSpinner from '../components/common/LoadingSpinner'
import ConfirmDialog from '../components/common/ConfirmDialog'
import { DeviceTypeBadge, DeviceStatusBadge } from '../components/common/Badge'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import type { Device, DeviceCreate, DeviceType, DeviceStatus, DeviceFilters } from '../types'

// Patch panel are managed via the dedicated Patch Panel section
const DEVICE_TYPES: DeviceType[] = ['switch', 'router', 'ap', 'server', 'firewall', 'ups', 'workstation', 'printer', 'camera', 'phone', 'other']

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
}

const DevicesPage: React.FC = () => {
  const navigate = useNavigate()
  const { isAdmin } = useAuthStore()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<DeviceFilters>({})
  const [search, setSearch] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editing, setEditing] = useState<Device | null>(null)
  const [form, setForm] = useState<DeviceCreate>(defaultForm)
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Device | null>(null)

  const { data, isLoading } = useDevices({ ...filters, search: search || undefined, page, size: 20, exclude_device_type: 'patch_panel' })
  const { data: sitesData } = useQuery({ queryKey: ['sites', 'all'], queryFn: () => sitesApi.list({ size: 100 }), staleTime: 60_000 })
  const { data: cabinetsData } = useQuery({ queryKey: ['cabinets', 'all'], queryFn: () => cabinetsApi.list({ size: 100 }), staleTime: 60_000 })
  const { data: vendorsData } = useQuery({ queryKey: ['vendors', 'all'], queryFn: () => vendorsApi.list({ size: 100 }), staleTime: 60_000 })

  const createDevice = useMutation({
    mutationFn: (d: DeviceCreate) => devicesApi.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['devices'] }); closeModal() },
    onError: () => setError('Errore durante il salvataggio'),
  })

  const updateDevice = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<DeviceCreate> }) => devicesApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['devices'] }); closeModal() },
    onError: () => setError('Errore durante il salvataggio'),
  })

  const deleteDevice = useDeleteDevice()

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
      ssh_username: d.ssh_username, ssh_password: null, ssh_port: d.ssh_port, notes: d.notes,
    })
    setError(null)
    setIsModalOpen(true)
  }
  const closeModal = () => { setIsModalOpen(false); setEditing(null); setError(null) }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name) { setError('Il nome è obbligatorio'); return }
    if (editing) updateDevice.mutate({ id: editing.id, data: form })
    else createDevice.mutate(form)
  }

  const columns: Column<Device>[] = [
    { key: 'name', header: 'Nome', sortable: true, render: (d) => <span className="font-medium text-gray-900">{d.name}</span> },
    { key: 'device_type', header: 'Tipo', render: (d) => <DeviceTypeBadge type={d.device_type} /> },
    { key: 'primary_ip', header: 'IP', render: (d) => <span className="text-gray-600 font-mono text-xs">{d.primary_ip ?? '—'}</span> },
    { key: 'mac_address', header: 'MAC', render: (d) => (
      d.mac_address
        ? <span className="text-gray-500 font-mono text-xs" title={`Cisco: ${d.mac_address_cisco ?? '—'}`}>{d.mac_address}</span>
        : <span className="text-gray-300 text-xs">—</span>
    )},
    { key: 'cabinet', header: 'Armadio', render: (d) => <span className="text-gray-500 text-xs">{d.cabinet_name ?? '—'}</span> },
    { key: 'status', header: 'Stato', render: (d) => <DeviceStatusBadge status={d.status} /> },
    { key: 'last_scan_at', header: 'Ultimo scan', render: (d) => <span className="text-gray-400 text-xs">{d.last_scan_at ? format(new Date(d.last_scan_at), 'dd/MM HH:mm', { locale: it }) : '—'}</span> },
  ]

  if (isAdmin()) {
    columns.push({ key: 'actions', header: '', render: (d) => (
      <div className="flex gap-2">
        <button onClick={(e) => { e.stopPropagation(); openEdit(d) }} className="text-xs text-primary-600 hover:underline">Modifica</button>
        <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(d) }} className="text-xs text-red-500 hover:underline">Elimina</button>
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
      </div>

      {isLoading ? <LoadingSpinner centered /> : (
        <>
          <Table columns={columns} data={data?.items ?? []} keyExtractor={(d) => d.id} onRowClick={(d) => navigate(`/dispositivi/${d.id}`)} emptyTitle="Nessun dispositivo" emptyDescription="Crea il primo dispositivo." />
          {data && <Pagination page={page} pages={data.pages} total={data.total} size={data.size} onPageChange={setPage} />}
        </>
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
          <div className="grid grid-cols-2 gap-4">
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
              <select value={form.cabinet_id ?? ''} onChange={(e) => setForm((p) => ({ ...p, cabinet_id: e.target.value ? Number(e.target.value) : null }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                <option value="">-- Nessun armadio --</option>
                {cabinetsData?.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            {f('Posizione U', 'u_position', 'number')}
            {f('Altezza U', 'u_height', 'number')}
          </div>
          <details className="border border-gray-200 rounded-lg">
            <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-gray-700 hover:bg-gray-50">Configurazione SNMP / SSH</summary>
            <div className="px-4 pb-4 grid grid-cols-2 gap-4 mt-2">
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

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) deleteDevice.mutate(deleteTarget.id); setDeleteTarget(null) }}
        title="Elimina dispositivo"
        message={`Sei sicuro di voler eliminare "${deleteTarget?.name}"? L'operazione non può essere annullata.`}
        confirmLabel="Elimina"
        isLoading={deleteDevice.isPending}
      />
    </div>
  )
}

export default DevicesPage
