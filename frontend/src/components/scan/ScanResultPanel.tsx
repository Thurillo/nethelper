import React, { useEffect, useRef } from 'react'
import { XCircle, Wifi, WifiOff } from 'lucide-react'
import { useScanJobPolling, useCancelScan } from '../../hooks/useScanJobs'
import StatusDot from '../common/StatusDot'
import type { ScanJob } from '../../types'

interface FoundHost {
  ip: string
  open_ports: number[]
  hostname: string | null
  ping: boolean
}

interface ScanResultPanelProps {
  job: ScanJob
}

const ScanResultPanel: React.FC<ScanResultPanelProps> = ({ job: initialJob }) => {
  const isRunning = initialJob.status === 'running' || initialJob.status === 'pending'
  const { data: liveJob } = useScanJobPolling(initialJob.id, isRunning)
  const job = liveJob ?? initialJob
  const cancelScan = useCancelScan()
  const logRef = useRef<HTMLPreElement>(null)
  const isIpRange = job.scan_type === 'ip_range'

  const summary = job.result_summary as Record<string, unknown> | null
  const foundHosts: FoundHost[] = (summary?.found_hosts as FoundHost[]) ?? []
  const aliveHosts = summary?.alive_hosts as number | undefined
  const totalIps = summary?.total_ips as number | undefined

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
          {job.range_start_ip && ` — ${job.range_start_ip} → ${job.range_end_ip}`}
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
        style={{ maxHeight: '220px', minHeight: '80px' }}
      >
        {job.log_output || (isRunning ? 'Avvio scansione...' : 'Nessun output disponibile')}
        {isRunning && <span className="animate-pulse">█</span>}
      </pre>

      {/* IP Range results: found hosts table */}
      {isIpRange && job.status === 'completed' && (
        <div className="border-t border-gray-700">
          <div className="px-4 py-2 bg-gray-800 flex items-center gap-3">
            <span className="text-xs text-gray-400">
              Host trovati: <span className={`font-bold ${(aliveHosts ?? 0) > 0 ? 'text-green-400' : 'text-gray-400'}`}>
                {aliveHosts ?? 0}
              </span>
              {totalIps !== undefined && <span className="text-gray-500"> / {totalIps} IP</span>}
            </span>
          </div>

          {foundHosts.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-gray-300">
                <thead>
                  <tr className="border-b border-gray-700 text-gray-500">
                    <th className="text-left px-4 py-2">IP</th>
                    <th className="text-left px-4 py-2">Hostname</th>
                    <th className="text-left px-4 py-2">Porte aperte</th>
                    <th className="text-center px-4 py-2">Ping</th>
                  </tr>
                </thead>
                <tbody>
                  {foundHosts.map((h) => (
                    <tr key={h.ip} className="border-b border-gray-800 hover:bg-gray-800">
                      <td className="px-4 py-2 font-mono text-green-300">{h.ip}</td>
                      <td className="px-4 py-2 text-gray-400">{h.hostname ?? '—'}</td>
                      <td className="px-4 py-2">
                        {h.open_ports.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {h.open_ports.map((p) => (
                              <span key={p} className="px-1.5 py-0.5 bg-blue-900 text-blue-300 rounded font-mono">
                                {p}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {h.ping ? (
                          <Wifi size={12} className="text-green-400 inline" />
                        ) : (
                          <WifiOff size={12} className="text-gray-600 inline" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-4 py-3 text-xs text-gray-500">Nessun host raggiungibile trovato.</p>
          )}
        </div>
      )}

      {/* Device scan summary */}
      {!isIpRange && job.status === 'completed' && summary && (
        <div className="grid grid-cols-4 gap-px bg-gray-700 border-t border-gray-700">
          {[
            { label: 'Interfacce', value: (summary.interfaces_collected as number) ?? 0 },
            { label: 'Voci MAC', value: (summary.mac_entries_collected as number) ?? 0 },
            { label: 'ARP', value: (summary.arp_entries_collected as number) ?? 0 },
            { label: 'Conflitti', value: (summary.conflicts_created as number) ?? 0, warning: ((summary.conflicts_created as number) ?? 0) > 0 },
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
