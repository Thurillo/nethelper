import React from 'react'
import { clsx } from 'clsx'
import type { PatchPortDetail } from '../../types'

interface PortCellProps {
  port: PatchPortDetail
  index: number
  onClick: (port: PatchPortDetail) => void
}

/** Estrae il numero porta dal nome (es. "port-5" → 5, "pair-3" → 3) */
function extractPortNumber(name: string, fallback: number): number {
  const m = name.match(/(\d+)$/)
  return m ? parseInt(m[1], 10) : fallback
}

const PortCell: React.FC<PortCellProps> = ({ port, index, onClick }) => {
  const hasLink = port.linked_interface !== null
  const hasRoom = !!port.interface.room_destination

  const colorClass = hasLink
    ? 'bg-green-500 border-green-600 text-white'
    : hasRoom
    ? 'bg-yellow-400 border-yellow-500 text-gray-900'
    : 'bg-gray-100 border-gray-300 text-gray-500'

  const portNum = extractPortNumber(port.interface.name, index + 1)

  const tooltipLines = [
    `Porta ${portNum}`,
    port.interface.label ? port.interface.label : null,
    port.interface.room_destination ? `Stanza: ${port.interface.room_destination}` : null,
    hasLink
      ? `Collegata a: ${port.linked_interface!.device_name ?? '?'} → ${port.linked_interface!.name}`
      : null,
  ].filter(Boolean).join('\n')

  return (
    <button
      onClick={() => onClick(port)}
      title={tooltipLines}
      className={clsx(
        'relative flex flex-col items-center justify-center border rounded text-xs font-medium transition-all hover:opacity-80 hover:shadow-sm',
        colorClass
      )}
      style={{ width: '40px', height: '40px' }}
    >
      <span className="text-xs font-bold">{portNum}</span>
      {port.interface.label && (
        <span
          className="text-xs opacity-80 truncate w-full text-center px-0.5 leading-tight"
          style={{ fontSize: '9px' }}
        >
          {port.interface.label}
        </span>
      )}
    </button>
  )
}

export default PortCell
