import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { devicesApi } from '../api/devices'
import type { DeviceCreate, DeviceFilters } from '../types'

export const useDevices = (filters?: DeviceFilters) => {
  return useQuery({
    queryKey: ['devices', filters],
    queryFn: () => devicesApi.list(filters),
    staleTime: 30_000,
  })
}

export const useDevice = (id: number | undefined) => {
  return useQuery({
    queryKey: ['devices', id],
    queryFn: () => devicesApi.get(id!),
    enabled: !!id,
    staleTime: 30_000,
  })
}

export const useDeviceInterfaces = (deviceId: number | undefined) => {
  return useQuery({
    queryKey: ['devices', deviceId, 'interfaces'],
    queryFn: () => devicesApi.getInterfaces(deviceId!),
    enabled: !!deviceId,
    staleTime: 30_000,
  })
}

export const useDeviceIpAddresses = (deviceId: number | undefined) => {
  return useQuery({
    queryKey: ['devices', deviceId, 'ip-addresses'],
    queryFn: () => devicesApi.getIpAddresses(deviceId!),
    enabled: !!deviceId,
    staleTime: 30_000,
  })
}

export const useDeviceMacEntries = (deviceId: number | undefined, params?: { page?: number; size?: number }) => {
  return useQuery({
    queryKey: ['devices', deviceId, 'mac-entries', params],
    queryFn: () => devicesApi.getMacEntries(deviceId!, params),
    enabled: !!deviceId,
    staleTime: 30_000,
  })
}

export const useCreateDevice = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: DeviceCreate) => devicesApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['devices'] })
    },
  })
}

export const useUpdateDevice = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<DeviceCreate> }) => devicesApi.update(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['devices', id] })
      qc.invalidateQueries({ queryKey: ['devices'] })
    },
  })
}

export const useDeleteDevice = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => devicesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['devices'] })
    },
  })
}
