import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { X, ExternalLink } from 'lucide-react'
import { useCabinet, useRackDiagram } from '../../hooks/useCabinets'
import RackDiagram from '../rack/RackDiagram'
import RackLegend from '../rack/RackLegend'
import LoadingSpinner from '../common/LoadingSpinner'
import { DeviceTypeBadge, DeviceStatusBadge } from '../common/Badge'
import type { RackDiagramDevice } from '../../types'

interface Props {
  cabinetId: number
  onClose: () => void
  onSelectDevice?: (deviceId: number) => void
}

const CabinetDetailModal: React.FC<Props> = ({ cabinetId, onClose, onSelectDevice }) => {
  const [selectedDevice, setSelectedDevice] = useState<RackDiagramDevice | null>(null)

  const { data: cabinet, isLoading: loadingCabinet } = useCabinet(cabinetId)
  const { data: rackData, isLoading: loadingRack } = useRackDiagram(cabinetId)

  const handleDeviceClick = (device: RackDiagramDevice) => {
    setSelectedDevice((prev) => (prev?.id === device.id ? null : device))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-white w-full max-w-3xl flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-200 bg-gray-50 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-gray-900 truncate text-base">{cabinet?.name ?? '…'}</h2>
            {cabinet && rackData && (
              <p className="text-xs text-gray-500">
                {(cabinet as any).site?.name} — {cabinet.u_count}U — {rackData.used_u}U usate / {rackData.free_u}U libere
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link
              to={`/armadi/${cabinetId}`}
              target="_blank"
              rel="noopener"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <ExternalLink size={12} />
              Pagina armadio
            </Link>
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-5">
          {loadingCabinet || loadingRack ? (
            <LoadingSpinner centered />
          ) : !cabinet || !rackData ? (
            <p className="text-center text-gray-500 py-8">Armadio non trovato</p>
          ) : (
            <div className="flex gap-6 items-start">
              {/* Rack diagram */}
              <div className="overflow-auto flex-shrink-0">
                <RackDiagram
                  cabinet={cabinet}
                  slots={rackData.slots}
                  onDeviceClick={handleDeviceClick}
                  selectedDeviceId={selectedDevice?.id}
                />
              </div>

              {/* Right info */}
              <div className="flex-1 space-y-4 min-w-0">
                <RackLegend />

                {selectedDevice ? (
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-sm truncate">{selectedDevice.name}</span>
                        <DeviceTypeBadge type={selectedDevice.device_type} />
                        <DeviceStatusBadge status={selectedDevice.status} />
                      </div>
                      <button onClick={() => setSelectedDevice(null)} className="text-gray-400 hover:text-gray-600">
                        <X size={14} />
                      </button>
                    </div>
                    <div className="space-y-1.5 text-sm">
                      {selectedDevice.primary_ip && (
                        <div>
                          <span className="text-xs text-gray-500">IP: </span>
                          <span className="font-mono">{selectedDevice.primary_ip}</span>
                        </div>
                      )}
                      {selectedDevice.model && (
                        <div>
                          <span className="text-xs text-gray-500">Modello: </span>
                          <span>{selectedDevice.model}</span>
                        </div>
                      )}
                      <div>
                        <span className="text-xs text-gray-500">Posizione: </span>
                        <span>U{selectedDevice.u_position} — {selectedDevice.u_height}U</span>
                      </div>
                    </div>
                    {onSelectDevice && (
                      <button
                        onClick={() => { onSelectDevice(selectedDevice.id); onClose() }}
                        className="mt-3 w-full text-center text-xs text-primary-600 hover:text-primary-700 font-medium py-1.5 border border-primary-200 rounded-lg hover:bg-primary-50 transition-colors"
                      >
                        Seleziona nella topologia →
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-200">
                      <h3 className="font-semibold text-gray-900 text-sm">
                        Dispositivi ({rackData.slots.filter((s) => s.device).length})
                      </h3>
                    </div>
                    {rackData.slots.filter((s) => s.device).length === 0 ? (
                      <p className="px-4 py-6 text-sm text-gray-500 text-center">Nessun dispositivo nell'armadio</p>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {rackData.slots.filter((s) => s.device).map((s) => {
                          const dev = s.device!
                          return (
                            <div
                              key={dev.id}
                              onClick={() => handleDeviceClick(dev)}
                              className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{dev.name}</p>
                                <p className="text-xs text-gray-500">
                                  {dev.primary_ip ?? 'no IP'} — U{dev.u_position}/{dev.u_height}U
                                </p>
                              </div>
                              <DeviceTypeBadge type={dev.device_type} />
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default CabinetDetailModal
