import apiClient from './client'
import type { IpAddress, IpAddressCreate, PaginatedResponse } from '../types'

export const ipAddressesApi = {
  list: async (params?: {
    prefix_id?: number
    device_id?: number
    status?: string
    page?: number
    size?: number
  }): Promise<PaginatedResponse<IpAddress>> => {
    const response = await apiClient.get<PaginatedResponse<IpAddress>>('/ip-addresses', { params })
    return response.data
  },

  get: async (id: number): Promise<IpAddress> => {
    const response = await apiClient.get<IpAddress>(`/ip-addresses/${id}`)
    return response.data
  },

  create: async (data: IpAddressCreate): Promise<IpAddress> => {
    const response = await apiClient.post<IpAddress>('/ip-addresses', data)
    return response.data
  },

  update: async (id: number, data: Partial<IpAddressCreate>): Promise<IpAddress> => {
    const response = await apiClient.patch<IpAddress>(`/ip-addresses/${id}`, data)
    return response.data
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/ip-addresses/${id}`)
  },
}
