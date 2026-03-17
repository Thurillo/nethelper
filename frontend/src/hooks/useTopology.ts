import { useQuery } from '@tanstack/react-query'
import { topologyApi } from '../api/topology'
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
