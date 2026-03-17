import React, { useState } from 'react'
import { AlertTriangle, Check, X, EyeOff } from 'lucide-react'
import { clsx } from 'clsx'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { ConflictTypeBadge } from '../common/Badge'
import type { ScanConflict } from '../../types'

interface ConflictDiffCardProps {
  conflict: ScanConflict
  onAccept: (id: number, notes?: string) => void
  onReject: (id: number, notes?: string) => void
  onIgnore: (id: number, notes?: string) => void
  isLoading?: boolean
}

const ConflictDiffCard: React.FC<ConflictDiffCardProps> = ({
  conflict,
  onAccept,
  onReject,
  onIgnore,
  isLoading = false,
}) => {
  const [notes, setNotes] = useState('')
  const [showNotes, setShowNotes] = useState(false)

  const isUnmanagedSwitch = conflict.conflict_type === 'suspected_unmanaged_switch'

  return (
    <div className={clsx(
      'bg-white rounded-xl border shadow-sm overflow-hidden',
      isUnmanagedSwitch ? 'border-orange-300' : 'border-gray-200'
    )}>
      {/* Header */}
      <div className={clsx(
        'px-4 py-3 flex items-center gap-3',
        isUnmanagedSwitch ? 'bg-orange-50 border-b border-orange-200' : 'bg-gray-50 border-b border-gray-200'
      )}>
        {isUnmanagedSwitch ? (
          <AlertTriangle className="text-orange-500 w-5 h-5 flex-shrink-0" />
        ) : (
          <AlertTriangle className="text-yellow-500 w-5 h-5 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <ConflictTypeBadge type={conflict.conflict_type} />
            {conflict.device && (
              <span className="text-sm font-medium text-gray-900 truncate">{conflict.device.name}</span>
            )}
          </div>
          {conflict.created_at && (
            <p className="text-xs text-gray-500 mt-0.5">
              {format(new Date(conflict.created_at), 'dd MMM yyyy HH:mm', { locale: it })}
            </p>
          )}
        </div>
      </div>

      {/* Description */}
      {conflict.description && (
        <div className="px-4 py-2 text-sm text-gray-600 bg-gray-50 border-b border-gray-100">
          {conflict.description}
        </div>
      )}

      {/* Diff */}
      {conflict.field_name && (
        <div className="grid grid-cols-2 gap-px bg-gray-200 mx-4 my-3 rounded-lg overflow-hidden">
          <div className="bg-white p-3">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Valore attuale</p>
            <p className="text-sm text-gray-900 font-mono break-all">
              {conflict.current_value ?? <span className="italic text-gray-400">—</span>}
            </p>
          </div>
          <div className="bg-green-50 p-3">
            <p className="text-xs font-semibold text-green-600 uppercase mb-1">Valore rilevato</p>
            <p className="text-sm text-green-900 font-mono break-all">
              {conflict.detected_value ?? <span className="italic text-gray-400">—</span>}
            </p>
          </div>
        </div>
      )}

      {/* Notes input toggle */}
      <div className="px-4 pb-3">
        {showNotes ? (
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Aggiungi una nota (opzionale)..."
            rows={2}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none mb-2"
          />
        ) : (
          <button
            onClick={() => setShowNotes(true)}
            className="text-xs text-gray-400 hover:text-gray-600 underline"
          >
            + Aggiungi nota
          </button>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => onAccept(conflict.id, notes || undefined)}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            <Check size={12} />
            Accetta
          </button>
          <button
            onClick={() => onReject(conflict.id, notes || undefined)}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            <X size={12} />
            Rifiuta
          </button>
          <button
            onClick={() => onIgnore(conflict.id, notes || undefined)}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-200 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-300 disabled:opacity-50"
          >
            <EyeOff size={12} />
            Ignora
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConflictDiffCard
