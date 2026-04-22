import apiClient from './client'
import type {
  Device, DeviceCreate, DeviceFilters, NetworkInterface, IpAddress,
  MacEntry, ScanJob, PaginatedResponse, DeviceBulkCreateRequest, DeviceBulkCreateResponse,
  DeviceConnectionsPreview, DevicePortDetail, PortMapEntry
} from '../types'

export const devicesApi = {
  list: async (params?: DeviceFilters): Promise<PaginatedResponse<Device>> => {
    const response = await apiClient.get<PaginatedResponse<Device>>('/devices', { params })
    return response.data
  },

  get: async (id: number): Promise<Device> => {
    const response = await apiClient.get<Device>(`/devices/${id}`)
    return response.data
  },

  create: async (data: DeviceCreate): Promise<Device> => {
    const response = await apiClient.post<Device>('/devices', data)
    return response.data
  },

  update: async (id: number, data: Partial<DeviceCreate>): Promise<Device> => {
    const response = await apiClient.patch<Device>(`/devices/${id}`, data)
    return response.data
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/devices/${id}`)
  },

  getInterfaces: async (deviceId: number): Promise<NetworkInterface[]> => {
    const response = await apiClient.get<NetworkInterface[]>(`/devices/${deviceId}/interfaces`)
    return response.data
  },

  getPorts: async (deviceId: number): Promise<DevicePortDetail[]> => {
    const response = await apiClient.get<DevicePortDetail[]>(`/devices/${deviceId}/ports`)
    return response.data
  },

  getIpAddresses: async (deviceId: number): Promise<IpAddress[]> => {
    const response = await apiClient.get<IpAddress[]>(`/devices/${deviceId}/ip-addresses`)
    return response.data
  },

  getMacEntries: async (deviceId: number, params?: { page?: number; size?: number }): Promise<PaginatedResponse<MacEntry>> => {
    const response = await apiClient.get<PaginatedResponse<MacEntry>>(`/devices/${deviceId}/mac-entries`, { params })
    return response.data
  },

  getScanJobs: async (deviceId: number, params?: { page?: number; size?: number }): Promise<PaginatedResponse<ScanJob>> => {
    const response = await apiClient.get<PaginatedResponse<ScanJob>>(`/devices/${deviceId}/scan-jobs`, { params })
    return response.data
  },

  getPortMap: async (deviceId: number): Promise<PortMapEntry[]> => {
    const response = await apiClient.get<PortMapEntry[]>(`/devices/${deviceId}/port-map`)
    return response.data
  },

  startScan: async (deviceId: number, scanType: string): Promise<ScanJob> => {
    const response = await apiClient.post<ScanJob>(`/devices/${deviceId}/scan`, { scan_type: scanType })
    return response.data
  },

  bulkCreate: async (data: DeviceBulkCreateRequest): Promise<DeviceBulkCreateResponse> => {
    const response = await apiClient.post<DeviceBulkCreateResponse>('/devices/bulk', data)
    return response.data
  },

  getConnectionsPreview: async (id: number): Promise<DeviceConnectionsPreview> => {
    const response = await apiClient.get<DeviceConnectionsPreview>(`/devices/${id}/connections-preview`)
    return response.data
  },

  bulkUpdate: async (ids: number[], data: { cabinet_id?: number | null; status?: string }): Promise<{ updated: number }> => {
    const response = await apiClient.patch<{ updated: number }>('/devices/bulk-update', { ids, ...data })
    return response.data
  },

  bulkDelete: async (ids: number[]): Promise<{ deleted: number }> => {
    const response = await apiClient.delete<{ deleted: number }>('/devices/bulk-delete', { data: { ids } })
    return response.data
  },
}
