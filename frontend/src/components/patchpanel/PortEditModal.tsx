import React, { useState, useEffect } from 'react'
import Modal from '../common/Modal'
import { patchPanelsApi } from '../../api/patchPanels'
import { devicesApi } from '../../api/devices'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PortOptionGroups } from '../../utils/portOptions'
import type { PatchPortDetail, DevicePortDetail, Device } from '../../types'

interface PortEditModalProps {
  isOpen: boolean
  onClose: () => void
  port: PatchPortDetail | null
  deviceId: number
  cabinetId: number | null
  onSaved: () => void
}

type ConnectionTarget = 'none' | 'switch' | 'patch_panel' | 'device'

/** Estrae il numero porta dal nome (es. "port-5" → 5) */
function extractPortNumber(name: string): string {
  const m = name.match(/(\d+)$/)
  return m ? m[1] : name
}

// Device types that are not switch/PP (shown in the "Dispositivo" tab)
const DEVICE_TYPE_OPTIONS = [
  { value: '', label: 'Tutti i tipi' },
  { value: 'server', label: 'Server' },
  { value: 'workstation', label: 'Workstation' },
  { value: 'router', label: 'Router' },
  { value: 'firewall', label: 'Firewall' },
  { value: 'access_point', label: 'Access Point' },
  { value: 'pdu', label: 'PDU' },
  { value: 'ups', label: 'UPS' },
  { value: 'unmanaged_switch', label: 'Switch non gestito' },
  { value: 'printer', label: 'Stampante' },
  { value: 'phone', label: 'Telefono' },
  { value: 'camera', label: 'Telecamera' },
  { value: 'other', label: 'Altro' },
]

