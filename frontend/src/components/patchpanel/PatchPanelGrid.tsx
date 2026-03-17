import React, { useState } from 'react'
import PortCell from './PortCell'
import PortEditModal from './PortEditModal'
import type { PatchPanelPort } from '../../types'

interface PatchPanelGridProps {
  deviceId: number
  ports: PatchPanelPort[]
  onRefresh: () => void
}

const PatchPanelGrid: React.FC<PatchPanelGridProps> = ({ deviceId, ports, onRefresh }) => {
  const [editingPort, setEditingPort] = useState<PatchPanelPort | null>(null)

  const portCount = ports.length || 24
  const colsPerRow = portCount <= 24 ? 12 : 24

  // Split into rows of colsPerRow
  const rows: PatchPanelPort[][] = []
  for (let i = 0; i < ports.length; i += colsPerRow) {
    rows.push(ports.slice(i, i + colsPerRow))
  }

  return (
    <div>
      {/* Legend */}
      <div className="flex items-center gap-6 mb-4">
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded bg-green-500 border border-green-600" />
          <span className="text-xs text-gray-600">Collegato a switch</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded bg-yellow-400 border border-yellow-500" />
          <span className="text-xs text-gray-600">Solo stanza</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded bg-gray-100 border border-gray-300" />
          <span className="text-xs text-gray-600">Libero</span>
        </div>
      </div>

      {/* Grid */}
      <div className="bg-gray-800 rounded-xl p-4 inline-block">
        {rows.map((row, rowIdx) => (
          <div key={rowIdx} className="flex gap-1 mb-1 last:mb-0">
            {row.map((port) => (
              <PortCell key={port.id} port={port} onClick={setEditingPort} />
            ))}
          </div>
        ))}
        {ports.length === 0 && (
          <p className="text-gray-400 text-sm">Nessuna porta disponibile</p>
        )}
      </div>

      <PortEditModal
        isOpen={!!editingPort}
        onClose={() => setEditingPort(null)}
        port={editingPort}
        deviceId={deviceId}
        onSaved={onRefresh}
      />
    </div>
  )
}

export default PatchPanelGrid
