import apiClient from './client'
import type { Vlan, VlanCreate, NetworkInterface, IpPrefix, PaginatedResponse } from '../types'

export const vlansApi = {
  list: async (params?: { site_id?: number; status?: string; page?: number; size?: number }): Promise<PaginatedResponse<Vlan>> => {
    const response = await apiClient.get<PaginatedResponse<Vlan>>('/vlans', { params })
    return response.data
  },

  get: async (id: number): Promise<Vlan> => {
    const response = await apiClient.get<Vlan>(`/vlans/${id}`)
    return response.data
  },

  create: async (data: VlanCreate): Promise<Vlan> => {
    const response = await apiClient.post<Vlan>('/vlans', data)
    return response.data
  },

  update: async (id: number, data: Partial<VlanCreate>): Promise<Vlan> => {
    const response = await apiClient.patch<Vlan>(`/vlans/${id}`, data)
    return response.data
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/vlans/${id}`)
  },

  getInterfaces: async (vlanId: number): Promise<NetworkInterface[]> => {
    const response = await apiClient.get<NetworkInterface[]>(`/vlans/${vlanId}/interfaces`)
    return response.data
  },

  getPrefixes: async (vlanId: number): Promise<IpPrefix[]> => {
    const response = await apiClient.get<IpPrefix[]>(`/vlans/${vlanId}/prefixes`)
    return response.data
  },
}
