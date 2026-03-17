import React from 'react'
import { clsx } from 'clsx'
import type { ScanStatus } from '../../types'

interface StatusDotProps {
  status: ScanStatus
  showLabel?: boolean
}

const statusConfig: Record<ScanStatus, { color: string; label: string; pulse: boolean }> = {
  pending: { color: 'bg-gray-400', label: 'In coda', pulse: false },
  running: { color: 'bg-blue-500', label: 'In esecuzione', pulse: true },
  completed: { color: 'bg-green-500', label: 'Completato', pulse: false },
  failed: { color: 'bg-red-500', label: 'Fallito', pulse: false },
  cancelled: { color: 'bg-gray-400', label: 'Annullato', pulse: false },
}

const StatusDot: React.FC<StatusDotProps> = ({ status, showLabel = false }) => {
  const config = statusConfig[status]

  return (
    <span className="inline-flex items-center gap-2">
      <span className="relative inline-flex h-2.5 w-2.5">
        {config.pulse && (
          <span
            className={clsx(
              'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
              config.color
            )}
          />
        )}
        <span className={clsx('relative inline-flex rounded-full h-2.5 w-2.5', config.color)} />
      </span>
      {showLabel && (
        <span className="text-sm text-gray-700">{config.label}</span>
      )}
    </span>
  )
}

export default StatusDot
