import apiClient from './client'
import type { Site, SiteCreate, PaginatedResponse } from '../types'

export const sitesApi = {
  list: async (params?: { page?: number; size?: number; search?: string }): Promise<PaginatedResponse<Site>> => {
    const response = await apiClient.get<PaginatedResponse<Site>>('/sites', { params })
    return response.data
  },

  get: async (id: number): Promise<Site> => {
    const response = await apiClient.get<Site>(`/sites/${id}`)
    return response.data
  },

  create: async (data: SiteCreate): Promise<Site> => {
    const response = await apiClient.post<Site>('/sites', data)
    return response.data
  },

  update: async (id: number, data: Partial<SiteCreate>): Promise<Site> => {
    const response = await apiClient.patch<Site>(`/sites/${id}`, data)
    return response.data
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/sites/${id}`)
  },
}
