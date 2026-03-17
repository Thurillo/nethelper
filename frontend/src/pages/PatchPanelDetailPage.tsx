import React from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { devicesApi } from '../api/devices'
import { patchPanelsApi } from '../api/patchPanels'
import PatchPanelGrid from '../components/patchpanel/PatchPanelGrid'
import LoadingSpinner from '../components/common/LoadingSpinner'

const PatchPanelDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const deviceId = Number(id)

  const { data: device, isLoading: loadingDevice } = useQuery({
    queryKey: ['devices', deviceId],
    queryFn: () => devicesApi.get(deviceId),
    staleTime: 30_000,
  })

  const { data: ports, isLoading: loadingPorts, refetch } = useQuery({
    queryKey: ['patch-panel-ports', deviceId],
    queryFn: () => patchPanelsApi.getPorts(deviceId),
    staleTime: 30_000,
  })

  if (loadingDevice || loadingPorts) return <LoadingSpinner centered />
  if (!device) return <div className="text-center text-gray-500 py-12">Patch panel non trovato</div>

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <Link to="/patch-panel" className="hover:text-gray-700">Patch Panel</Link>
        <span>/</span>
        <span className="text-gray-900">{device.name}</span>
      </nav>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">{device.name}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {device.cabinet?.name ?? '—'} — {device.cabinet?.site?.name ?? '—'}
          {device.model && ` — ${device.model}`}
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <PatchPanelGrid
          deviceId={deviceId}
          ports={ports ?? []}
          onRefresh={refetch}
        />
      </div>
    </div>
  )
}

export default PatchPanelDetailPage
