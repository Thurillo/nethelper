import apiClient from './client'
import type { ScanJob, ScanJobFilters, IpRangeScanRequest, PaginatedResponse } from '../types'

export const scanJobsApi = {
  list: async (params?: ScanJobFilters): Promise<PaginatedResponse<ScanJob>> => {
    const response = await apiClient.get<PaginatedResponse<ScanJob>>('/scan-jobs', { params })
    return response.data
  },

  get: async (id: number): Promise<ScanJob> => {
    const response = await apiClient.get<ScanJob>(`/scan-jobs/${id}`)
    return response.data
  },

  startIpRange: async (data: IpRangeScanRequest): Promise<ScanJob> => {
    const response = await apiClient.post<ScanJob>('/scan-jobs/ip-range', data)
    return response.data
  },

  cancel: async (id: number): Promise<ScanJob> => {
    const response = await apiClient.post<ScanJob>(`/scan-jobs/${id}/cancel`)
    return response.data
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/scan-jobs/${id}`)
  },
}
