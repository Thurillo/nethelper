import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cabinetsApi } from '../api/cabinets'
import type { CabinetCreate } from '../types'

export const useCabinets = (params?: { site_id?: number; page?: number; size?: number }) => {
  return useQuery({
    queryKey: ['cabinets', params],
    queryFn: () => cabinetsApi.list(params),
    staleTime: 30_000,
  })
}

export const useCabinet = (id: number | undefined) => {
  return useQuery({
    queryKey: ['cabinets', id],
    queryFn: () => cabinetsApi.get(id!),
    enabled: !!id,
    staleTime: 30_000,
  })
}

export const useRackDiagram = (cabinetId: number | undefined) => {
  return useQuery({
    queryKey: ['cabinets', cabinetId, 'rack-diagram'],
    queryFn: () => cabinetsApi.getRackDiagram(cabinetId!),
    enabled: !!cabinetId,
    staleTime: 30_000,
  })
}

export const useCreateCabinet = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CabinetCreate) => cabinetsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cabinets'] })
    },
  })
}

export const useUpdateCabinet = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CabinetCreate> }) => cabinetsApi.update(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['cabinets', id] })
      qc.invalidateQueries({ queryKey: ['cabinets'] })
    },
  })
}

export const useDeleteCabinet = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => cabinetsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cabinets'] })
    },
  })
}
