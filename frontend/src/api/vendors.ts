import apiClient from './client'
import type { Vendor, VendorCreate, PaginatedResponse } from '../types'

export const vendorsApi = {
  list: async (params?: { page?: number; size?: number }): Promise<PaginatedResponse<Vendor>> => {
    const response = await apiClient.get<PaginatedResponse<Vendor>>('/vendors', { params })
    return response.data
  },

  get: async (id: number): Promise<Vendor> => {
    const response = await apiClient.get<Vendor>(`/vendors/${id}`)
    return response.data
  },

  create: async (data: VendorCreate): Promise<Vendor> => {
    const response = await apiClient.post<Vendor>('/vendors', data)
    return response.data
  },

  update: async (id: number, data: Partial<VendorCreate>): Promise<Vendor> => {
    const response = await apiClient.patch<Vendor>(`/vendors/${id}`, data)
    return response.data
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/vendors/${id}`)
  },
}
