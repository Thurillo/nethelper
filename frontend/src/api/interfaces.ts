import apiClient from './client'
import type { NetworkInterface, InterfaceCreate, PaginatedResponse } from '../types'

export const interfacesApi = {
  list: async (params?: { device_id?: number; page?: number; size?: number }): Promise<PaginatedResponse<NetworkInterface>> => {
    const response = await apiClient.get<PaginatedResponse<NetworkInterface>>('/interfaces', { params })
    return response.data
  },

  get: async (id: number): Promise<NetworkInterface> => {
    const response = await apiClient.get<NetworkInterface>(`/interfaces/${id}`)
    return response.data
  },

  create: async (data: InterfaceCreate): Promise<NetworkInterface> => {
    const response = await apiClient.post<NetworkInterface>('/interfaces', data)
    return response.data
  },

  update: async (id: number, data: Partial<InterfaceCreate>): Promise<NetworkInterface> => {
    const response = await apiClient.patch<NetworkInterface>(`/interfaces/${id}`, data)
    return response.data
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/interfaces/${id}`)
  },
}
