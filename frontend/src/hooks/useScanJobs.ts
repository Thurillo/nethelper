import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { scanJobsApi } from '../api/scanJobs'
import { devicesApi } from '../api/devices'
import type { IpRangeScanRequest, ScanJobFilters } from '../types'

export const useScanJobs = (filters?: ScanJobFilters) => {
  return useQuery({
    queryKey: ['scan-jobs', filters],
    queryFn: () => scanJobsApi.list(filters),
    staleTime: 10_000,
  })
}

export const useScanJob = (id: number | undefined) => {
  return useQuery({
    queryKey: ['scan-jobs', id],
    queryFn: () => scanJobsApi.get(id!),
    enabled: !!id,
    staleTime: 5_000,
  })
}

export const useScanJobPolling = (id: number | undefined, enabled: boolean) => {
  return useQuery({
    queryKey: ['scan-jobs', id, 'poll'],
    queryFn: () => scanJobsApi.get(id!),
    enabled: !!id && enabled,
    refetchInterval: 2_000,
  })
}

export const useStartScan = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ deviceId, scanType }: { deviceId: number; scanType: string }) =>
      devicesApi.startScan(deviceId, scanType),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scan-jobs'] })
    },
  })
}

export const useStartIpRangeScan = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: IpRangeScanRequest) => scanJobsApi.startIpRange(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scan-jobs'] })
    },
  })
}

export const useCancelScan = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => scanJobsApi.cancel(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['scan-jobs', id] })
      qc.invalidateQueries({ queryKey: ['scan-jobs'] })
    },
  })
}

export const useDeleteScanJob = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => scanJobsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scan-jobs'] })
    },
  })
}
