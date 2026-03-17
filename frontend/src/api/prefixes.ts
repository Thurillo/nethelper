import apiClient from './client'
import type { IpPrefix, IpPrefixCreate, PrefixUtilization, IpAddress, PaginatedResponse } from '../types'

export const prefixesApi = {
  list: async (params?: {
    site_id?: number
    vlan_id?: number
    status?: string
    is_pool?: boolean
    page?: number
    size?: number
  }): Promise<PaginatedResponse<IpPrefix>> => {
    const response = await apiClient.get<PaginatedResponse<IpPrefix>>('/prefixes', { params })
    return response.data
  },

  get: async (id: number): Promise<IpPrefix> => {
    const response = await apiClient.get<IpPrefix>(`/prefixes/${id}`)
    return response.data
  },

  create: async (data: IpPrefixCreate): Promise<IpPrefix> => {
    const response = await apiClient.post<IpPrefix>('/prefixes', data)
    return response.data
  },

  update: async (id: number, data: Partial<IpPrefixCreate>): Promise<IpPrefix> => {
    const response = await apiClient.patch<IpPrefix>(`/prefixes/${id}`, data)
    return response.data
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/prefixes/${id}`)
  },

  getUtilization: async (id: number): Promise<PrefixUtilization> => {
    const response = await apiClient.get<PrefixUtilization>(`/prefixes/${id}/utilization`)
    return response.data
  },

  getAvailableIps: async (id: number, count?: number): Promise<string[]> => {
    const response = await apiClient.get<string[]>(`/prefixes/${id}/available-ips`, {
      params: { count: count ?? 20 },
    })
    return response.data
  },

  getIpAddresses: async (id: number, params?: { page?: number; size?: number }): Promise<PaginatedResponse<IpAddress>> => {
    const response = await apiClient.get<PaginatedResponse<IpAddress>>(`/prefixes/${id}/ip-addresses`, { params })
    return response.data
  },
}
