import apiClient from './client'
import type { TopologyGraph, TopologyNode } from '../types'

export const topologyApi = {
  getTopology: async (params?: { site_id?: number; device_type?: string }): Promise<TopologyGraph> => {
    const response = await apiClient.get<TopologyGraph>('/topology', { params })
    return response.data
  },

  getNeighbors: async (deviceId: number): Promise<{ node: TopologyNode; neighbors: TopologyNode[] }> => {
    const response = await apiClient.get<{ node: TopologyNode; neighbors: TopologyNode[] }>(
      `/topology/neighbors/${deviceId}`
    )
    return response.data
  },
}
