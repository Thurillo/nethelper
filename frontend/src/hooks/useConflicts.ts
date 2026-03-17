import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { conflictsApi } from '../api/conflicts'
import { useUiStore } from '../store/uiStore'
import type { ConflictFilters, ConflictResolveRequest, BulkResolveRequest } from '../types'

export const useConflicts = (filters?: ConflictFilters) => {
  return useQuery({
    queryKey: ['conflicts', filters],
    queryFn: () => conflictsApi.list(filters),
    staleTime: 15_000,
  })
}

export const usePendingCount = () => {
  const setPendingConflicts = useUiStore((s) => s.setPendingConflicts)
  return useQuery({
    queryKey: ['conflicts', 'pending-count'],
    queryFn: async () => {
      const res = await conflictsApi.pendingCount()
      setPendingConflicts(res.count)
      return res
    },
    refetchInterval: 30_000,
    staleTime: 20_000,
  })
}

export const useAcceptConflict = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data?: ConflictResolveRequest }) =>
      conflictsApi.accept(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conflicts'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export const useRejectConflict = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data?: ConflictResolveRequest }) =>
      conflictsApi.reject(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conflicts'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export const useIgnoreConflict = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data?: ConflictResolveRequest }) =>
      conflictsApi.ignore(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conflicts'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export const useBulkResolve = () => {
  const qc = useQueryClient()
  return {
    bulkAccept: useMutation({
      mutationFn: (data: BulkResolveRequest) => conflictsApi.bulkAccept(data),
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['conflicts'] })
        qc.invalidateQueries({ queryKey: ['dashboard'] })
      },
    }),
    bulkReject: useMutation({
      mutationFn: (data: BulkResolveRequest) => conflictsApi.bulkReject(data),
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['conflicts'] })
        qc.invalidateQueries({ queryKey: ['dashboard'] })
      },
    }),
  }
}
