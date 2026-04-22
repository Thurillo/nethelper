import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Monitor, Wifi, AlertTriangle, Link2, Plus, Circle } from 'lucide-react'
import { devicesApi } from '../../api/devices'
import { conflictsApi } from '../../api/conflicts'
import type { PortMapEntry, PortClassification } from '../../types'
import Modal from '../common/Modal'
import LoadingSpinner from '../common/LoadingSpinner'

const DEVICE_TYPES = [
  { value: 'workstation', label: 'Workstation / PC' },
  { value: 'printer', label: 'Stampante' },
  { value: 'phone', label: 'Telefono IP' },
  { value: 'camera', label: 'Telecamera' },
  { value: 'access_point', label: 'Access Point' },
  { value: 'server', label: 'Server' },
  { value: 'other', label: 'Altro' },
]

function classificationColor(c: PortClassification): string {
  switch (c) {
    case 'direct': return 'border-yellow-300 bg-yellow-50'
    case 'lldp_cdp': return 'border-blue-300 bg-blue-50'
    case 'unmanaged': return 'border-red-300 bg-red-50'
    case 'empty': return 'border-gray-200 bg-gray-50'
  }
}

function classificationBadge(c: PortClassification, linkedName: string | null, macCount: number) {
  switch (c) {
    case 'lldp_cdp':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
          <Link2 size={10} /> {linkedName ?? 'Switch/Router'}
        </span>
      )
    case 'direct':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded-full">
          <Monitor size={10} /> Dispositivo diretto
        </span>
      )
    case 'unmanaged':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
          <AlertTriangle size={10} /> Switch non gestito ({macCount} MAC)
        </span>
      )
    case 'empty':
      return (
        <span className="text-xs text-gray-400">Libera</span>
      )
  }
}

interface AddDeviceModalProps {
  port: PortMapEntry
  onClose: () => void
  onSaved: () => void
}

