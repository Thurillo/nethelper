import apiClient from './client'
import type {
  TopologyGraph,
  TopologyNode,
  TopologyMapList,
  TopologyMapRead,
  TopologyMapCreate,
  TopologyMapUpdate,
  TopologyMapLayoutPatch,
} from '../types'

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

export const topologyMapsApi = {
  list: async (params?: { site_id?: number }): Promise<TopologyMapList[]> => {
    const response = await apiClient.get<TopologyMapList[]>('/topology/maps/', { params })
    return response.data
  },

  create: async (data: TopologyMapCreate): Promise<TopologyMapRead> => {
    const response = await apiClient.post<TopologyMapRead>('/topology/maps/', data)
    return response.data
  },

  get: async (id: number): Promise<TopologyMapRead> => {
    const response = await apiClient.get<TopologyMapRead>(`/topology/maps/${id}`)
    return response.data
  },

  update: async (id: number, data: TopologyMapUpdate): Promise<TopologyMapRead> => {
    const response = await apiClient.put<TopologyMapRead>(`/topology/maps/${id}`, data)
    return response.data
  },

  patchLayout: async (id: number, data: TopologyMapLayoutPatch): Promise<TopologyMapRead> => {
    const response = await apiClient.patch<TopologyMapRead>(`/topology/maps/${id}/layout`, data)
    return response.data
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/topology/maps/${id}`)
  },
}