const PortEditModal: React.FC<PortEditModalProps> = ({
  isOpen, onClose, port, deviceId, cabinetId, onSaved,
}) => {
  const qc = useQueryClient()
  const [label, setLabel] = useState('')
  const [roomDestination, setRoomDestination] = useState('')
  const [notes, setNotes] = useState('')

  // Connessione switch
  const [selectedSwitchId, setSelectedSwitchId] = useState<number | ''>('')
  const [switchPorts, setSwitchPorts] = useState<DevicePortDetail[]>([])
  const [selectedSwitchPortId, setSelectedSwitchPortId] = useState<number | ''>('')

  // Connessione patch panel
  const [selectedPpId, setSelectedPpId] = useState<number | ''>('')
  const [ppPorts, setPpPorts] = useState<PatchPortDetail[]>([])
  const [selectedPpPortId, setSelectedPpPortId] = useState<number | ''>('')

  // Connessione dispositivo
  const [deviceSearch, setDeviceSearch] = useState('')
  const [deviceTypeFilter, setDeviceTypeFilter] = useState('')
  const [onlyAvailable, setOnlyAvailable] = useState(false)
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | ''>('')
  const [devicePorts, setDevicePorts] = useState<DevicePortDetail[]>([])
  const [selectedDeviceIfaceId, setSelectedDeviceIfaceId] = useState<number | ''>('')

  const [connTarget, setConnTarget] = useState<ConnectionTarget>('none')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Switch: solo quelli nello stesso armadio o senza armadio
  const { data: allSwitches } = useQuery({
    queryKey: ['devices', 'switch-for-pp'],
    queryFn: () => devicesApi.list({ device_type: 'switch', size: 200 }),
    staleTime: 60_000,
    enabled: isOpen,
  })
  const switches = (allSwitches?.items ?? []).filter((sw: Device) =>
    sw.cabinet_id === null || sw.cabinet_id === undefined || sw.cabinet_id === cabinetId
  )

  // Tutti i patch panel (per connessione cross-armadio)
  const { data: allPPs } = useQuery({
    queryKey: ['devices', 'pp-for-pp'],
    queryFn: () => devicesApi.list({ device_type: 'patch_panel', size: 200 }),
    staleTime: 60_000,
    enabled: isOpen,
  })
  const otherPPs = (allPPs?.items ?? []).filter((pp: Device) => pp.id !== deviceId)

  // Dispositivi (esclusi switch e patch panel)
  const { data: devicesData } = useQuery({
    queryKey: ['devices', 'for-pp-link', deviceTypeFilter, onlyAvailable],
    queryFn: () => devicesApi.list({
      size: 500,
      ...(deviceTypeFilter ? { device_type: deviceTypeFilter as any } : {}),
      ...(onlyAvailable ? { not_connected_to_pp: true } : {}),
    }),
    staleTime: 30_000,
    enabled: isOpen && connTarget === 'device',
  })

  // Client-side filter: exclude switches and patch panels, apply text search
  const filteredDevices = (devicesData?.items ?? []).filter(d => {
    if (d.device_type === 'switch' || d.device_type === 'patch_panel') return false
    if (!deviceSearch) return true
    const q = deviceSearch.toLowerCase()
    return (
      d.name.toLowerCase().includes(q) ||
      (d.primary_ip ?? '').includes(q) ||
      (d.model ?? '').toLowerCase().includes(q)
    )
  })

  useEffect(() => {
    if (port) {
      setLabel(port.interface.label ?? '')
      setRoomDestination(port.interface.room_destination ?? '')
      setNotes(port.interface.notes ?? '')
      setSelectedSwitchId('')
      setSelectedSwitchPortId('')
      setSelectedPpId('')
      setSelectedPpPortId('')
      setSelectedDeviceId('')
      setSelectedDeviceIfaceId('')
      setDeviceSearch('')
      setDeviceTypeFilter('')
      setOnlyAvailable(false)
      setSwitchPorts([])
      setPpPorts([])
      setDevicePorts([])
      setConnTarget('none')
      setError(null)
    }
  }, [port])

  // Carica porte switch quando viene selezionato uno switch
  useEffect(() => {
    if (selectedSwitchId) {
      devicesApi.getPorts(selectedSwitchId as number)
        .then(setSwitchPorts)
        .catch(() => setSwitchPorts([]))
      setSelectedSwitchPortId('')
    } else {
      setSwitchPorts([])
      setSelectedSwitchPortId('')
    }
  }, [selectedSwitchId])

  // Carica porte patch panel quando viene selezionato un PP
  useEffect(() => {
    if (selectedPpId) {
      patchPanelsApi.getPorts(selectedPpId as number)
        .then(setPpPorts)
        .catch(() => setPpPorts([]))
      setSelectedPpPortId('')
    } else {
      setPpPorts([])
      setSelectedPpPortId('')
    }
  }, [selectedPpId])

  // Carica porte dispositivo quando selezionato
  useEffect(() => {
    if (selectedDeviceId) {
      devicesApi.getPorts(selectedDeviceId as number)
        .then(ports => {
          setDevicePorts(ports)
          const freePorts = ports.filter(p => !p.linked_interface || p.interface.id === port?.linked_interface?.id)
          if (freePorts.length === 1) setSelectedDeviceIfaceId(freePorts[0].interface.id)
          else setSelectedDeviceIfaceId('')
        })
        .catch(() => setDevicePorts([]))
    } else {
      setDevicePorts([])
      setSelectedDeviceIfaceId('')
    }
  }, [selectedDeviceId])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!port) return
    setIsLoading(true)
    setError(null)
    try {
      const portId = port.interface.id

      // 1. Salva metadati
      await patchPanelsApi.updatePort(deviceId, portId, {
        label: label || null,
        room_destination: roomDestination || null,
        notes: notes || null,
      })

      // 2. Determina nuovo target interfaccia
      let newLinkInterfaceId: number | null = null
      if (connTarget === 'switch' && selectedSwitchPortId) {
        newLinkInterfaceId = Number(selectedSwitchPortId)
      } else if (connTarget === 'patch_panel' && selectedPpPortId) {
        newLinkInterfaceId = Number(selectedPpPortId)
      } else if (connTarget === 'device' && selectedDeviceIfaceId) {
        newLinkInterfaceId = Number(selectedDeviceIfaceId)
      }

      const oldLinkId = port.linked_interface?.id ?? null

      if (newLinkInterfaceId !== null && newLinkInterfaceId !== oldLinkId) {
        if (oldLinkId && port.cable_id) {
          await patchPanelsApi.unlinkPort(deviceId, portId)
        }
        await patchPanelsApi.linkPort(deviceId, portId, newLinkInterfaceId)
      }

      qc.invalidateQueries({ queryKey: ['patch-panel-ports'] })
      qc.invalidateQueries({ queryKey: ['switch-ports'] })
      qc.invalidateQueries({ queryKey: ['connections'] })
      qc.invalidateQueries({ queryKey: ['devices'] })
      onSaved()
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Errore durante il salvataggio'
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }

  const handleUnlink = async () => {
    if (!port || !port.cable_id) return
    setIsLoading(true)
    setError(null)
    try {
      await patchPanelsApi.unlinkPort(deviceId, port.interface.id)
      qc.invalidateQueries({ queryKey: ['patch-panel-ports'] })
      qc.invalidateQueries({ queryKey: ['switch-ports'] })
      qc.invalidateQueries({ queryKey: ['connections'] })
      qc.invalidateQueries({ queryKey: ['devices'] })
      onSaved()
      onClose()
    } catch {
      setError('Errore durante la rimozione del collegamento')
    } finally {
      setIsLoading(false)
    }
  }

  const portNum = port ? extractPortNumber(port.interface.name) : '—'
  const currentLinkLabel = port?.linked_interface
    ? `${port.linked_interface.device_name ?? '?'} → ${port.linked_interface.name}`
    : null

  const CONN_TARGETS: { value: ConnectionTarget; label: string }[] = [
    { value: 'none', label: 'Nessuno' },
    { value: 'switch', label: 'Switch' },
    { value: 'patch_panel', label: 'Patch Panel' },
    { value: 'device', label: 'Dispositivo' },
  ]

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Modifica porta ${portNum}`}
      size="lg"
      closeOnBackdrop={false}
      footer={
        <>
          {port?.linked_interface && (
            <button
              type="button"
              onClick={handleUnlink}
              disabled={isLoading}
              className="mr-auto px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-300 rounded-lg hover:bg-red-50 disabled:opacity-50"
            >
              Rimuovi collegamento
            </button>
          )}
          <button type="button" onClick={onClose} disabled={isLoading}
            className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
            Annulla
          </button>
          <button type="submit" form="port-edit-form" disabled={isLoading}
            className="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
            {isLoading ? 'Salvataggio...' : 'Salva'}
          </button>
        </>
      }
    >
      <form id="port-edit-form" onSubmit={handleSave} className="space-y-4">
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Etichetta porta</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="es. Scrivania 101"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Destinazione fisica</label>
          <input
            type="text"
            value={roomDestination}
            onChange={(e) => setRoomDestination(e.target.value)}
            placeholder="es. Ufficio A, Stanza 101, Piano 2"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <p className="text-xs text-gray-400 mt-1">Dove esce fisicamente questo cavo</p>
        </div>

        {/* Collegamento attuale */}
        {currentLinkLabel && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            <p className="text-xs text-gray-500 mb-0.5">Collegata a</p>
            <p className="text-sm font-medium text-green-800 font-mono">{currentLinkLabel}</p>
          </div>
        )}

        {/* Tipo connessione */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {currentLinkLabel ? 'Cambia collegamento' : 'Collega a'}
          </label>
          <div className="flex gap-2 flex-wrap">
            {CONN_TARGETS.map(t => (
              <button
                key={t.value}
                type="button"
                onClick={() => setConnTarget(t.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  connTarget === t.value
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Switch selector */}
        {connTarget === 'switch' && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Switch</label>
              <select
                value={selectedSwitchId}
                onChange={(e) => setSelectedSwitchId(e.target.value ? Number(e.target.value) : '')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">-- Seleziona switch --</option>
                {switches.map((sw) => (
                  <option key={sw.id} value={sw.id}>
                    {sw.name}{sw.cabinet_name ? ` (${sw.cabinet_name})` : ''}
                  </option>
                ))}
              </select>
              {cabinetId && (
                <p className="text-xs text-gray-400 mt-1">
                  Solo switch nello stesso armadio o non ancora assegnati
                </p>
              )}
            </div>
            {switchPorts.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Porta dello switch</label>
                <select
                  value={selectedSwitchPortId}
                  onChange={(e) => setSelectedSwitchPortId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">-- Seleziona porta --</option>
                  <PortOptionGroups
                    ports={switchPorts}
                    currentPortId={port?.linked_interface?.id}
                  />
                </select>
              </div>
            )}
          </>
        )}

        {/* Patch Panel selector */}
        {connTarget === 'patch_panel' && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Patch Panel</label>
              <select
                value={selectedPpId}
                onChange={(e) => setSelectedPpId(e.target.value ? Number(e.target.value) : '')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">-- Seleziona patch panel --</option>
                {otherPPs.map((pp) => (
                  <option key={pp.id} value={pp.id}>
                    {pp.name}{pp.cabinet_name ? ` (${pp.cabinet_name})` : ''}
                  </option>
                ))}
              </select>
            </div>
            {ppPorts.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Porta del patch panel</label>
                <select
                  value={selectedPpPortId}
                  onChange={(e) => setSelectedPpPortId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">-- Seleziona porta --</option>
                  <PortOptionGroups
                    ports={ppPorts}
                    currentPortId={port?.linked_interface?.id}
                    labelFn={p => {
                      const num = extractPortNumber(p.interface.name)
                      const lbl = (p.interface as any).label ? ` — ${(p.interface as any).label}` : ''
                      const dest = (p.interface as any).room_destination ? ` → ${(p.interface as any).room_destination}` : ''
                      return `Porta ${num}${lbl}${dest}`
                    }}
                  />
                </select>
              </div>
            )}
          </>
        )}

        {/* Dispositivo selector */}
        {connTarget === 'device' && (
          <div className="space-y-3">
            {/* Filters row */}
            <div className="flex gap-2">
              <input
                type="text"
                value={deviceSearch}
                onChange={e => setDeviceSearch(e.target.value)}
                placeholder="Cerca nome, IP…"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <select
                value={deviceTypeFilter}
                onChange={e => { setDeviceTypeFilter(e.target.value); setSelectedDeviceId('') }}
                className="border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {DEVICE_TYPE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Disponibile toggle */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyAvailable}
                onChange={e => { setOnlyAvailable(e.target.checked); setSelectedDeviceId('') }}
                className="w-4 h-4 rounded text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700">
                Solo disponibili
                <span className="ml-1 text-xs text-gray-400">(non già connessi a un patch panel)</span>
              </span>
            </label>

            {/* Device list */}
            {filteredDevices.length === 0 ? (
              <p className="text-xs text-gray-400 py-2 text-center">Nessun dispositivo trovato</p>
            ) : (
              <div className="border border-gray-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                {filteredDevices.map(d => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setSelectedDeviceId(d.id === selectedDeviceId ? '' : d.id)}
                    className={`w-full text-left px-3 py-2 text-sm border-b border-gray-100 last:border-b-0 transition-colors ${
                      selectedDeviceId === d.id
                        ? 'bg-primary-50 text-primary-700 font-medium'
                        : 'hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <span className="font-medium">{d.name}</span>
                    {d.primary_ip && <span className="ml-2 text-xs text-gray-400 font-mono">{d.primary_ip}</span>}
                    {d.device_type && (
                      <span className="ml-2 text-xs text-gray-400 capitalize">{d.device_type}</span>
                    )}
                    {d.cabinet_name && (
                      <span className="ml-2 text-xs text-gray-400">· {d.cabinet_name}</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Interface picker (shown after device selection) */}
            {selectedDeviceId !== '' && devicePorts.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Interfaccia</label>
                <select
                  value={selectedDeviceIfaceId}
                  onChange={e => setSelectedDeviceIfaceId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">-- Seleziona interfaccia --</option>
                  <PortOptionGroups
                    ports={devicePorts}
                    currentPortId={port?.linked_interface?.id}
                  />
                </select>
              </div>
            )}
            {selectedDeviceId !== '' && devicePorts.length === 0 && (
              <p className="text-xs text-orange-500">
                Questo dispositivo non ha interfacce configurate.
              </p>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
          />
        </div>
      </form>
    </Modal>
  )
}

export default PortEditModal
