import apiClient from './client'

export interface CheckMKSettingsRead {
  url: string
  username: string
  api_key_set: boolean
  enabled: boolean
}

export interface CheckMKSettings {
  url: string
  username: string
  api_key: string
  enabled: boolean
}

export interface CheckMKTestResult {
  ok: boolean
  message: string
  version?: string | null
}

export interface CheckMKHostItem {
  name: string
  address: string
}

export interface CheckMKDeviceStatus {
  host_name: string
  state: number
  state_label: string
  address: string
}

export const checkmkApi = {
  getSettings: (): Promise<CheckMKSettingsRead> =>
    apiClient.get('/checkmk/settings').then((r) => r.data),

  updateSettings: (data: CheckMKSettings): Promise<void> =>
    apiClient.put('/checkmk/settings', data).then(() => undefined),

  testConnection: (): Promise<CheckMKTestResult> =>
    apiClient.get('/checkmk/test').then((r) => r.data),

  getHosts: (): Promise<CheckMKHostItem[]> =>
    apiClient.get('/checkmk/hosts').then((r) => r.data),

  getStatus: (): Promise<Record<number, CheckMKDeviceStatus>> =>
    apiClient.get('/checkmk/status').then((r) => r.data),

  linkDevice: (deviceId: number, hostName: string): Promise<void> =>
    apiClient.post(`/checkmk/link/${deviceId}`, { host_name: hostName }).then(() => undefined),

  unlinkDevice: (deviceId: number): Promise<void> =>
    apiClient.delete(`/checkmk/link/${deviceId}`).then(() => undefined),
}
