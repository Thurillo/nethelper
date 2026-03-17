import apiClient from './client'
import type { AuditLog, AuditLogFilters, PaginatedResponse } from '../types'

export const auditLogApi = {
  list: async (params?: AuditLogFilters): Promise<PaginatedResponse<AuditLog>> => {
    const response = await apiClient.get<PaginatedResponse<AuditLog>>('/audit-log', { params })
    return response.data
  },
}
