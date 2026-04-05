import React, { useEffect, useRef, useState } from 'react'
import { XCircle, Wifi, WifiOff, PlusCircle, X, Plus, AlertTriangle, Download } from 'lucide-react'
import BulkImportModal from './BulkImportModal'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useScanJobPolling, useCancelScan } from '../../hooks/useScanJobs'
import { useCreateDevice, useDevices } from '../../hooks/useDevices'
import { vendorsApi } from '../../api/vendors'
import { devicesApi } from '../../api/devices'
import { interfacesApi } from '../../api/interfaces'
import { cablesApi } from '../../api/cables'
import { patchPanelsApi } from '../../api/patchPanels'
import { conflictsApi } from '../../api/conflicts'
import StatusDot from '../common/StatusDot'
import QuickAddVendorModal from '../common/QuickAddVendorModal'
import type { ScanJob, NetworkInterface, PatchPortDetail, Device, InterfaceType } from '../../types'

const DEFAULT_IF_TYPE: InterfaceType = 'ethernet'

interface FoundHost {
  ip: string
  open_ports: number[]
  hostname: string | null
  ping: boolean
  mac: string | null
  vendor: string | null
}

type ConnectionType = 'none' | 'switch' | 'patch_panel'
type MatchStatus = 'full' | 'conflict' | 'unknown'

function normMac(mac: string | null): string | null {
  if (!mac) return null
  return mac.toLowerCase().replace(/[:\-]/g, '')
}

function getMatchStatus(
  host: FoundHost,
  devices: Device[]
): { status: MatchStatus; deviceName?: string } {
  const hostMac = normMac(host.mac)
  const ipMatches = devices.filter(
    d => d.primary_ip === host.ip || d.management_ip === host.ip
  )
  const macMatches = hostMac
    ? devices.filter(d => normMac(d.mac_address) === hostMac)
    : []

  if (ipMatches.length === 0 && macMatches.length === 0) return { status: 'unknown' }

  const ipIds = new Set(ipMatches.map(d => d.id))
  for (const d of macMatches) {
    if (ipIds.has(d.id)) return { status: 'full', deviceName: d.name }
  }
  return { status: 'conflict' }
}

const MatchBadge: React.FC<{ status: MatchStatus; deviceName?: string; ping: boolean }> = ({
  status,
  deviceName,
  ping,
}) => {
  const title =
    status === 'full'
      ? `IP e MAC coincidono con "${deviceName}"`
      : status === 'conflict'
      ? 'IP o MAC trovati su dispositivi diversi — possibile conflitto'
      : 'Non ancora registrato'

  return (
    <div className="flex flex-col items-center gap-0.5" title={title}>
      {status === 'full' && (
        <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
          <span className="text-white text-[10px] font-bold">✓</span>
        </div>
      )}
      {status === 'conflict' && (
        <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
          <span className="text-white text-[10px] font-bold">✗</span>
        </div>
      )}
      {status === 'unknown' && (
        <div className="w-4 h-4 rounded-sm bg-yellow-400" />
      )}
      {ping
        ? <Wifi size={9} className="text-green-400" />
        : <WifiOff size={9} className="text-gray-600" />}
    </div>
  )
}

interface AddDeviceModalProps {
  host: FoundHost
  vendors: { id: number; name: string }[]
  allDevices: Device[]
  onClose: () => void
  onSuccess: () => void
}

