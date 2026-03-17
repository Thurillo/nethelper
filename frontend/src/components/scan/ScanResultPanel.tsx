import React, { useEffect, useRef } from 'react'
import { XCircle } from 'lucide-react'
import { useScanJobPolling, useCancelScan } from '../../hooks/useScanJobs'
import StatusDot from '../common/StatusDot'
import type { ScanJob } from '../../types'

interface ScanResultPanelProps {
  job: ScanJob
}

const ScanResultPanel: React.FC<ScanResultPanelProps> = ({ job: initialJob }) => {
  const isRunning = initialJob.status === 'running' || initialJob.status === 'pending'
  const { data: liveJob } = useScanJobPolling(initialJob.id, isRunning)
  const job = liveJob ?? initialJob
  const cancelScan = useCancelScan()
  const logRef = useRef<HTMLPreElement>(null)

  // Auto-scroll log to bottom
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [job.log_output])

  return (
    <div className="bg-gray-900 rounded-xl overflow-hidden border border-gray-700">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-800 border-b border-gray-700">
        <StatusDot status={job.status} showLabel />
        <span className="text-sm text-gray-300 font-mono">
          Job #{job.id}
          {job.device && ` — ${job.device.name}`}
        </span>
        {isRunning && (
          <button
            onClick={() => cancelScan.mutate(job.id)}
            disabled={cancelScan.isPending}
            className="ml-auto flex items-center gap-1.5 px-3 py-1 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            <XCircle size={12} />
            Annulla
          </button>
        )}
      </div>

      {/* Log output */}
      <pre
        ref={logRef}
        className="text-xs text-green-400 font-mono p-4 overflow-y-auto bg-gray-900"
        style={{ maxHeight: '300px', minHeight: '120px' }}
      >
        {job.log_output || (isRunning ? 'Avvio scansione...' : 'Nessun output disponibile')}
        {isRunning && <span className="animate-pulse">█</span>}
      </pre>

      {/* Summary */}
      {job.status === 'completed' && (
        <div className="grid grid-cols-4 gap-px bg-gray-700 border-t border-gray-700">
          {[
            { label: 'Dispositivi', value: job.devices_found },
            { label: 'Interfacce', value: job.interfaces_found },
            { label: 'Voci MAC', value: job.mac_entries_found },
            { label: 'Conflitti', value: job.conflicts_created, warning: job.conflicts_created > 0 },
          ].map((stat) => (
            <div key={stat.label} className="bg-gray-800 px-4 py-3 text-center">
              <p className={`text-lg font-bold ${stat.warning ? 'text-orange-400' : 'text-white'}`}>
                {stat.value}
              </p>
              <p className="text-xs text-gray-400">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {job.error_message && (
        <div className="px-4 py-3 bg-red-900 border-t border-red-700">
          <p className="text-sm text-red-200">{job.error_message}</p>
        </div>
      )}
    </div>
  )
}

export default ScanResultPanel
