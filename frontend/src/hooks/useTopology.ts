import { useQuery } from '@tanstack/react-query'
import { topologyApi, topologyMapsApi } from '../api/topology'
import type { DeviceType } from '../types'

export const useTopology = (filters?: { site_id?: number; device_type?: DeviceType }) => {
  return useQuery({
    queryKey: ['topology', filters],
    queryFn: () => topologyApi.getTopology(filters),
    staleTime: 60_000,
  })
}

export const useNeighbors = (deviceId: number | undefined) => {
  return useQuery({
    queryKey: ['topology', 'neighbors', deviceId],
    queryFn: () => topologyApi.getNeighbors(deviceId!),
    enabled: !!deviceId,
    staleTime: 30_000,
  })
}

export const useTopologyMaps = (params?: { site_id?: number }) => {
  return useQuery({
    queryKey: ['topology-maps', params],
    queryFn: () => topologyMapsApi.list(params),
    staleTime: 60_000,
  })
}

export const useTopologyMap = (mapId: number | null) => {
  return useQuery({
    queryKey: ['topology-maps', mapId],
    queryFn: () => topologyMapsApi.get(mapId!),
    enabled: !!mapId,
    staleTime: 30_000,
  })
}
