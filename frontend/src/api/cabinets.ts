import apiClient from './client'
import type { Cabinet, CabinetCreate, RackDiagram, PaginatedResponse } from '../types'

export const cabinetsApi = {
  list: async (params?: { site_id?: number; page?: number; size?: number }): Promise<PaginatedResponse<Cabinet>> => {
    const response = await apiClient.get<PaginatedResponse<Cabinet>>('/cabinets', { params })
    return response.data
  },

  get: async (id: number): Promise<Cabinet> => {
    const response = await apiClient.get<Cabinet>(`/cabinets/${id}`)
    return response.data
  },

  create: async (data: CabinetCreate): Promise<Cabinet> => {
    const response = await apiClient.post<Cabinet>('/cabinets', data)
    return response.data
  },

  update: async (id: number, data: Partial<CabinetCreate>): Promise<Cabinet> => {
    const response = await apiClient.patch<Cabinet>(`/cabinets/${id}`, data)
    return response.data
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/cabinets/${id}`)
  },

  getRackDiagram: async (cabinetId: number): Promise<RackDiagram> => {
    const response = await apiClient.get<RackDiagram>(`/cabinets/${cabinetId}/rack-diagram`)
    return response.data
  },
}
