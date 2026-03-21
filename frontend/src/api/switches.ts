import apiClient from './client'
import type { SwitchPortDetail } from '../types'

export interface SwitchPortUpdateBody {
  label?: string | null
  description?: string | null
  is_uplink?: boolean
  is_enabled?: boolean
  vlan_id?: number | null
  speed_mbps?: number | null
}

export const switchesApi = {
  getPorts: async (deviceId: number): Promise<SwitchPortDetail[]> => {
    const response = await apiClient.get<SwitchPortDetail[]>(`/switches/${deviceId}/ports`)
    return response.data
  },

  updatePort: async (deviceId: number, portId: number, data: SwitchPortUpdateBody): Promise<void> => {
    await apiClient.patch(`/switches/${deviceId}/ports/${portId}`, data)
  },

  linkPort: async (deviceId: number, portId: number, targetInterfaceId: number): Promise<void> => {
    await apiClient.post(`/switches/${deviceId}/ports/${portId}/link`, {
      target_interface_id: targetInterfaceId,
    })
  },

  unlinkPort: async (deviceId: number, portId: number): Promise<void> => {
    await apiClient.delete(`/switches/${deviceId}/ports/${portId}/link`)
  },
}
