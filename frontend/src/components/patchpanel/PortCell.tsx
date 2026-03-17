import React from 'react'
import { clsx } from 'clsx'
import type { PatchPanelPort } from '../../types'

interface PortCellProps {
  port: PatchPanelPort
  onClick: (port: PatchPanelPort) => void
}

const PortCell: React.FC<PortCellProps> = ({ port, onClick }) => {
  const hasLink = !!port.linked_interface_id
  const hasRoom = !!port.room_destination

  const colorClass = hasLink
    ? 'bg-green-500 border-green-600 text-white'
    : hasRoom
    ? 'bg-yellow-400 border-yellow-500 text-gray-900'
    : 'bg-gray-100 border-gray-300 text-gray-500'

  return (
    <button
      onClick={() => onClick(port)}
      title={`Porta ${port.port_number}${port.label ? ` — ${port.label}` : ''}${port.room_destination ? `\nStanza: ${port.room_destination}` : ''}${hasLink ? '\nCollegata a switch' : ''}`}
      className={clsx(
        'relative flex flex-col items-center justify-center border rounded text-xs font-medium transition-all hover:opacity-80 hover:shadow-sm',
        colorClass
      )}
      style={{ width: '40px', height: '40px' }}
    >
      <span className="text-xs font-bold">{port.port_number}</span>
      {port.label && (
        <span className="text-xs opacity-80 truncate w-full text-center px-0.5 leading-tight" style={{ fontSize: '9px' }}>
          {port.label}
        </span>
      )}
    </button>
  )
}

export default PortCell
