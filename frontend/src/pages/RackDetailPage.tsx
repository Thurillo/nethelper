import React, { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useCabinet, useRackDiagram } from '../hooks/useCabinets'
import RackDiagram from '../components/rack/RackDiagram'
import RackLegend from '../components/rack/RackLegend'
import RackDevicePanel from '../components/rack/RackDevicePanel'
import DevicePlacementModal from '../components/rack/DevicePlacementModal'
import { DeviceTypeBadge, DeviceStatusBadge } from '../components/common/Badge'
import LoadingSpinner from '../components/common/LoadingSpinner'
import type { RackDiagramDevice } from '../types'

const RackDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const cabinetId = Number(id)
  const [selectedDevice, setSelectedDevice] = useState<RackDiagramDevice | null>(null)
  const [placementOpen, setPlacementOpen] = useState(false)
  const [suggestedU, setSuggestedU] = useState<number | undefined>()

  const { data: cabinet, isLoading: loadingCabinet } = useCabinet(cabinetId)
  const { data: rackData, isLoading: loadingRack, refetch: refetchRack } = useRackDiagram(cabinetId)

  if (loadingCabinet || loadingRack) return <LoadingSpinner centered />
  if (!cabinet || !rackData) return <div className="text-center text-gray-500 py-12">Armadio non trovato</div>

  const freeSlots = rackData.slots.filter((s) => !s.device).map((s) => s.u_position)
  const devices = rackData.slots.filter((s) => s.device).map((s) => s.device!)

  // When editing placement of an existing device, also include its own slots as available
  const freeForEditSlots = selectedDevice
    ? [
        ...freeSlots,
        ...Array.from(
          { length: selectedDevice.u_height },
          (_, i) => (selectedDevice.u_position ?? 1) + i
        ),
      ].sort((a, b) => a - b)
    : freeSlots

  const handleSlotClick = (u: number) => {
    setSelectedDevice(null)
    setSuggestedU(u)
    setPlacementOpen(true)
  }

  const handleDeviceClick = (device: RackDiagramDevice) => {
    setSelectedDevice((prev) => (prev?.id === device.id ? null : device))
  }

  const handleEditPlacement = () => {
    setSuggestedU(undefined)
    setPlacementOpen(true)
  }

  const handlePlacementClose = () => {
    setPlacementOpen(false)
    setSuggestedU(undefined)
    refetchRack()
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Header */}
      <div className="flex items-start justify-between">
        <div>
          <nav className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <Link to="/armadi" className="hover:text-gray-700">Armadi</Link>
            <span>/</span>
            <span className="text-gray-900">{cabinet.name}</span>
          </nav>
          <h1 className="text-2xl font-bold text-gray-900">{cabinet.name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {cabinet.site?.name} — {cabinet.u_count}U — {rackData.used_u}U usate / {rackData.free_u}U libere
          </p>
        </div>
        <button
          onClick={() => { setSelectedDevice(null); setSuggestedU(undefined); setPlacementOpen(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700"
        >
          <Plus size={16} />
          Aggiungi dispositivo
        </button>
      </div>

      <div className="flex gap-6 items-start">
        {/* Rack diagram */}
        <div className="overflow-auto flex-shrink-0">
          <RackDiagram
            cabinet={cabinet}
            slots={rackData.slots}
            onSlotClick={handleSlotClick}
            onDeviceClick={handleDeviceClick}
            selectedDeviceId={selectedDevice?.id}
          />
        </div>

        {/* Right panel */}
        <div className="flex-1 space-y-4 min-w-0">
          <RackLegend />

          {/* Device detail side panel */}
          {selectedDevice ? (
            <RackDevicePanel
              device={selectedDevice}
              onClose={() => setSelectedDevice(null)}
              onEditPlacement={handleEditPlacement}
            />
          ) : (
            /* Device list (shown when nothing is selected) */
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200">
                <h3 className="font-semibold text-gray-900 text-sm">
                  Dispositivi ({devices.length})
                </h3>
              </div>
              {devices.length === 0 ? (
                <p className="px-4 py-6 text-sm text-gray-500 text-center">
                  Nessun dispositivo nell'armadio
                </p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {devices.map((device) => (
                    <div
                      key={device.id}
                      onClick={() => handleDeviceClick(device)}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{device.name}</p>
                        <p className="text-xs text-gray-500">{device.primary_ip ?? 'no IP'}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <DeviceTypeBadge type={device.device_type} />
                        <DeviceStatusBadge status={device.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <DevicePlacementModal
        isOpen={placementOpen}
        onClose={handlePlacementClose}
        cabinetId={cabinetId}
        suggestedU={selectedDevice ? undefined : suggestedU}
        freeSlots={selectedDevice ? freeForEditSlots : freeSlots}
        preselectedDeviceId={selectedDevice && !suggestedU ? selectedDevice.id : undefined}
        preselectedDeviceName={selectedDevice?.name}
        preselectedDeviceUPosition={selectedDevice?.u_position ?? undefined}
        preselectedDeviceUHeight={selectedDevice?.u_height}
      />
    </div>
  )
}

export default RackDetailPage
