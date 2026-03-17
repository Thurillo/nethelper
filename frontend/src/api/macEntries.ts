import apiClient from './client'
import type { MacEntry, MacEntryCreate, PaginatedResponse } from '../types'

export const macEntriesApi = {
  list: async (params?: {
    device_id?: number
    vlan_id?: number
    page?: number
    size?: number
  }): Promise<PaginatedResponse<MacEntry>> => {
    const response = await apiClient.get<PaginatedResponse<MacEntry>>('/mac-entries', { params })
    return response.data
  },

  get: async (id: number): Promise<MacEntry> => {
    const response = await apiClient.get<MacEntry>(`/mac-entries/${id}`)
    return response.data
  },

  create: async (data: MacEntryCreate): Promise<MacEntry> => {
    const response = await apiClient.post<MacEntry>('/mac-entries', data)
    return response.data
  },

  update: async (id: number, data: Partial<MacEntryCreate>): Promise<MacEntry> => {
    const response = await apiClient.patch<MacEntry>(`/mac-entries/${id}`, data)
    return response.data
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/mac-entries/${id}`)
  },

  search: async (mac: string): Promise<MacEntry[]> => {
    const response = await apiClient.get<MacEntry[]>('/mac-entries/search', { params: { mac } })
    return response.data
  },
}
