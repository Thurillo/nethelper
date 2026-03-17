import React, { useState } from 'react'
import { CheckSquare, XSquare, ChevronDown, ChevronRight } from 'lucide-react'
import { useConflicts, useAcceptConflict, useRejectConflict, useIgnoreConflict, useBulkResolve } from '../../hooks/useConflicts'
import ConflictDiffCard from './ConflictDiffCard'
import Pagination from '../common/Pagination'
import LoadingSpinner from '../common/LoadingSpinner'
import EmptyState from '../common/EmptyState'
import { ConflictTypeBadge, ConflictStatusBadge } from '../common/Badge'
import type { ConflictFilters, ConflictType, ConflictStatus, ScanConflict } from '../../types'

interface ConflictReviewTableProps {
  defaultStatus?: ConflictStatus
}

const ConflictReviewTable: React.FC<ConflictReviewTableProps> = ({ defaultStatus = 'pending' }) => {
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<ConflictFilters>({ status: defaultStatus, size: 20 })
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const { data, isLoading } = useConflicts({ ...filters, page })
  const acceptConflict = useAcceptConflict()
  const rejectConflict = useRejectConflict()
  const ignoreConflict = useIgnoreConflict()
  const { bulkAccept, bulkReject } = useBulkResolve()

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (!data) return
    if (selected.size === data.items.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(data.items.map((c) => c.id)))
    }
  }

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Group by device
  const grouped: Map<string, ScanConflict[]> = new Map()
  data?.items.forEach((c) => {
    const key = c.device ? `${c.device.id}-${c.device.name}` : 'Senza dispositivo'
    const arr = grouped.get(key) ?? []
    arr.push(c)
    grouped.set(key, arr)
  })

  if (isLoading) return <LoadingSpinner centered />

  return (
    <div className="space-y-4">
      {/* Filters toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={filters.conflict_type ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, conflict_type: (e.target.value as ConflictType) || undefined }))}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">Tutti i tipi</option>
          <option value="ip_change">Cambio IP</option>
          <option value="mac_change">Cambio MAC</option>
          <option value="interface_added">Interfaccia aggiunta</option>
          <option value="interface_removed">Interfaccia rimossa</option>
          <option value="vlan_change">Cambio VLAN</option>
          <option value="hostname_change">Cambio hostname</option>
          <option value="speed_change">Cambio velocità</option>
          <option value="suspected_unmanaged_switch">Switch non gestito</option>
        </select>

        {selected.size > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-gray-600">{selected.size} selezionati</span>
            <button
              onClick={() => bulkAccept.mutate({ conflict_ids: Array.from(selected) })}
              disabled={bulkAccept.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              <CheckSquare size={14} />
              Accetta selezionati
            </button>
            <button
              onClick={() => bulkReject.mutate({ conflict_ids: Array.from(selected) })}
              disabled={bulkReject.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              <XSquare size={14} />
              Rifiuta selezionati
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      {data?.items.length === 0 ? (
        <EmptyState title="Nessun conflitto" description="Non ci sono conflitti in questa categoria." />
      ) : (
        <>
          {/* Select all */}
          {filters.status === 'pending' && data && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selected.size === data.items.length && data.items.length > 0}
                onChange={toggleAll}
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-600">Seleziona tutti</span>
            </div>
          )}

          {/* Grouped by device */}
          {Array.from(grouped.entries()).map(([deviceKey, conflicts]) => (
            <div key={deviceKey} className="border border-gray-200 rounded-xl overflow-hidden">
              <button
                onClick={() => toggleExpand(conflicts[0].id)}
                className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left"
              >
                {expanded.has(conflicts[0].id) ? (
                  <ChevronDown size={16} className="text-gray-400" />
                ) : (
                  <ChevronRight size={16} className="text-gray-400" />
                )}
                <span className="font-medium text-gray-900 text-sm">{conflicts[0].device?.name ?? 'Senza dispositivo'}</span>
                <span className="text-xs text-gray-500 ml-1">({conflicts.length} conflitti)</span>
                <div className="flex gap-1 ml-auto flex-wrap">
                  {[...new Set(conflicts.map((c) => c.conflict_type))].slice(0, 3).map((t) => (
                    <ConflictTypeBadge key={t} type={t} />
                  ))}
                </div>
              </button>

              {expanded.has(conflicts[0].id) && (
                <div className="p-4 space-y-3">
                  {conflicts.map((conflict) => (
                    <div key={conflict.id} className="flex gap-3">
                      {filters.status === 'pending' && (
                        <input
                          type="checkbox"
                          checked={selected.has(conflict.id)}
                          onChange={() => toggleSelect(conflict.id)}
                          className="mt-3 rounded border-gray-300 flex-shrink-0"
                        />
                      )}
                      <div className="flex-1">
                        <ConflictDiffCard
                          conflict={conflict}
                          onAccept={(id, notes) => acceptConflict.mutate({ id, data: { notes } })}
                          onReject={(id, notes) => rejectConflict.mutate({ id, data: { notes } })}
                          onIgnore={(id, notes) => ignoreConflict.mutate({ id, data: { notes } })}
                          isLoading={acceptConflict.isPending || rejectConflict.isPending || ignoreConflict.isPending}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {data && (
            <Pagination
              page={page}
              pages={data.pages}
              total={data.total}
              size={data.size}
              onPageChange={setPage}
            />
          )}
        </>
      )}
    </div>
  )
}

export default ConflictReviewTable
