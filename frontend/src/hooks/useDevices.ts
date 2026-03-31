import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { devicesApi } from '../api/devices'
import { useUiStore } from '../store/uiStore'
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

export const useDeviceInterfaces = (deviceId: number | undefined, tabActive = true) => {
  return useQuery({
    queryKey: ['devices', deviceId, 'interfaces'],
    queryFn: () => devicesApi.getInterfaces(deviceId!),
    enabled: !!deviceId && tabActive,
    staleTime: 30_000,
  })
}

export const useDeviceIpAddresses = (deviceId: number | undefined, tabActive = true) => {
  return useQuery({
    queryKey: ['devices', deviceId, 'ip-addresses'],
    queryFn: () => devicesApi.getIpAddresses(deviceId!),
    enabled: !!deviceId && tabActive,
    staleTime: 30_000,
  })
}

export const useDeviceMacEntries = (deviceId: number | undefined, tabActive = true, params?: { page?: number; size?: number }) => {
  return useQuery({
    queryKey: ['devices', deviceId, 'mac-entries', params],
    queryFn: () => devicesApi.getMacEntries(deviceId!, params),
    enabled: !!deviceId && tabActive,
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
  const { addToast } = useUiStore()
  return useMutation({
    mutationFn: (id: number) => devicesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['devices'], exact: false })
    },
    onError: () => addToast("Errore durante l'eliminazione del dispositivo", 'error'),
  })
}

export const useDeviceConnectionsPreview = (deviceId: number | undefined, enabled: boolean) =>
  useQuery({
    queryKey: ['devices', deviceId, 'connections-preview'],
    queryFn: () => devicesApi.getConnectionsPreview(deviceId!),
    enabled: !!deviceId && enabled,
    staleTime: 0,
  })
