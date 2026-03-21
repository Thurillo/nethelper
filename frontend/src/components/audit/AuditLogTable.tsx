import React, { useState } from 'react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { ChevronDown, ChevronRight, Download } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { auditLogApi } from '../../api/auditLog'
import Pagination from '../common/Pagination'
import LoadingSpinner from '../common/LoadingSpinner'
import EmptyState from '../common/EmptyState'
import { Badge } from '../common/Badge'
import type { AuditAction, AuditLogFilters } from '../../types'

const ACTION_LABELS: Record<AuditAction, { label: string; variant: 'green' | 'red' | 'blue' | 'orange' | 'gray' | 'purple' }> = {
  create: { label: 'Creazione', variant: 'green' },
  update: { label: 'Modifica', variant: 'blue' },
  delete: { label: 'Eliminazione', variant: 'red' },
  login: { label: 'Accesso', variant: 'gray' },
  logout: { label: 'Disconnessione', variant: 'gray' },
  scan_start: { label: 'Scansione', variant: 'purple' },
  conflict_resolve: { label: 'Risoluzione', variant: 'orange' },
}

const AuditLogTable: React.FC = () => {
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<AuditLogFilters>({})
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const { data, isLoading } = useQuery({
    queryKey: ['audit-log', filters, page],
    queryFn: () => auditLogApi.list({ ...filters, page, size: 25 }),
    staleTime: 30_000,
  })

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const exportCsv = () => {
    if (!data) return
    const headers = ['Data/Ora', 'Utente', 'Azione', 'Entità', 'Campo', 'Valore prima', 'Valore dopo', 'IP Client']
    const rows = data.items.map((log) => [
      format(new Date(log.timestamp), 'dd/MM/yyyy HH:mm:ss'),
      log.username ?? 'Sistema',
      ACTION_LABELS[log.action]?.label ?? log.action,
      `${log.entity_table ?? ''}${log.entity_id ? ` #${log.entity_id}` : ''}`,
      log.field_name ?? '',
      log.old_value ?? '',
      log.new_value ?? '',
      log.client_ip ?? '',
    ])
    const csv = [headers, ...rows].map((row) => row.map((v) => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-log-${format(new Date(), 'yyyyMMdd-HHmm')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap bg-white rounded-xl border border-gray-200 p-4">
        <select
          value={filters.action ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, action: (e.target.value as AuditAction) || undefined }))}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">Tutte le azioni</option>
          {Object.entries(ACTION_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>

        <select
          value={filters.entity_table ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, entity_table: e.target.value || undefined }))}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">Tutte le entità</option>
          {['device', 'interface', 'cable', 'vlan', 'prefix', 'ip_address', 'cabinet', 'site', 'user', 'scan_job', 'conflict'].map((et) => (
            <option key={et} value={et}>{et}</option>
          ))}
        </select>

        <input
          type="date"
          value={filters.from_dt ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, from_dt: e.target.value || undefined }))}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <span className="text-gray-400 text-sm">—</span>
        <input
          type="date"
          value={filters.to_dt ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, to_dt: e.target.value || undefined }))}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />

        <button
          onClick={exportCsv}
          disabled={!data || data.items.length === 0}
          className="ml-auto flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40"
        >
          <Download size={14} />
          Esporta CSV
        </button>
      </div>

      {/* Table */}
      {isLoading ? (
        <LoadingSpinner centered />
      ) : data?.items.length === 0 ? (
        <EmptyState title="Nessun log trovato" description="Modifica i filtri per cercare altri eventi." />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Data/Ora</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Utente</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Azione</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Entità</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Campo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Prima</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Dopo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">IP</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data?.items.map((log) => (
                <React.Fragment key={log.id}>
                  <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => toggleExpand(log.id)}>
                    <td className="px-4 py-3 whitespace-nowrap text-xs font-mono text-gray-600">
                      {format(new Date(log.timestamp), 'dd/MM/yy HH:mm', { locale: it })}
                    </td>
                    <td className="px-4 py-3 text-gray-700 font-medium">{log.username ?? <span className="text-gray-400 italic">sistema</span>}</td>
                    <td className="px-4 py-3">
                      {log.action && <Badge variant={ACTION_LABELS[log.action]?.variant ?? 'gray'}>{ACTION_LABELS[log.action]?.label ?? log.action}</Badge>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      <span className="font-medium">{log.entity_table ?? '—'}</span>
                      {log.entity_id && <span className="text-gray-400"> #{log.entity_id}</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 font-mono">{log.field_name ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-red-600 font-mono max-w-[120px] truncate">{log.old_value ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-green-700 font-mono max-w-[120px] truncate">{log.new_value ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-400 font-mono">{log.client_ip ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-400">
                      {expanded.has(log.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </td>
                  </tr>
                  {expanded.has(log.id) && (
                    <tr className="bg-gray-50">
                      <td colSpan={9} className="px-4 py-3">
                        <pre className="text-xs text-gray-700 font-mono bg-white border border-gray-200 rounded-lg p-3 overflow-x-auto">
                          {JSON.stringify(log, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          {data && (
            <Pagination page={page} pages={data.pages} total={data.total} size={data.size} onPageChange={setPage} />
          )}
        </div>
      )}
    </div>
  )
}

export default AuditLogTable
