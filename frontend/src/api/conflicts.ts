import apiClient from './client'
import type { ScanConflict, ConflictFilters, ConflictResolveRequest, BulkResolveRequest, PaginatedResponse } from '../types'

export const conflictsApi = {
  list: async (params?: ConflictFilters): Promise<PaginatedResponse<ScanConflict>> => {
    const response = await apiClient.get<PaginatedResponse<ScanConflict>>('/conflicts', { params })
    return response.data
  },

  get: async (id: number): Promise<ScanConflict> => {
    const response = await apiClient.get<ScanConflict>(`/conflicts/${id}`)
    return response.data
  },

  accept: async (id: number, data?: ConflictResolveRequest): Promise<ScanConflict> => {
    const response = await apiClient.post<ScanConflict>(`/conflicts/${id}/accept`, data ?? {})
    return response.data
  },

  reject: async (id: number, data?: ConflictResolveRequest): Promise<ScanConflict> => {
    const response = await apiClient.post<ScanConflict>(`/conflicts/${id}/reject`, data ?? {})
    return response.data
  },

  ignore: async (id: number, data?: ConflictResolveRequest): Promise<ScanConflict> => {
    const response = await apiClient.post<ScanConflict>(`/conflicts/${id}/ignore`, data ?? {})
    return response.data
  },

  bulkAccept: async (data: BulkResolveRequest): Promise<{ updated: number }> => {
    const response = await apiClient.post<{ updated: number }>('/conflicts/bulk-accept', data)
    return response.data
  },

  bulkReject: async (data: BulkResolveRequest): Promise<{ updated: number }> => {
    const response = await apiClient.post<{ updated: number }>('/conflicts/bulk-reject', data)
    return response.data
  },

  create: async (data: {
    conflict_type: string
    device_id?: number | null
    entity_table?: string
    field_name?: string
    current_value?: unknown
    discovered_value?: unknown
    notes?: string
  }): Promise<ScanConflict> => {
    const response = await apiClient.post<ScanConflict>('/conflicts', data)
    return response.data
  },

  pendingCount: async (): Promise<{ count: number }> => {
    const response = await apiClient.get<{ count: number }>('/conflicts/pending-count')
    return response.data
  },
}
