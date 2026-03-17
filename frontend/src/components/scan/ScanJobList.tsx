import React, { useState } from 'react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { useScanJobs } from '../../hooks/useScanJobs'
import StatusDot from '../common/StatusDot'
import Pagination from '../common/Pagination'
import LoadingSpinner from '../common/LoadingSpinner'
import EmptyState from '../common/EmptyState'
import { Scan } from 'lucide-react'
import type { ScanJob, ScanJobFilters } from '../../types'

const SCAN_TYPE_LABELS: Record<string, string> = {
  snmp_full: 'SNMP Completo',
  snmp_arp: 'SNMP ARP',
  snmp_mac: 'SNMP MAC',
  snmp_lldp: 'SNMP LLDP',
  ssh_full: 'SSH Completo',
  ip_range: 'Range IP',
}

interface ScanJobListProps {
  filters?: ScanJobFilters
  onSelectJob?: (job: ScanJob) => void
  selectedJobId?: number
}

const ScanJobList: React.FC<ScanJobListProps> = ({ filters, onSelectJob, selectedJobId }) => {
  const [page, setPage] = useState(1)
  const { data, isLoading } = useScanJobs({ ...filters, page, size: 10 })

  if (isLoading) return <LoadingSpinner centered />

  if (!data || data.items.length === 0) {
    return (
      <EmptyState
        icon={<Scan size={36} />}
        title="Nessuna scansione"
        description="Non ci sono scansioni per questo filtro."
      />
    )
  }

  return (
    <div>
      <div className="space-y-2">
        {data.items.map((job) => (
          <div
            key={job.id}
            onClick={() => onSelectJob?.(job)}
            className={`bg-white border rounded-xl p-4 cursor-pointer transition-colors ${
              selectedJobId === job.id
                ? 'border-primary-500 ring-1 ring-primary-500'
                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center gap-3">
              <StatusDot status={job.status} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-900">
                    {SCAN_TYPE_LABELS[job.scan_type] ?? job.scan_type}
                  </span>
                  {job.device && (
                    <span className="text-sm text-gray-600">— {job.device.name}</span>
                  )}
                  {job.ip_range_start && (
                    <span className="text-xs text-gray-500 font-mono">
                      {job.ip_range_start} – {job.ip_range_end}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {job.started_at
                    ? format(new Date(job.started_at), 'dd MMM yyyy HH:mm:ss', { locale: it })
                    : format(new Date(job.created_at), 'dd MMM yyyy HH:mm:ss', { locale: it })}
                  {job.completed_at && (
                    <> — {format(new Date(job.completed_at), 'HH:mm:ss', { locale: it })}</>
                  )}
                </p>
              </div>
              {job.status === 'completed' && (
                <div className="text-right text-xs text-gray-500">
                  <p>{job.devices_found} disp.</p>
                  <p>{job.interfaces_found} int.</p>
                  {job.conflicts_created > 0 && (
                    <p className="text-orange-600 font-medium">{job.conflicts_created} confl.</p>
                  )}
                </div>
              )}
            </div>
            {job.error_message && (
              <p className="mt-2 text-xs text-red-600 bg-red-50 rounded px-2 py-1">{job.error_message}</p>
            )}
          </div>
        ))}
      </div>
      <Pagination
        page={page}
        pages={data.pages}
        total={data.total}
        size={data.size}
        onPageChange={setPage}
      />
    </div>
  )
}

export default ScanJobList
