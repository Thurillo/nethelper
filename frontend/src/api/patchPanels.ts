import apiClient from './client'
import type { Device, PatchPanelPort, PatchPanelPortUpdate, PaginatedResponse } from '../types'

export const patchPanelsApi = {
  list: async (params?: { site_id?: number; cabinet_id?: number; page?: number; size?: number }): Promise<PaginatedResponse<Device>> => {
    const response = await apiClient.get<PaginatedResponse<Device>>('/devices', {
      params: { ...params, device_type: 'patch_panel' },
    })
    return response.data
  },

  getPorts: async (deviceId: number): Promise<PatchPanelPort[]> => {
    const response = await apiClient.get<PatchPanelPort[]>(`/devices/${deviceId}/patch-panel-ports`)
    return response.data
  },

  updatePort: async (deviceId: number, portNumber: number, data: PatchPanelPortUpdate): Promise<PatchPanelPort> => {
    const response = await apiClient.patch<PatchPanelPort>(
      `/devices/${deviceId}/patch-panel-ports/${portNumber}`,
      data
    )
    return response.data
  },

  linkPort: async (deviceId: number, portNumber: number, interfaceId: number): Promise<PatchPanelPort> => {
    const response = await apiClient.post<PatchPanelPort>(
      `/devices/${deviceId}/patch-panel-ports/${portNumber}/link`,
      { interface_id: interfaceId }
    )
    return response.data
  },

  unlinkPort: async (deviceId: number, portNumber: number): Promise<PatchPanelPort> => {
    const response = await apiClient.post<PatchPanelPort>(
      `/devices/${deviceId}/patch-panel-ports/${portNumber}/unlink`
    )
    return response.data
  },
}
