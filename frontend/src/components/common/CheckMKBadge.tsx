import React from 'react'
import type { CheckMKStatus } from '../../types'

interface Props {
  status: CheckMKStatus | null | undefined
}

const CONFIG: Record<CheckMKStatus, { label: string; dot: string; bg: string; text: string }> = {
  up:          { label: 'UP',          dot: '●', bg: 'bg-green-50',  text: 'text-green-700' },
  down:        { label: 'DOWN',        dot: '●', bg: 'bg-red-50',    text: 'text-red-700' },
  unreachable: { label: 'UNREACHABLE', dot: '●', bg: 'bg-orange-50', text: 'text-orange-700' },
  pending:     { label: 'PENDING',     dot: '○', bg: 'bg-gray-100',  text: 'text-gray-500' },
  not_found:   { label: 'non trovato', dot: '⚠', bg: 'bg-yellow-50', text: 'text-yellow-700' },
  not_linked:  { label: '',            dot: '',  bg: '',             text: '' },
}

const CheckMKBadge: React.FC<Props> = ({ status }) => {
  if (!status || status === 'not_linked') return null
  const cfg = CONFIG[status]
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}
      title={`CheckMK: ${cfg.label}`}
    >
      <span>{cfg.dot}</span>
      {cfg.label}
    </span>
  )
}

export default CheckMKBadge