const AddDeviceModal: React.FC<AddDeviceModalProps> = ({ host, vendors, allDevices, onClose, onSuccess }) => {
  const createDevice = useCreateDevice()
  const qc = useQueryClient()
  const [name, setName] = useState(host.hostname || host.ip)
  const [deviceType, setDeviceType] = useState('server')
  const [vendorId, setVendorId] = useState<number | ''>('')
  const [model, setModel] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [vendorModalOpen, setVendorModalOpen] = useState(false)

  // Duplicate detection
  const { status: dupStatus, deviceName: dupName } = getMatchStatus(host, allDevices)
  const dupDevice = dupStatus !== 'unknown'
    ? allDevices.find(d => d.primary_ip === host.ip || d.management_ip === host.ip ||
        (host.mac && normMac(d.mac_address) === normMac(host.mac)))
    : null

  // Port configuration
  const [portCount, setPortCount] = useState(1)
  const [hasPassthrough, setHasPassthrough] = useState(false)

  const handleDeviceTypeChange = (val: string) => {
    setDeviceType(val)
    setHasPassthrough(false)
    if (val === 'switch') setPortCount(24)
    else if (val === 'router') setPortCount(4)
    else setPortCount(1)
  }

  // Connection section
  const [connectionType, setConnectionType] = useState<ConnectionType>('none')
  const [selectedSwitchId, setSelectedSwitchId] = useState<number | ''>('')
  const [switchInterfaces, setSwitchInterfaces] = useState<NetworkInterface[]>([])
  const [selectedSwitchPortId, setSelectedSwitchPortId] = useState<number | ''>('')
  const [selectedPPId, setSelectedPPId] = useState<number | ''>('')
  const [ppPorts, setPPPorts] = useState<PatchPortDetail[]>([])
  const [selectedPPPortId, setSelectedPPPortId] = useState<number | ''>('')

  const { data: switchesData } = useDevices({ device_type: 'switch', size: 100 })
  const { data: ppData } = useDevices({ device_type: 'patch_panel', size: 100 })

  // Load switch interfaces when switch selected
  useEffect(() => {
    if (selectedSwitchId) {
      devicesApi.getInterfaces(selectedSwitchId as number)
        .then(setSwitchInterfaces)
        .catch(() => setSwitchInterfaces([]))
      setSelectedSwitchPortId('')
    } else {
      setSwitchInterfaces([])
    }
  }, [selectedSwitchId])

  // Load patch panel ports when PP selected
  useEffect(() => {
    if (selectedPPId) {
      patchPanelsApi.getPorts(selectedPPId as number)
        .then(setPPPorts)
        .catch(() => setPPPorts([]))
      setSelectedPPPortId('')
    } else {
      setPPPorts([])
    }
  }, [selectedPPId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSaving(true)
    try {
      // 1. Create the device
      const device = await createDevice.mutateAsync({
        name,
        device_type: deviceType as any,
        primary_ip: host.ip,
        management_ip: host.ip,
        mac_address: host.mac || null,
        vendor_id: vendorId !== '' ? Number(vendorId) : null,
        model: model || null,
        notes: notes || null,
      })

      // 2. Create port interfaces based on device type
      let firstIfaceId: number | null = null

      if (deviceType === 'switch' || deviceType === 'router') {
        // Create N ethernet ports
        for (let i = 1; i <= portCount; i++) {
          const iface = await interfacesApi.create({
            device_id: device.id,
            name: `Port ${i}`,
            if_type: DEFAULT_IF_TYPE,
            mac_address: i === 1 ? (host.mac || null) : null,
          })
          if (i === 1) firstIfaceId = iface.id
        }
      } else if (deviceType === 'phone' && hasPassthrough) {
        // Main line + pass-through ethernet
        const iface = await interfacesApi.create({
          device_id: device.id,
          name: 'eth0',
          if_type: DEFAULT_IF_TYPE,
          mac_address: host.mac || null,
        })
        firstIfaceId = iface.id
        await interfacesApi.create({
          device_id: device.id,
          name: 'eth1-passthrough',
          if_type: DEFAULT_IF_TYPE,
        })
      }

      // 3. If a connection is requested, use firstIfaceId or create eth0
      if (connectionType !== 'none' && (selectedSwitchPortId || selectedPPPortId)) {
        if (!firstIfaceId) {
          const iface = await interfacesApi.create({
            device_id: device.id,
            name: 'eth0',
            if_type: DEFAULT_IF_TYPE,
            mac_address: host.mac || null,
          })
          firstIfaceId = iface.id
        }

        if (connectionType === 'switch' && selectedSwitchPortId) {
          const a = Math.min(firstIfaceId, Number(selectedSwitchPortId))
          const b = Math.max(firstIfaceId, Number(selectedSwitchPortId))
          await cablesApi.create({ interface_a_id: a, interface_b_id: b, cable_type: 'cat6' })
        }

        if (connectionType === 'patch_panel' && selectedPPPortId && selectedPPId) {
          await patchPanelsApi.linkPort(Number(selectedPPId), Number(selectedPPPortId), firstIfaceId)
        }
      } else if (!firstIfaceId) {
        // Default: always create at least 1 ethernet interface
        await interfacesApi.create({
          device_id: device.id,
          name: 'eth0',
          if_type: DEFAULT_IF_TYPE,
          mac_address: host.mac || null,
        })
      }

      onSuccess()
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Errore durante la creazione del dispositivo'
      setError(msg)
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveAsConflict = async () => {
    setError(null)
    setIsSaving(true)
    try {
      await conflictsApi.create({
        conflict_type: 'duplicate_device',
        device_id: dupDevice?.id ?? null,
        entity_table: 'device',
        field_name: 'primary_ip',
        current_value: { name: dupDevice?.name, ip: dupDevice?.primary_ip, mac: dupDevice?.mac_address },
        discovered_value: { ip: host.ip, mac: host.mac, vendor: host.vendor, hostname: host.hostname },
        notes: `Scansione IP: dispositivo duplicato rilevato — ${host.ip} già associato a "${dupDevice?.name ?? 'sconosciuto'}"`,
      })
      qc.invalidateQueries({ queryKey: ['conflicts'] })
      onSuccess()
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Errore durante il salvataggio del conflitto'
      setError(msg)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
    <QuickAddVendorModal
      isOpen={vendorModalOpen}
      onClose={() => setVendorModalOpen(false)}
    />
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <h3 className="font-semibold text-gray-900">Aggiungi dispositivo — {host.ip}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
          <div className="p-5 space-y-4 overflow-y-auto">
            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

            {/* Duplicate warning */}
            {dupStatus === 'full' && (
              <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2.5">
                <AlertTriangle size={15} className="text-amber-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-amber-800">
                    Dispositivo già registrato: <span className="font-semibold">"{dupName}"</span>
                  </p>
                  <p className="text-xs text-amber-600 mt-0.5">
                    IP e MAC coincidono con un dispositivo esistente. Puoi salvare questa segnalazione nei conflitti invece di creare un duplicato.
                  </p>
                </div>
              </div>
            )}
            {dupStatus === 'conflict' && (
              <div className="flex items-start gap-2.5 bg-orange-50 border border-orange-300 rounded-lg px-3 py-2.5">
                <AlertTriangle size={15} className="text-orange-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-orange-800">Possibile duplicato</p>
                  <p className="text-xs text-orange-600 mt-0.5">
                    IP o MAC già associati a un altro dispositivo. Verifica prima di procedere.
                  </p>
                </div>
              </div>
            )}

            {/* Pre-filled discovery info */}
            <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1 text-gray-600 font-mono">
              <div><span className="text-gray-400">IP:</span> {host.ip}</div>
              {host.mac && <div><span className="text-gray-400">MAC:</span> {host.mac}</div>}
              {host.vendor && <div><span className="text-gray-400">Vendor MAC:</span> {host.vendor}</div>}
              {host.open_ports.length > 0 && (
                <div><span className="text-gray-400">Porte aperte:</span> {host.open_ports.join(', ')}</div>
              )}
            </div>

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
              <input
                required
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            {/* Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo *</label>
              <select
                value={deviceType}
                onChange={e => handleDeviceTypeChange(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="server">Server</option>
                <option value="switch">Switch</option>
                <option value="router">Router</option>
                <option value="firewall">Firewall</option>
                <option value="access_point">Access Point</option>
                <option value="printer">Stampante</option>
                <option value="workstation">Workstation</option>
                <option value="phone">Telefono</option>
                <option value="camera">Telecamera</option>
                <option value="other">Altro</option>
              </select>
            </div>

            {/* Port configuration — switch / router / phone */}
            {(deviceType === 'switch' || deviceType === 'router') && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-3">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Numero porte ethernet
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    max={512}
                    value={portCount}
                    onChange={e => setPortCount(Math.max(1, Math.min(512, Number(e.target.value))))}
                    className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono text-center focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <span className="text-xs text-gray-500">
                    Verranno create <strong>{portCount}</strong> interfacce
                    {' '}(Port 1 … Port {portCount})
                  </span>
                </div>
              </div>
            )}

            {deviceType === 'phone' && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-3">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={hasPassthrough}
                    onChange={e => setHasPassthrough(e.target.checked)}
                    className="w-4 h-4 rounded text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700">
                    Ha porta di rilancio ethernet
                    <span className="ml-1 text-xs text-gray-400">(pass-through desktop → PC)</span>
                  </span>
                </label>
                {hasPassthrough && (
                  <p className="mt-1.5 text-xs text-gray-500 ml-6">
                    Verranno create 2 interfacce: <code className="font-mono">eth0</code> + <code className="font-mono">eth1-passthrough</code>
                  </p>
                )}
              </div>
            )}

            {/* Vendor */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Vendor
                {host.vendor && <span className="ml-1 text-xs font-normal text-gray-400">(da MAC: {host.vendor})</span>}
              </label>
              <select
                value={vendorId}
                onChange={e => setVendorId(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">— Nessuno —</option>
                {vendors.map(v => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setVendorModalOpen(true)}
                className="mt-1.5 flex items-center gap-1 text-xs text-primary-600 hover:text-primary-800 transition-colors"
              >
                <Plus size={11} /> Aggiungi nuovo vendor
              </button>
            </div>

            {/* Model */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Modello</label>
              <input
                value={model}
                onChange={e => setModel(e.target.value)}
                placeholder="es. PowerEdge R730"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            {/* ── Connection section ── */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Connessione (opzionale)</p>
              </div>
              <div className="p-3 space-y-3">
                {/* Radio buttons */}
                <div className="flex gap-4 text-sm">
                  {(['none', 'switch', 'patch_panel'] as ConnectionType[]).map(ct => (
                    <label key={ct} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="connectionType"
                        value={ct}
                        checked={connectionType === ct}
                        onChange={() => { setConnectionType(ct); setSelectedSwitchId(''); setSelectedPPId('') }}
                        className="text-primary-600"
                      />
                      <span className="text-gray-700">
                        {ct === 'none' ? 'Nessuna' : ct === 'switch' ? 'Porta switch' : 'Porta patch panel'}
                      </span>
                    </label>
                  ))}
                </div>

                {/* Switch connection */}
                {connectionType === 'switch' && (
                  <div className="space-y-2">
                    <select
                      value={selectedSwitchId}
                      onChange={e => setSelectedSwitchId(e.target.value ? Number(e.target.value) : '')}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="">— Seleziona switch —</option>
                      {switchesData?.items.map(sw => (
                        <option key={sw.id} value={sw.id}>{sw.name}</option>
                      ))}
                    </select>
                    {switchInterfaces.length > 0 && (
                      <select
                        value={selectedSwitchPortId}
                        onChange={e => setSelectedSwitchPortId(e.target.value ? Number(e.target.value) : '')}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      >
                        <option value="">— Seleziona porta —</option>
                        {switchInterfaces.map(iface => (
                          <option key={iface.id} value={iface.id}>
                            {iface.name}{iface.label ? ` — ${iface.label}` : ''}{iface.room_destination ? ` (${iface.room_destination})` : ''}
                          </option>
                        ))}
                      </select>
                    )}
                    <p className="text-xs text-gray-400">Verrà creata un'interfaccia eth0 sul dispositivo e un cavo verso la porta selezionata.</p>
                  </div>
                )}

                {/* Patch panel connection */}
                {connectionType === 'patch_panel' && (
                  <div className="space-y-2">
                    <select
                      value={selectedPPId}
                      onChange={e => setSelectedPPId(e.target.value ? Number(e.target.value) : '')}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="">— Seleziona patch panel —</option>
                      {ppData?.items.map(pp => (
                        <option key={pp.id} value={pp.id}>{pp.name}</option>
                      ))}
                    </select>
                    {ppPorts.length > 0 && (
                      <select
                        value={selectedPPPortId}
                        onChange={e => setSelectedPPPortId(e.target.value ? Number(e.target.value) : '')}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      >
                        <option value="">— Seleziona porta —</option>
                        {ppPorts
                          .filter(p => p.linked_interface === null)
                          .map(p => {
                            const m = p.interface.name.match(/(\d+)$/)
                            const num = m ? m[1] : p.interface.name
                            const label = p.interface.label ? ` — ${p.interface.label}` : ''
                            const room = p.interface.room_destination ? ` (${p.interface.room_destination})` : ''
                            return (
                              <option key={p.interface.id} value={p.interface.id}>
                                Porta {num}{label}{room}
                              </option>
                            )
                          })}
                      </select>
                    )}
                    {ppPorts.length > 0 && ppPorts.filter(p => p.linked_interface === null).length === 0 && (
                      <p className="text-xs text-orange-500">Tutte le porte di questo patch panel sono già occupate.</p>
                    )}
                    <p className="text-xs text-gray-400">Verrà creata un'interfaccia eth0 sul dispositivo e collegata alla porta selezionata.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex gap-2 px-5 py-4 border-t border-gray-200 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Annulla
            </button>
            {dupStatus !== 'unknown' && (
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSaveAsConflict}
                className="px-4 py-2 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 font-medium"
              >
                {isSaving ? 'Salvataggio...' : 'Salva nei conflitti'}
              </button>
            )}
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 font-medium"
            >
              {isSaving ? 'Creazione...' : 'Crea dispositivo'}
            </button>
          </div>
        </form>
      </div>
    </div>
    </>
  )
}

interface ScanResultPanelProps {
  job: ScanJob
}

const ScanResultPanel: React.FC<ScanResultPanelProps> = ({ job: initialJob }) => {
  const isRunning = initialJob.status === 'running' || initialJob.status === 'pending'
  const { data: liveJob } = useScanJobPolling(initialJob.id, isRunning)
  const job = liveJob ?? initialJob
  const cancelScan = useCancelScan()
  const logRef = useRef<HTMLPreElement>(null)
  const isIpRange = job.scan_type === 'ip_range'
  const [addHost, setAddHost] = useState<FoundHost | null>(null)
  const [addedIps, setAddedIps] = useState<Set<string>>(new Set())
  const [selectedIps, setSelectedIps] = useState<Set<string>>(new Set())
  const [showBulkModal, setShowBulkModal] = useState(false)

  const { data: vendorsData } = useQuery({
    queryKey: ['vendors', 'all'],
    queryFn: () => vendorsApi.list({ size: 200 }),
    staleTime: 60_000,
  })
  const vendors = vendorsData?.items ?? []

  const { data: allDevicesData } = useQuery({
    queryKey: ['devices', 'all-for-scan'],
    queryFn: () => devicesApi.list({ size: 500 }),
    staleTime: 60_000,
    enabled: isIpRange,
  })
  const allDevices: Device[] = allDevicesData?.items ?? []

  const summary = job.result_summary as Record<string, unknown> | null
  const foundHosts: FoundHost[] = (summary?.found_hosts as FoundHost[]) ?? []
  const aliveHosts = summary?.alive_hosts as number | undefined
  const totalIps = summary?.total_ips as number | undefined

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [job.log_output])

  return (
    <>
      <div className="bg-gray-900 rounded-xl overflow-hidden border border-gray-700">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-gray-800 border-b border-gray-700">
          <StatusDot status={job.status} showLabel />
          <span className="text-sm text-gray-300 font-mono">
            Job #{job.id}
            {job.device && ` — ${job.device.name}`}
            {job.range_start_ip && ` — ${job.range_start_ip} → ${job.range_end_ip}`}
          </span>
          {isRunning && (
            <button
              onClick={() => cancelScan.mutate(job.id)}
              disabled={cancelScan.isPending}
              className="ml-auto flex items-center gap-1.5 px-3 py-1 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              <XCircle size={12} />
              Annulla
            </button>
          )}
        </div>

        {/* Log output */}
        <pre
          ref={logRef}
          className="text-xs text-green-400 font-mono p-4 overflow-y-auto bg-gray-900"
          style={{ maxHeight: '180px', minHeight: '60px' }}
        >
          {job.log_output || (isRunning ? 'Avvio scansione...' : 'Nessun output disponibile')}
          {isRunning && <span className="animate-pulse">█</span>}
        </pre>

        {/* IP Range: found hosts table */}
        {isIpRange && job.status === 'completed' && (
          <div className="border-t border-gray-700">
            <div className="px-4 py-2 bg-gray-800 flex items-center gap-3">
              <span className="text-xs text-gray-400">
                Host trovati:{' '}
                <span className={`font-bold ${(aliveHosts ?? 0) > 0 ? 'text-green-400' : 'text-gray-400'}`}>
                  {aliveHosts ?? 0}
                </span>
                {totalIps !== undefined && <span className="text-gray-500"> / {totalIps} IP</span>}
              </span>
              {selectedIps.size > 0 && (
                <button
                  onClick={() => setShowBulkModal(true)}
                  className="ml-auto flex items-center gap-1.5 px-3 py-1 bg-primary-600 text-white text-xs rounded-lg hover:bg-primary-700"
                >
                  <Download size={11} />
                  Importa selezionati ({selectedIps.size})
                </button>
              )}
            </div>

            {foundHosts.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-gray-300">
                  <thead>
                    <tr className="border-b border-gray-700 text-gray-500">
                      <th className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={foundHosts.filter(h => !addedIps.has(h.ip)).every(h => selectedIps.has(h.ip)) && foundHosts.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedIps(new Set(foundHosts.filter(h => !addedIps.has(h.ip)).map(h => h.ip)))
                            else setSelectedIps(new Set())
                          }}
                          className="rounded cursor-pointer"
                        />
                      </th>
                      <th className="text-left px-4 py-2">IP</th>
                      <th className="text-left px-4 py-2">MAC</th>
                      <th className="text-left px-4 py-2">Vendor</th>
                      <th className="text-left px-4 py-2">Hostname</th>
                      <th className="text-left px-4 py-2">Porte</th>
                      <th className="text-center px-3 py-2">Ping</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {foundHosts.map((h) => (
                      <tr key={h.ip} className="border-b border-gray-800 hover:bg-gray-800">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            disabled={addedIps.has(h.ip)}
                            checked={selectedIps.has(h.ip)}
                            onChange={(e) => {
                              setSelectedIps((prev) => {
                                const next = new Set(prev)
                                if (e.target.checked) next.add(h.ip)
                                else next.delete(h.ip)
                                return next
                              })
                            }}
                            className="rounded cursor-pointer"
                          />
                        </td>
                        <td className="px-4 py-2 font-mono text-green-300">{h.ip}</td>
                        <td className="px-4 py-2 font-mono text-gray-400">{h.mac ?? '—'}</td>
                        <td className="px-4 py-2 text-gray-400 max-w-[140px] truncate" title={h.vendor ?? ''}>
                          {h.vendor ?? '—'}
                        </td>
                        <td className="px-4 py-2 text-gray-400">{h.hostname ?? '—'}</td>
                        <td className="px-4 py-2">
                          {h.open_ports.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {h.open_ports.map((p) => (
                                <span key={p} className="px-1.5 py-0.5 bg-blue-900 text-blue-300 rounded font-mono">
                                  {p}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-600">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {(() => {
                            const { status, deviceName } = getMatchStatus(h, allDevices)
                            return <MatchBadge status={status} deviceName={deviceName} ping={h.ping} />
                          })()}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => setAddHost(h)}
                            disabled={addedIps.has(h.ip)}
                            title={addedIps.has(h.ip) ? 'Già aggiunto' : 'Aggiungi come dispositivo'}
                            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                              addedIps.has(h.ip)
                                ? 'bg-green-900 text-green-400 cursor-default'
                                : 'bg-gray-700 text-gray-300 hover:bg-primary-700 hover:text-white'
                            }`}
                          >
                            <PlusCircle size={11} />
                            {addedIps.has(h.ip) ? 'Aggiunto' : 'Aggiungi'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-4 py-3 text-xs text-gray-500">Nessun host raggiungibile trovato.</p>
            )}
          </div>
        )}

        {/* Device scan summary */}
        {!isIpRange && job.status === 'completed' && summary && (
          <div className="grid grid-cols-4 gap-px bg-gray-700 border-t border-gray-700">
            {[
              { label: 'Interfacce', value: (summary.interfaces_collected as number) ?? 0 },
              { label: 'Voci MAC', value: (summary.mac_entries_collected as number) ?? 0 },
              { label: 'ARP', value: (summary.arp_entries_collected as number) ?? 0 },
              { label: 'Conflitti', value: (summary.conflicts_created as number) ?? 0, warning: ((summary.conflicts_created as number) ?? 0) > 0 },
            ].map((stat) => (
              <div key={stat.label} className="bg-gray-800 px-4 py-3 text-center">
                <p className={`text-lg font-bold ${stat.warning ? 'text-orange-400' : 'text-white'}`}>
                  {stat.value}
                </p>
                <p className="text-xs text-gray-400">{stat.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {job.error_message && (
          <div className="px-4 py-3 bg-red-900 border-t border-red-700">
            <p className="text-sm text-red-200">{job.error_message}</p>
          </div>
        )}
      </div>

      {/* Add device modal */}
      {addHost && (
        <AddDeviceModal
          host={addHost}
          vendors={vendors}
          allDevices={allDevices}
          onClose={() => setAddHost(null)}
          onSuccess={() => setAddedIps(prev => new Set([...prev, addHost.ip]))}
        />
      )}

      {/* Bulk import modal */}
      {showBulkModal && (
        <BulkImportModal
          hosts={foundHosts.filter((h) => selectedIps.has(h.ip))}
          onClose={() => setShowBulkModal(false)}
          onSuccess={(ips) => {
            setAddedIps((prev) => new Set([...prev, ...ips]))
            setSelectedIps(new Set())
            setShowBulkModal(false)
          }}
        />
      )}
    </>
  )
}

export default ScanResultPanel
