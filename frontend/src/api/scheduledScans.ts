import apiClient from './client'
import type { ScheduledScan, ScheduledScanCreate, PaginatedResponse } from '../types'

export const scheduledScansApi = {
  list: async (params?: { page?: number; size?: number }): Promise<PaginatedResponse<ScheduledScan>> => {
    const response = await apiClient.get<PaginatedResponse<ScheduledScan>>('/scheduled-scans', { params })
    return response.data
  },

  get: async (id: number): Promise<ScheduledScan> => {
    const response = await apiClient.get<ScheduledScan>(`/scheduled-scans/${id}`)
    return response.data
  },

  create: async (data: ScheduledScanCreate): Promise<ScheduledScan> => {
    const response = await apiClient.post<ScheduledScan>('/scheduled-scans', data)
    return response.data
  },

  update: async (id: number, data: Partial<ScheduledScanCreate>): Promise<ScheduledScan> => {
    const response = await apiClient.patch<ScheduledScan>(`/scheduled-scans/${id}`, data)
    return response.data
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/scheduled-scans/${id}`)
  },

  toggle: async (id: number, enabled: boolean): Promise<ScheduledScan> => {
    const response = await apiClient.patch<ScheduledScan>(`/scheduled-scans/${id}`, { is_enabled: enabled })
    return response.data
  },
}
