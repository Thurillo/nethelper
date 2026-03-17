import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTopology } from '../hooks/useTopology'
import { useQuery } from '@tanstack/react-query'
import { sitesApi } from '../api/sites'
import TopologyGraph from '../components/topology/TopologyGraph'
import { DeviceTypeBadge, DeviceStatusBadge } from '../components/common/Badge'
import type { DeviceType, TopologyNode } from '../types'

const DEVICE_TYPES: DeviceType[] = ['switch', 'router', 'ap', 'server', 'firewall']

const TopologyPage: React.FC = () => {
  const navigate = useNavigate()
  const [siteFilter, setSiteFilter] = useState<number | undefined>()
  const [typeFilter, setTypeFilter] = useState<DeviceType | undefined>()
  const [selectedNode, setSelectedNode] = useState<TopologyNode | null>(null)

  const { data: topology, isLoading } = useTopology({ site_id: siteFilter, device_type: typeFilter })
  const { data: sitesData } = useQuery({
    queryKey: ['sites', 'all'],
    queryFn: () => sitesApi.list({ size: 100 }),
    staleTime: 60_000,
  })

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Left filter panel */}
      <div className="w-56 flex-shrink-0 space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">Filtri</h3>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Sede</label>
            <select
              value={siteFilter ?? ''}
              onChange={(e) => setSiteFilter(e.target.value ? Number(e.target.value) : undefined)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Tutte le sedi</option>
              {sitesData?.items.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tipo dispositivo</label>
            <select
              value={typeFilter ?? ''}
              onChange={(e) => setTypeFilter(e.target.value as DeviceType || undefined)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Tutti i tipi</option>
              {DEVICE_TYPES.map((t) => (
                <option key={t} value={t}>{t.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
        </div>

        {topology && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Statistiche</h3>
            <div className="space-y-1 text-sm text-gray-600">
              <p>{topology.nodes.length} dispositivi</p>
              <p>{topology.edges.length} collegamenti</p>
            </div>
          </div>
        )}
      </div>

      {/* Topology graph */}
      <div className="flex-1 min-w-0">
        <TopologyGraph
          data={topology}
          isLoading={isLoading}
          onNodeClick={setSelectedNode}
        />
      </div>

      {/* Right detail panel */}
      {selectedNode && (
        <div className="w-64 flex-shrink-0">
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
            <div className="flex items-start justify-between">
              <h3 className="font-semibold text-gray-900 text-sm">{selectedNode.label}</h3>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                ×
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex gap-2">
                <DeviceTypeBadge type={selectedNode.device_type} />
                <DeviceStatusBadge status={selectedNode.status} />
              </div>

              {selectedNode.primary_ip && (
                <div>
                  <p className="text-xs text-gray-500">IP</p>
                  <p className="text-sm font-mono">{selectedNode.primary_ip}</p>
                </div>
              )}

              {selectedNode.cabinet_name && (
                <div>
                  <p className="text-xs text-gray-500">Armadio</p>
                  <p className="text-sm">{selectedNode.cabinet_name}</p>
                </div>
              )}

              {selectedNode.site_name && (
                <div>
                  <p className="text-xs text-gray-500">Sede</p>
                  <p className="text-sm">{selectedNode.site_name}</p>
                </div>
              )}
            </div>

            <button
              onClick={() => navigate(`/dispositivi/${selectedNode.device_id}`)}
              className="w-full px-3 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700"
            >
              Vai al dispositivo
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default TopologyPage
