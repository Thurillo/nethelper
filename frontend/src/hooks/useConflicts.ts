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
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data?: ConflictResolveRequest }) =>
      conflictsApi.accept(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conflicts'], exact: false })
      qc.invalidateQueries({ queryKey: ['dashboard'], exact: false })
      addToast('Conflitto accettato', 'success')
    },
    onError: () => addToast('Errore durante l\'accettazione del conflitto', 'error'),
  })
}

export const useRejectConflict = () => {
  const qc = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data?: ConflictResolveRequest }) =>
      conflictsApi.reject(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conflicts'], exact: false })
      qc.invalidateQueries({ queryKey: ['dashboard'], exact: false })
      addToast('Conflitto rifiutato', 'success')
    },
    onError: () => addToast('Errore durante il rifiuto del conflitto', 'error'),
  })
}

export const useIgnoreConflict = () => {
  const qc = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data?: ConflictResolveRequest }) =>
      conflictsApi.ignore(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conflicts'], exact: false })
      qc.invalidateQueries({ queryKey: ['dashboard'], exact: false })
      addToast('Conflitto ignorato', 'info')
    },
    onError: () => addToast('Errore durante l\'operazione', 'error'),
  })
}

export const useBulkResolve = () => {
  const qc = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)
  return {
    bulkAccept: useMutation({
      mutationFn: (data: BulkResolveRequest) => conflictsApi.bulkAccept(data),
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['conflicts'], exact: false })
        qc.invalidateQueries({ queryKey: ['dashboard'], exact: false })
        addToast('Conflitti accettati', 'success')
      },
      onError: () => addToast('Errore durante l\'accettazione bulk', 'error'),
    }),
    bulkReject: useMutation({
      mutationFn: (data: BulkResolveRequest) => conflictsApi.bulkReject(data),
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['conflicts'], exact: false })
        qc.invalidateQueries({ queryKey: ['dashboard'], exact: false })
        addToast('Conflitti rifiutati', 'success')
      },
      onError: () => addToast('Errore durante il rifiuto bulk', 'error'),
    }),
  }
}
