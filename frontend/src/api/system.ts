import apiClient from './client'

export interface SystemInfo {
  hash: string
  message: string
  date: string
  branch: string
}

export interface UpdateCommit {
  hash: string
  message: string
  date: string
}

export interface UpdateCheckResult {
  has_update: boolean
  commits_behind: number
  local_hash: string
  remote_hash: string
  new_commits: UpdateCommit[]
}

export const systemApi = {
  getInfo: async (): Promise<SystemInfo> => {
    const r = await apiClient.get<SystemInfo>('/system/info')
    return r.data
  },

  checkUpdate: async (): Promise<UpdateCheckResult> => {
    const r = await apiClient.get<UpdateCheckResult>('/system/update/check')
    return r.data
  },

  /** Returns a ReadableStream of SSE events. */
  applyUpdate: (): Promise<Response> => {
    const token = localStorage.getItem('access_token') ?? ''
    return fetch('/api/v1/system/update/apply', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
  },

  /** Force a frontend rebuild (recovery after a failed update). */
  rebuildFrontend: (): Promise<Response> => {
    const token = localStorage.getItem('access_token') ?? ''
    return fetch('/api/v1/system/update/rebuild-frontend', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
  },
}
