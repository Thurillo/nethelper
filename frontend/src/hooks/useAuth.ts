import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../api/auth'
import { useAuthStore } from '../store/authStore'
import type { LoginRequest } from '../types'

export const useLogin = () => {
  const setAuth = useAuthStore((s) => s.setAuth)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: LoginRequest) => {
      const tokens = await authApi.login(data)
      localStorage.setItem('access_token', tokens.access_token)
      localStorage.setItem('refresh_token', tokens.refresh_token)
      const user = await authApi.me()
      return { tokens, user }
    },
    onSuccess: ({ tokens, user }) => {
      setAuth(user, tokens.access_token, tokens.refresh_token)
      queryClient.clear()
      navigate('/')
    },
  })
}

export const useLogout = () => {
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      try {
        await authApi.logout()
      } catch {
        // ignore errors on logout
      }
    },
    onSettled: () => {
      logout()
      queryClient.clear()
      navigate('/login')
    },
  })
}

export const useCurrentUser = () => {
  const accessToken = useAuthStore((s) => s.accessToken)
  const setAuth = useAuthStore((s) => s.setAuth)

  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: authApi.me,
    enabled: !!accessToken,
    onSuccess: (user) => {
      const at = localStorage.getItem('access_token') ?? ''
      const rt = localStorage.getItem('refresh_token') ?? ''
      setAuth(user, at, rt)
    },
    staleTime: 5 * 60 * 1000,
  })
}