const AddDeviceModal: React.FC<AddDeviceModalProps> = ({ port, onClose, onSaved }) => {
  const mac = port.mac_entries[0]
  const defaultName = mac?.vendor_name
    ? `${mac.vendor_name.split(' ')[0]}-${(mac.mac_address ?? '').slice(-8).replace(/:/g, '')}`
    : `Device-${(mac?.mac_address ?? '').slice(-8).replace(/:/g, '')}`

  const [deviceName, setDeviceName] = useState(defaultName)
  const [deviceType, setDeviceType] = useState('other')
  const [error, setError] = useState<string | null>(null)

  // Find the pending new_device_discovered conflict for this interface
  const { data: conflictsData } = useQuery({
    queryKey: ['conflicts', 'new_device_discovered', 'pending', port.interface_id],
    queryFn: () => conflictsApi.list({ conflict_type: 'new_device_discovered', status_filter: 'pending', size: 100 }),
  })
  const conflict = conflictsData?.items.find(
    c => (c.discovered_value as Record<string, unknown>)?.interface_id === port.interface_id &&
         (c.discovered_value as Record<string, unknown>)?.mac_address === mac?.mac_address
  )

  const qc = useQueryClient()
  const acceptMutation = useMutation({
    mutationFn: () => {
      if (!conflict) throw new Error('Conflict not found')
      return conflictsApi.acceptNewDevice(conflict.id, { device_name: deviceName, device_type: deviceType })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conflicts'] })
      qc.invalidateQueries({ queryKey: ['devices'] })
      onSaved()
      onClose()
    },
    onError: (e: Error) => setError(e.message),
  })

  return (
    <Modal isOpen onClose={onClose} title={`Aggiungi dispositivo — ${port.interface_name}`}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
            Annulla
          </button>
          <button
            onClick={() => acceptMutation.mutate()}
            disabled={!deviceName.trim() || acceptMutation.isPending || !conflict}
            className="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {acceptMutation.isPending ? 'Salvataggio...' : 'Registra dispositivo'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {mac && (
          <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
            <div><span className="text-gray-500">MAC:</span> <span className="font-mono">{mac.mac_address}</span></div>
            {mac.vendor_name && <div><span className="text-gray-500">Vendor:</span> {mac.vendor_name}</div>}
            {mac.ip_address && <div><span className="text-gray-500">IP:</span> {mac.ip_address}</div>}
            {mac.vlan_id && <div><span className="text-gray-500">VLAN:</span> {mac.vlan_id}</div>}
          </div>
        )}
        {!conflict && (
          <p className="text-sm text-amber-600 bg-amber-50 rounded-lg p-3">
            Nessun conflitto pendente trovato per questo MAC. Esegui prima una scansione SSH.
          </p>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome dispositivo</label>
          <input
            type="text"
            value={deviceName}
            onChange={e => setDeviceName(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tipo dispositivo</label>
          <select
            value={deviceType}
            onChange={e => setDeviceType(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {DEVICE_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  )
}

interface PortCardProps {
  port: PortMapEntry
  onAdd: (port: PortMapEntry) => void
}

const PortCard: React.FC<PortCardProps> = ({ port, onAdd }) => {
  const navigate = useNavigate()

  return (
    <div className={`border rounded-lg p-3 flex flex-col gap-1.5 ${classificationColor(port.classification)}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Circle
            size={8}
            className={port.oper_up ? 'fill-green-500 text-green-500' : 'fill-gray-300 text-gray-300'}
          />
          <span className="text-xs font-mono font-semibold text-gray-800 truncate">{port.interface_name}</span>
          {port.speed_mbps && (
            <span className="text-xs text-gray-400 shrink-0">{port.speed_mbps >= 1000 ? `${port.speed_mbps / 1000}G` : `${port.speed_mbps}M`}</span>
          )}
        </div>
        {port.classification === 'direct' && !port.linked_device_id && (
          <button
            onClick={() => onAdd(port)}
            title="Aggiungi a inventario"
            className="shrink-0 p-1 rounded text-yellow-700 hover:bg-yellow-200 transition-colors"
          >
            <Plus size={14} />
          </button>
        )}
      </div>

      <div>{classificationBadge(port.classification, port.linked_device_name, port.mac_count)}</div>

      {port.classification === 'lldp_cdp' && port.linked_device_id && (
        <button
          onClick={() => navigate(`/dispositivi/${port.linked_device_id}`)}
          className="text-xs text-blue-600 hover:underline text-left truncate"
        >
          {port.linked_device_name}
        </button>
      )}

      {port.classification === 'direct' && port.linked_device_id && (
        <button
          onClick={() => navigate(`/dispositivi/${port.linked_device_id}`)}
          className="text-xs text-green-700 hover:underline text-left truncate"
        >
          ✓ {port.linked_device_name}
        </button>
      )}

      {port.classification === 'direct' && port.mac_entries[0] && (
        <div className="text-xs text-gray-500 font-mono truncate">
          {port.mac_entries[0].mac_address}
          {port.mac_entries[0].vendor_name && (
            <span className="font-sans text-gray-400"> · {port.mac_entries[0].vendor_name}</span>
          )}
        </div>
      )}

      {port.description && (
        <div className="text-xs text-gray-400 truncate" title={port.description}>{port.description}</div>
      )}
    </div>
  )
}

interface PortMapTabProps {
  deviceId: number
}

const PortMapTab: React.FC<PortMapTabProps> = ({ deviceId }) => {
  const [addingPort, setAddingPort] = useState<PortMapEntry | null>(null)
  const qc = useQueryClient()

  const { data: ports, isLoading, error } = useQuery({
    queryKey: ['devices', deviceId, 'port-map'],
    queryFn: () => devicesApi.getPortMap(deviceId),
  })

  if (isLoading) return <div className="flex justify-center py-12"><LoadingSpinner /></div>
  if (error) return <p className="text-sm text-red-600 py-6">Errore nel caricamento della mappa porte.</p>
  if (!ports || ports.length === 0) return (
    <p className="text-sm text-gray-500 py-6">
      Nessuna interfaccia trovata. Esegui una scansione SSH per popolare la mappa.
    </p>
  )

  const counts = {
    direct: ports.filter(p => p.classification === 'direct').length,
    lldp_cdp: ports.filter(p => p.classification === 'lldp_cdp').length,
    unmanaged: ports.filter(p => p.classification === 'unmanaged').length,
    empty: ports.filter(p => p.classification === 'empty').length,
  }
  const unknownDirect = ports.filter(p => p.classification === 'direct' && !p.linked_device_id).length

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex flex-wrap gap-3 text-sm">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 rounded-full">
          <Link2 size={12} /> {counts.lldp_cdp} switch/router
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-700 rounded-full">
          <Monitor size={12} /> {counts.direct - unknownDirect} device registrati
        </span>
        {unknownDirect > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-yellow-50 text-yellow-700 rounded-full">
            <Plus size={12} /> {unknownDirect} device sconosciuti
          </span>
        )}
        {counts.unmanaged > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-50 text-red-700 rounded-full">
            <AlertTriangle size={12} /> {counts.unmanaged} switch non gestiti
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-50 text-gray-500 rounded-full">
          {counts.empty} porte libere
        </span>
      </div>

      {/* Port grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
        {ports.map(port => (
          <PortCard key={port.interface_id} port={port} onAdd={setAddingPort} />
        ))}
      </div>

      {/* Add device modal */}
      {addingPort && (
        <AddDeviceModal
          port={addingPort}
          onClose={() => setAddingPort(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['devices', deviceId, 'port-map'] })}
        />
      )}
    </div>
  )
}

export default PortMapTab
