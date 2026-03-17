import apiClient from './client'
import type { User, UserCreate, UserUpdate, PaginatedResponse } from '../types'

export const usersApi = {
  list: async (params?: { page?: number; size?: number }): Promise<PaginatedResponse<User>> => {
    const response = await apiClient.get<PaginatedResponse<User>>('/users', { params })
    return response.data
  },

  get: async (id: number): Promise<User> => {
    const response = await apiClient.get<User>(`/users/${id}`)
    return response.data
  },

  create: async (data: UserCreate): Promise<User> => {
    const response = await apiClient.post<User>('/users', data)
    return response.data
  },

  update: async (id: number, data: UserUpdate): Promise<User> => {
    const response = await apiClient.patch<User>(`/users/${id}`, data)
    return response.data
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/users/${id}`)
  },

  resetPassword: async (id: number, newPassword: string): Promise<void> => {
    await apiClient.post(`/users/${id}/reset-password`, { new_password: newPassword })
  },
}
