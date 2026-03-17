import apiClient from './client'
import type { Cable, CableCreate, PaginatedResponse } from '../types'

export const cablesApi = {
  list: async (params?: { page?: number; size?: number }): Promise<PaginatedResponse<Cable>> => {
    const response = await apiClient.get<PaginatedResponse<Cable>>('/cables', { params })
    return response.data
  },

  get: async (id: number): Promise<Cable> => {
    const response = await apiClient.get<Cable>(`/cables/${id}`)
    return response.data
  },

  create: async (data: CableCreate): Promise<Cable> => {
    const response = await apiClient.post<Cable>('/cables', data)
    return response.data
  },

  update: async (id: number, data: Partial<CableCreate>): Promise<Cable> => {
    const response = await apiClient.patch<Cable>(`/cables/${id}`, data)
    return response.data
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/cables/${id}`)
  },
}
