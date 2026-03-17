import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '../api/dashboard'
import { useUiStore } from '../store/uiStore'
import { useEffect } from 'react'

export const useStats = () => {
  const setPendingConflicts = useUiStore((s) => s.setPendingConflicts)

  const query = useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: dashboardApi.getStats,
    refetchInterval: 30_000,
    staleTime: 20_000,
  })

  useEffect(() => {
    if (query.data) {
      setPendingConflicts(query.data.pending_conflicts)
    }
  }, [query.data, setPendingConflicts])

  return query
}
