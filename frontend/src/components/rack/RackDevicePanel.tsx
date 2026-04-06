import React from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { X, Edit2, ExternalLink, Network } from 'lucide-react'
import type { RackDiagramDevice, DevicePortDetail, PatchPortDetail } from '../../types'
import { DeviceTypeBadge, DeviceStatusBadge } from '../common/Badge'
import { devicesApi } from '../../api/devices'
import { patchPanelsApi } from '../../api/patchPanels'
import PatchPanelGrid from '../patchpanel/PatchPanelGrid'

interface RackDevicePanelProps {
  device: RackDiagramDevice
  onClose: () => void
  onEditPlacement: () => void
}

/** Side panel shown when a device is selected in the rack diagram */
const RackDevicePanel: React.FC<RackDevicePanelProps> = ({ device, onClose, onEditPlacement }) => {
  const isPatchPanel = device.device_type === 'patch_panel'
  const isSwitch = device.device_type === 'switch'

  // Fetch patch panel ports only if it's a patch panel
  const { data: ports, refetch: refetchPorts } = useQuery<PatchPortDetail[]>({
    queryKey: ['patch-panel-ports', device.id],
    queryFn: () => patchPanelsApi.getPorts(device.id),
    enabled: isPatchPanel,
    staleTime: 30_000,
  })

  // Fetch ports (with cable info) for all non-PP devices
  const { data: devicePorts } = useQuery<DevicePortDetail[]>({
    queryKey: ['devices', device.id, 'ports'],
    queryFn: () => devicesApi.getPorts(device.id),
    enabled: !isPatchPanel,
    staleTime: 30_000,
  })
  const switchPorts = isSwitch ? devicePorts : undefined
  const connectedPorts = !isPatchPanel && !isSwitch ? devicePorts?.filter(p => p.linked_interface) : undefined
  const allPortsForDevice = !isPatchPanel && !isSwitch ? devicePorts : undefined

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2 min-w-0">
          <DeviceTypeBadge type={device.device_type} />
          <span className="font-semibold text-gray-900 truncate">{device.name}</span>
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
          title="Chiudi"
        >
          <X size={16} />
        </button>
      </div>

      {/* Body */}
      <div className="p-4 space-y-4 overflow-y-auto flex-1">
        {/* Info grid */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Stato</p>
            <DeviceStatusBadge status={device.status} />
          </div>
          {device.primary_ip && (
            <div>
              <p className="text-xs text-gray-500 mb-0.5">IP primario</p>
              <p className="font-mono text-gray-900">{device.primary_ip}</p>
            </div>
          )}
          {device.model && (
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Modello</p>
              <p className="text-gray-900">{device.model}</p>
            </div>
          )}
          {device.serial_number && (
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Numero seriale</p>
              <p className="font-mono text-gray-700 text-xs">{device.serial_number}</p>
            </div>
          )}
          {device.u_position !== null && (
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Posizione rack</p>
              <p className="text-gray-900">U{device.u_position} — {device.u_height}U</p>
            </div>
          )}
        </div>

        {device.notes && (
          <div>
            <p className="text-xs text-gray-500 mb-1">Note</p>
            <p className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">{device.notes}</p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={onEditPlacement}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Edit2 size={14} />
            Modifica posizione
          </button>
          <Link
            to={`/dispositivi/${device.id}`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-primary-600 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 transition-colors"
          >
            <ExternalLink size={14} />
            Dettaglio completo
          </Link>
        </div>

        {/* Connessioni per dispositivi normali (non switch, non PP) */}
        {allPortsForDevice && allPortsForDevice.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <Network size={14} className="text-gray-400" />
              Connessioni
              <span className="text-xs font-normal text-gray-500">
                ({connectedPorts?.length ?? 0} / {allPortsForDevice.length} interfacce)
              </span>
            </h4>
            <div className="border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-100">
              {allPortsForDevice.map(p => (
                <div key={p.interface.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                  <span className="font-mono text-gray-700 w-20 flex-shrink-0">{p.interface.name}</span>
                  {p.interface.label && (
                    <span className="text-gray-400 truncate flex-shrink-0 max-w-[80px]">{p.interface.label}</span>
                  )}
                  {p.linked_interface ? (
                    <span className="flex items-center gap-1 text-green-700 font-medium truncate ml-auto">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                      {p.linked_interface.device_name} — {p.linked_interface.name}
                    </span>
                  ) : (
                    <span className="text-gray-300 ml-auto">non collegata</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {allPortsForDevice && allPortsForDevice.length === 0 && (
          <p className="text-xs text-gray-400 italic">Nessuna interfaccia configurata</p>
        )}

        {/* Patch panel inline */}
        {isPatchPanel && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              Porte patch panel
              {ports && (
                <span className="text-xs font-normal text-gray-500">
                  ({ports.filter(p => p.linked_interface).length} collegate / {ports.length} totali)
                </span>
              )}
            </h4>
            {ports ? (
              <PatchPanelGrid
                deviceId={device.id}
                ports={ports}
                onRefresh={refetchPorts}
              />
            ) : (
              <p className="text-xs text-gray-400">Caricamento porte...</p>
            )}
          </div>
        )}

        {/* Switch port list */}
        {isSwitch && switchPorts && switchPorts.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-3">
              Porte switch
              <span className="ml-2 text-xs font-normal text-gray-500">
                ({switchPorts.filter(p => p.linked_interface).length} collegate / {switchPorts.length} totali)
              </span>
            </h4>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 text-gray-600 font-medium">Porta</th>
                      <th className="text-left px-3 py-2 text-gray-600 font-medium">Etichetta</th>
                      <th className="text-left px-3 py-2 text-gray-600 font-medium">Connesso a</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {switchPorts.map((p) => (
                      <tr key={p.interface.id} className="hover:bg-gray-50">
                        <td className="px-3 py-1.5 font-mono text-gray-800">{p.interface.name}</td>
                        <td className="px-3 py-1.5 text-gray-600">{p.interface.label ?? '—'}</td>
                        <td className="px-3 py-1.5">
                          {p.linked_interface
                            ? <span className="text-green-700 font-medium flex items-center gap-1">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500" />
                                {p.linked_interface.device_name} — {p.linked_interface.name}
                              </span>
                            : <span className="text-gray-300">—</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default RackDevicePanel
