import apiClient from './client'
import type { Device, PatchPortDetail, PaginatedResponse } from '../types'

export interface InterfaceUpdateBody {
  label?: string | null
  room_destination?: string | null
  notes?: string | null
}

export const patchPanelsApi = {
  /** Lista di tutti i dispositivi patch_panel */
  list: async (params?: { site_id?: number; cabinet_id?: number; page?: number; size?: number }): Promise<PaginatedResponse<Device>> => {
    const response = await apiClient.get<PaginatedResponse<Device>>('/devices', {
      params: { ...params, device_type: 'patch_panel' },
    })
    return response.data
  },

  /** Porte di un patch panel — endpoint corretto: /patch-panels/{id}/ports */
  getPorts: async (deviceId: number): Promise<PatchPortDetail[]> => {
    const response = await apiClient.get<PatchPortDetail[]>(`/patch-panels/${deviceId}/ports`)
    return response.data
  },

  /** Aggiorna etichetta / stanza / note di una porta (portId = interface.id) */
  updatePort: async (deviceId: number, portId: number, data: InterfaceUpdateBody): Promise<void> => {
    await apiClient.patch(`/patch-panels/${deviceId}/ports/${portId}`, data)
  },

  /** Collega una porta a un'interfaccia di switch (crea cavo) */
  linkPort: async (deviceId: number, portId: number, targetInterfaceId: number): Promise<void> => {
    await apiClient.post(`/patch-panels/${deviceId}/ports/${portId}/link`, {
      target_interface_id: targetInterfaceId,
    })
  },

  /** Rimuove il collegamento (elimina cavo) */
  unlinkPort: async (deviceId: number, portId: number): Promise<void> => {
    await apiClient.delete(`/patch-panels/${deviceId}/ports/${portId}/link`)
  },
}
