import React, { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Edit2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useDevice, useDeviceInterfaces, useDeviceIpAddresses, useDeviceMacEntries, useUpdateDevice } from '../hooks/useDevices'
import { cabinetsApi } from '../api/cabinets'
import { vendorsApi } from '../api/vendors'
import { DeviceTypeBadge, DeviceStatusBadge } from '../components/common/Badge'
import LoadingSpinner from '../components/common/LoadingSpinner'
import Modal from '../components/common/Modal'
import ScanLauncher from '../components/scan/ScanLauncher'
import ScanJobList from '../components/scan/ScanJobList'
import ScanResultPanel from '../components/scan/ScanResultPanel'
import Table, { Column } from '../components/common/Table'
import { useAuthStore } from '../store/authStore'
import type { NetworkInterface, IpAddress, MacEntry, ScanJob, DeviceStatus, DeviceType } from '../types'

type TabKey = 'interfacce' | 'ip' | 'mac' | 'scansioni'

const DEVICE_TYPES: DeviceType[] = ['switch', 'router', 'ap', 'server', 'firewall', 'ups', 'workstation', 'printer', 'camera', 'phone', 'other']
const DEVICE_STATUSES: DeviceStatus[] = ['active', 'inactive', 'planned', 'decommissioned']

const DeviceDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const deviceId = Number(id)
  const { isAdmin } = useAuthStore()
  const [activeTab, setActiveTab] = useState<TabKey>('interfacce')
  const [selectedJob, setSelectedJob] = useState<ScanJob | null>(null)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Record<string, unknown>>({})

  const { data: device, isLoading } = useDevice(deviceId)
  const { data: interfaces } = useDeviceInterfaces(deviceId)
  const { data: ipAddresses } = useDeviceIpAddresses(deviceId)
  const { data: macData } = useDeviceMacEntries(deviceId)
  const { data: cabinetsData } = useQuery({ queryKey: ['cabinets', 'all'], queryFn: () => cabinetsApi.list({ size: 100 }), staleTime: 60_000 })
  const { data: vendorsData } = useQuery({ queryKey: ['vendors', 'all'], queryFn: () => vendorsApi.list({ size: 100 }), staleTime: 60_000 })
  const updateDevice = useUpdateDevice()

  const openEdit = () => {
    if (!device) return
    setEditForm({
      name: device.name,
      device_type: device.device_type,
      status: device.status,
      primary_ip: device.primary_ip ?? '',
      management_ip: device.management_ip ?? '',
      cabinet_id: device.cabinet_id ?? '',
      vendor_id: device.vendor_id ?? '',
      model: device.model ?? '',
      notes: device.notes ?? '',
    })
    setEditError(null)
    setIsEditOpen(true)
  }

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateDevice.mutate(
      { id: deviceId, data: {
        name: editForm.name as string,
        device_type: editForm.device_type as DeviceType,
        status: editForm.status as DeviceStatus,
        primary_ip: (editForm.primary_ip as string) || null,
        management_ip: (editForm.management_ip as string) || null,
        cabinet_id: editForm.cabinet_id ? Number(editForm.cabinet_id) : null,
        vendor_id: editForm.vendor_id ? Number(editForm.vendor_id) : null,
        model: (editForm.model as string) || null,
        notes: (editForm.notes as string) || null,
      }},
      { onSuccess: () => setIsEditOpen(false), onError: () => setEditError('Errore durante il salvataggio') }
    )
  }

  if (isLoading) return <LoadingSpinner centered />
  if (!device) return <div className="text-center text-gray-500 py-12">Dispositivo non trovato</div>

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: 'interfacce', label: 'Interfacce', count: interfaces?.length },
    { key: 'ip', label: 'Indirizzi IP', count: ipAddresses?.length },
    { key: 'mac', label: 'Tabella MAC', count: macData?.total },
    { key: 'scansioni', label: 'Scansioni' },
  ]

  const interfaceColumns: Column<NetworkInterface>[] = [
    { key: 'name', header: 'Nome', render: (i) => <span className="font-mono text-sm font-medium">{i.name}</span> },
    { key: 'label', header: 'Etichetta', render: (i) => <span className="text-gray-500">{i.label ?? '—'}</span> },
    { key: 'interface_type', header: 'Tipo', render: (i) => <span className="text-xs text-gray-600">{i.interface_type}</span> },
    { key: 'mac_address', header: 'MAC', render: (i) => <span className="font-mono text-xs text-gray-600">{i.mac_address ?? '—'}</span> },
    { key: 'speed_mbps', header: 'Velocità', render: (i) => <span className="text-gray-500 text-xs">{i.speed_mbps ? `${i.speed_mbps} Mbps` : '—'}</span> },
    { key: 'room_destination', header: 'Stanza', render: (i) => <span className="text-gray-500 text-xs">{i.room_destination ?? '—'}</span> },
    { key: 'is_enabled', header: 'Stato', render: (i) => <span className={`text-xs font-medium ${i.is_enabled ? 'text-green-600' : 'text-gray-400'}`}>{i.is_enabled ? 'Attiva' : 'Disattiva'}</span> },
  ]

  const ipColumns: Column<IpAddress>[] = [
    { key: 'address', header: 'Indirizzo', render: (ip) => <span className="font-mono text-sm font-medium">{ip.address}</span> },
    { key: 'dns_name', header: 'DNS', render: (ip) => <span className="text-gray-500">{ip.dns_name ?? '—'}</span> },
    { key: 'status', header: 'Stato', render: (ip) => <span className="text-xs text-gray-600">{ip.status}</span> },
    { key: 'source', header: 'Sorgente', render: (ip) => <span className="text-xs text-gray-500">{ip.source}</span> },
    { key: 'last_seen', header: 'Ultimo visto', render: (ip) => <span className="text-gray-400 text-xs">{ip.last_seen ? format(new Date(ip.last_seen), 'dd/MM HH:mm', { locale: it }) : '—'}</span> },
  ]

  const macColumns: Column<MacEntry>[] = [
    { key: 'mac_address', header: 'MAC', render: (m) => <span className="font-mono text-sm">{m.mac_address}</span> },
    { key: 'ip_address', header: 'IP', render: (m) => <span className="text-gray-600 font-mono text-xs">{m.ip_address ?? '—'}</span> },
    { key: 'interface', header: 'Interfaccia', render: (m) => <span className="text-gray-500 text-xs">{m.interface?.name ?? '—'}</span> },
    { key: 'vlan', header: 'VLAN', render: (m) => <span className="text-gray-500 text-xs">{m.vlan ? `${m.vlan.vid} — ${m.vlan.name}` : '—'}</span> },
    { key: 'last_seen', header: 'Ultimo visto', render: (m) => <span className="text-gray-400 text-xs">{format(new Date(m.last_seen), 'dd/MM HH:mm', { locale: it })}</span> },
  ]

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <Link to="/dispositivi" className="hover:text-gray-700">Dispositivi</Link>
        <span>/</span>
        <span className="text-gray-900">{device.name}</span>
      </nav>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">{device.name}</h1>
              <DeviceTypeBadge type={device.device_type} />
              <DeviceStatusBadge status={device.status} />
              {isAdmin() && (
                <button
                  onClick={openEdit}
                  className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
                >
                  <Edit2 size={13} />
                  Modifica
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
              <div>
                <p className="text-xs text-gray-500">IP primario</p>
                <p className="text-sm font-mono font-medium">{device.primary_ip ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Armadio</p>
                <p className="text-sm">{device.cabinet_name ?? device.cabinet?.name ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Vendor / Modello</p>
                <p className="text-sm">{device.vendor_name ?? device.vendor?.name ?? '—'} {device.model ?? ''}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Ultimo scan</p>
                <p className="text-sm">{device.last_seen ? format(new Date(device.last_seen), 'dd/MM HH:mm', { locale: it }) : '—'}</p>
              </div>
              {device.mac_address && (
                <div>
                  <p className="text-xs text-gray-500">MAC Address</p>
                  <p className="text-sm font-mono" title={`Cisco: ${device.mac_address_cisco ?? '—'}`}>{device.mac_address}</p>
                  {device.mac_address_cisco && (
                    <p className="text-xs text-gray-400 font-mono">{device.mac_address_cisco}</p>
                  )}
                </div>
              )}
              {device.serial_number && (
                <div>
                  <p className="text-xs text-gray-500">Numero seriale</p>
                  <p className="text-sm font-mono">{device.serial_number}</p>
                </div>
              )}
              {device.primary_ip && (
                <div>
                  <p className="text-xs text-gray-500">IP gestione</p>
                  <p className="text-sm font-mono">{device.management_ip ?? device.primary_ip}</p>
                </div>
              )}
              {device.notes && (
                <div className="col-span-2 md:col-span-4">
                  <p className="text-xs text-gray-500">Note</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{device.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 bg-white rounded-t-xl">
        <div className="flex gap-0 px-4">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-primary-600 text-primary-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className="ml-2 text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">{tab.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-b-xl border border-gray-200 border-t-0 p-5">
        {activeTab === 'interfacce' && (
          <Table
            columns={interfaceColumns}
            data={interfaces ?? []}
            keyExtractor={(i) => i.id}
            isLoading={!interfaces}
            emptyTitle="Nessuna interfaccia"
            emptyDescription="Non sono state trovate interfacce per questo dispositivo."
          />
        )}
        {activeTab === 'ip' && (
          <Table
            columns={ipColumns}
            data={ipAddresses ?? []}
            keyExtractor={(ip) => ip.id}
            isLoading={!ipAddresses}
            emptyTitle="Nessun indirizzo IP"
          />
        )}
        {activeTab === 'mac' && (
          <Table
            columns={macColumns}
            data={macData?.items ?? []}
            keyExtractor={(m) => m.id}
            isLoading={!macData}
            emptyTitle="Nessun MAC"
            emptyDescription="Non sono state trovate voci MAC per questo dispositivo."
          />
        )}
        {activeTab === 'scansioni' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <ScanLauncher
                preselectedDeviceId={deviceId}
                onScanStarted={() => setActiveTab('scansioni')}
              />
            </div>
            <div>
              <ScanJobList
                filters={{ device_id: deviceId }}
                onSelectJob={setSelectedJob}
                selectedJobId={selectedJob?.id}
              />
            </div>
            {selectedJob && (
              <div className="lg:col-span-2">
                <ScanResultPanel job={selectedJob} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit modal */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Modifica dispositivo"
        size="lg"
        footer={
          <>
            <button onClick={() => setIsEditOpen(false)} className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Annulla</button>
            <button onClick={handleEditSubmit} disabled={updateDevice.isPending} className="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
              {updateDevice.isPending ? 'Salvataggio...' : 'Salva'}
            </button>
          </>
        }
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          {editError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{editError}</p>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
              <input type="text" value={editForm.name as string ?? ''} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
              <select value={editForm.device_type as string ?? ''} onChange={e => setEditForm(p => ({ ...p, device_type: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                {DEVICE_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stato</label>
              <select value={editForm.status as string ?? ''} onChange={e => setEditForm(p => ({ ...p, status: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                {DEVICE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">IP primario</label>
              <input type="text" value={editForm.primary_ip as string ?? ''} onChange={e => setEditForm(p => ({ ...p, primary_ip: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Armadio</label>
              <select value={editForm.cabinet_id as string ?? ''} onChange={e => setEditForm(p => ({ ...p, cabinet_id: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                <option value="">— Nessun armadio —</option>
                {cabinetsData?.items.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
              <select value={editForm.vendor_id as string ?? ''} onChange={e => setEditForm(p => ({ ...p, vendor_id: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                <option value="">— Nessun vendor —</option>
                {vendorsData?.items.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Modello</label>
              <input type="text" value={editForm.model as string ?? ''} onChange={e => setEditForm(p => ({ ...p, model: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">IP gestione</label>
              <input type="text" value={editForm.management_ip as string ?? ''} onChange={e => setEditForm(p => ({ ...p, management_ip: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
            <textarea value={editForm.notes as string ?? ''} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
          </div>
        </form>
      </Modal>
    </div>
  )
}

export default DeviceDetailPage
