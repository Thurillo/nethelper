import React, { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Edit2, ChevronDown, ChevronRight, Eye, EyeOff, Link2, Link2Off } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useDevice, useDeviceInterfaces, useDeviceIpAddresses, useDeviceMacEntries, useUpdateDevice } from '../hooks/useDevices'
import { cabinetsApi } from '../api/cabinets'
import { vendorsApi } from '../api/vendors'
import { checkmkApi } from '../api/checkmk'
import { DeviceTypeBadge, DeviceStatusBadge } from '../components/common/Badge'
import CheckMKBadge from '../components/common/CheckMKBadge'
import LoadingSpinner from '../components/common/LoadingSpinner'
import Modal from '../components/common/Modal'
import ScanLauncher from '../components/scan/ScanLauncher'
import ScanJobList from '../components/scan/ScanJobList'
import ScanResultPanel from '../components/scan/ScanResultPanel'
import Table, { Column } from '../components/common/Table'
import { useAuthStore } from '../store/authStore'
import type { NetworkInterface, IpAddress, MacEntry, ScanJob, DeviceStatus, DeviceType } from '../types'

type TabKey = 'interfacce' | 'ip' | 'mac' | 'scansioni'

const DEVICE_TYPES: DeviceType[] = ['switch', 'router', 'access_point', 'server', 'patch_panel', 'pdu', 'firewall', 'ups', 'unmanaged_switch', 'workstation', 'printer', 'camera', 'phone', 'other']
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
  const [showCredsSection, setShowCredsSection] = useState(false)
  const [showSnmpV3, setShowSnmpV3] = useState(false)
  const [showSshPass, setShowSshPass] = useState(false)
  const [selectedCheckMKHost, setSelectedCheckMKHost] = useState('')
  const qc = useQueryClient()

  const { data: device, isLoading } = useDevice(deviceId)
  const { data: interfaces } = useDeviceInterfaces(deviceId, activeTab === 'interfacce')
  const { data: ipAddresses } = useDeviceIpAddresses(deviceId, activeTab === 'ip')
  const { data: macData } = useDeviceMacEntries(deviceId, activeTab === 'mac', undefined)
  const { data: cabinetsData } = useQuery({ queryKey: ['cabinets', 'all'], queryFn: () => cabinetsApi.list({ size: 100 }), staleTime: 60_000 })
  const { data: vendorsData } = useQuery({ queryKey: ['vendors', 'all'], queryFn: () => vendorsApi.list({ size: 100 }), staleTime: 60_000 })
  const updateDevice = useUpdateDevice()

  // CheckMK
  const { data: checkmkStatus } = useQuery({
    queryKey: ['checkmk', 'status'],
    queryFn: checkmkApi.getStatus,
    staleTime: 60_000,
    retry: false,
  })
  const { data: checkmkHosts } = useQuery({
    queryKey: ['checkmk', 'hosts'],
    queryFn: checkmkApi.getHosts,
    staleTime: 120_000,
    retry: false,
  })
  const linkMutation = useMutation({
    mutationFn: (hostName: string) => checkmkApi.linkDevice(deviceId, hostName),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['devices', deviceId] })
      qc.invalidateQueries({ queryKey: ['devices'], exact: false })
      qc.invalidateQueries({ queryKey: ['checkmk', 'status'] })
    },
  })
  const unlinkMutation = useMutation({
    mutationFn: () => checkmkApi.unlinkDevice(deviceId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['devices', deviceId] })
      qc.invalidateQueries({ queryKey: ['devices'], exact: false })
      qc.invalidateQueries({ queryKey: ['checkmk', 'status'] })
    },
  })

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
      snmp_community: device.snmp_community ?? '',
      snmp_version: device.snmp_version ?? 2,
      snmp_v3_username: device.snmp_v3_username ?? '',
      snmp_v3_auth_protocol: device.snmp_v3_auth_protocol ?? '',
      snmp_v3_priv_protocol: device.snmp_v3_priv_protocol ?? '',
      ssh_username: device.ssh_username ?? '',
      ssh_password: '',
      ssh_port: device.ssh_port ?? 22,
      ssh_key_path: device.ssh_key_path ?? '',
    })
    setEditError(null)
    setShowCredsSection(false)
    setShowSnmpV3(false)
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
        cabinet_id: editForm.cabinet_id ? Number(editForm.cabinet_id) : null,
        vendor_id: editForm.vendor_id ? Number(editForm.vendor_id) : null,
        model: (editForm.model as string) || null,
        notes: (editForm.notes as string) || null,
        snmp_community: (editForm.snmp_community as string) || null,
        snmp_version: editForm.snmp_version ? Number(editForm.snmp_version) : 2,
        snmp_v3_username: (editForm.snmp_v3_username as string) || null,
        snmp_v3_auth_protocol: (editForm.snmp_v3_auth_protocol as string) || null,
        snmp_v3_priv_protocol: (editForm.snmp_v3_priv_protocol as string) || null,
        ssh_username: (editForm.ssh_username as string) || null,
        ssh_password: (editForm.ssh_password as string) || null,
        ssh_port: editForm.ssh_port ? Number(editForm.ssh_port) : undefined,
        ssh_key_path: (editForm.ssh_key_path as string) || null,
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

      {/* CheckMK Monitoring */}
      {(checkmkStatus !== undefined || device.checkmk_host_name || isAdmin()) && checkmkHosts !== undefined && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200 bg-gray-50">
            <Link2 size={16} className="text-blue-500" />
            <span className="text-sm font-semibold text-gray-700">Monitoraggio CheckMK</span>
            {device.checkmk_host_name && checkmkStatus && (() => {
              const s = checkmkStatus[device.id]
              return s ? <CheckMKBadge status={s.state_label as any} /> : null
            })()}
          </div>
          <div className="p-4">
            {device.checkmk_host_name ? (
              <div className="flex items-center gap-4 flex-wrap">
                <div>
                  <p className="text-xs text-gray-500">Host collegato</p>
                  <p className="text-sm font-mono font-medium text-gray-800">{device.checkmk_host_name}</p>
                  {checkmkStatus?.[device.id]?.address && (
                    <p className="text-xs text-gray-400 font-mono">{checkmkStatus[device.id].address}</p>
                  )}
                </div>
                {isAdmin() && (
                  <button
                    onClick={() => unlinkMutation.mutate()}
                    disabled={unlinkMutation.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 ml-auto"
                  >
                    <Link2Off size={13} />
                    Scollega
                  </button>
                )}
              </div>
            ) : isAdmin() ? (
              <div className="flex items-center gap-3 flex-wrap">
                <select
                  value={selectedCheckMKHost}
                  onChange={(e) => setSelectedCheckMKHost(e.target.value)}
                  className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">— Seleziona host CheckMK —</option>
                  {checkmkHosts?.map((h) => (
                    <option key={h.name} value={h.name}>
                      {h.name}{h.address ? ` (${h.address})` : ''}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => { if (selectedCheckMKHost) linkMutation.mutate(selectedCheckMKHost) }}
                  disabled={!selectedCheckMKHost || linkMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  <Link2 size={14} />
                  Collega
                </button>
              </div>
            ) : (
              <p className="text-sm text-gray-400">Nessun host CheckMK collegato.</p>
            )}
          </div>
        </div>
      )}

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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

          {/* Credenziali collapsible */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setShowCredsSection(v => !v)}
              className="w-full flex items-center gap-2 px-4 py-2.5 bg-gray-50 text-sm font-medium text-gray-700 hover:bg-gray-100 text-left"
            >
              {showCredsSection ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              Credenziali SNMP / SSH
              <span className="ml-auto text-xs text-gray-400 font-normal">usate per gli scan su questo dispositivo</span>
            </button>
            {showCredsSection && (
              <div className="p-4 space-y-4 border-t border-gray-200">
                {/* SNMP */}
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">SNMP</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Versione</label>
                    <select value={editForm.snmp_version as number ?? 2} onChange={e => { setEditForm(p => ({ ...p, snmp_version: Number(e.target.value) })); setShowSnmpV3(Number(e.target.value) === 3) }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                      <option value={1}>v1</option>
                      <option value={2}>v2c</option>
                      <option value={3}>v3</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Community string</label>
                    <input type="text" value={editForm.snmp_community as string ?? ''} onChange={e => setEditForm(p => ({ ...p, snmp_community: e.target.value }))} placeholder="es. public" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                </div>
                {(showSnmpV3 || (editForm.snmp_version as number) === 3) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Username SNMPv3</label>
                      <input type="text" value={editForm.snmp_v3_username as string ?? ''} onChange={e => setEditForm(p => ({ ...p, snmp_v3_username: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Auth protocol</label>
                      <select value={editForm.snmp_v3_auth_protocol as string ?? ''} onChange={e => setEditForm(p => ({ ...p, snmp_v3_auth_protocol: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                        <option value="">— Nessuno —</option>
                        <option value="MD5">MD5</option>
                        <option value="SHA">SHA</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Priv protocol</label>
                      <select value={editForm.snmp_v3_priv_protocol as string ?? ''} onChange={e => setEditForm(p => ({ ...p, snmp_v3_priv_protocol: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                        <option value="">— Nessuno —</option>
                        <option value="DES">DES</option>
                        <option value="AES">AES</option>
                      </select>
                    </div>
                  </div>
                )}
                {/* SSH */}
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-2">SSH</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                    <input type="text" value={editForm.ssh_username as string ?? ''} onChange={e => setEditForm(p => ({ ...p, ssh_username: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                    <div className="relative">
                      <input type={showSshPass ? 'text' : 'password'} value={editForm.ssh_password as string ?? ''} onChange={e => setEditForm(p => ({ ...p, ssh_password: e.target.value }))} autoComplete="new-password" placeholder="lascia vuoto per non modificare" className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                      <button type="button" onClick={() => setShowSshPass(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">{showSshPass ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Porta</label>
                    <input type="number" min={1} max={65535} value={editForm.ssh_port as number ?? 22} onChange={e => setEditForm(p => ({ ...p, ssh_port: Number(e.target.value) }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Key path (opzionale)</label>
                    <input type="text" value={editForm.ssh_key_path as string ?? ''} onChange={e => setEditForm(p => ({ ...p, ssh_key_path: e.target.value }))} placeholder="/home/user/.ssh/id_rsa" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </form>
      </Modal>
    </div>
  )
}

export default DeviceDetailPage
