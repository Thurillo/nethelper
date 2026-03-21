import React from 'react'
import type { Cabinet, RackDiagramSlot, RackDiagramDevice } from '../../types'
import DeviceBlock from './DeviceBlock'

const SLOT_HEIGHT = 28

interface RackDiagramProps {
  cabinet: Cabinet
  slots: RackDiagramSlot[]
  onSlotClick?: (u: number) => void
  onDeviceClick?: (device: RackDiagramDevice) => void
  selectedDeviceId?: number
}

const RackDiagram: React.FC<RackDiagramProps> = ({ cabinet, slots, onSlotClick, onDeviceClick, selectedDeviceId }) => {
  const uCount = cabinet.u_count || 42

  // Build a map: u_position -> slot
  const slotMap = new Map<number, RackDiagramSlot>()
  slots.forEach((s) => slotMap.set(s.u_position, s))

  // Build rows, skipping u positions covered by multi-U devices
  const rows: React.ReactNode[] = []
  let u = 1
  while (u <= uCount) {
    const slot = slotMap.get(u)
    if (slot?.device) {
      const device = slot.device
      const uHeight = device.u_height || 1
      rows.push(
        <div key={u} className="flex items-stretch gap-1" style={{ minHeight: `${uHeight * SLOT_HEIGHT}px` }}>
          {/* U number column */}
          <div
            className="flex items-start justify-end text-xs text-gray-400 font-mono pr-1 pt-1 flex-shrink-0"
            style={{ width: '28px', minHeight: `${uHeight * SLOT_HEIGHT}px` }}
          >
            {u}
          </div>
          {/* Device block */}
          <div className="flex-1">
            <DeviceBlock
              device={device}
              uHeight={uHeight}
              onClick={() => onDeviceClick?.(device)}
              isSelected={device.id === selectedDeviceId}
            />
          </div>
        </div>
      )
      u += uHeight
    } else {
      rows.push(
        <div
          key={u}
          className="flex items-center gap-1 cursor-pointer group"
          style={{ height: `${SLOT_HEIGHT}px` }}
          onClick={() => onSlotClick?.(u)}
        >
          <div
            className="flex items-center justify-end text-xs text-gray-400 font-mono pr-1 flex-shrink-0"
            style={{ width: '28px' }}
          >
            {u}
          </div>
          <div className="flex-1 h-full bg-gray-50 border border-dashed border-gray-200 rounded group-hover:bg-gray-100 group-hover:border-gray-300 transition-colors flex items-center px-2">
            <span className="text-xs text-gray-300 group-hover:text-gray-400">1U libera</span>
          </div>
        </div>
      )
      u += 1
    }
  }

  return (
    <div className="inline-block">
      {/* Header */}
      <div
        className="flex items-center gap-1 bg-gray-800 text-white text-xs font-semibold rounded-t-lg px-2 py-1.5"
        style={{ minWidth: '320px' }}
      >
        <span className="w-7 text-right text-gray-400">U</span>
        <span className="flex-1 ml-1">{cabinet.name} — {uCount}U</span>
      </div>

      {/* Rack body */}
      <div
        className="bg-gray-700 border-x-4 border-b-4 border-gray-800 rounded-b-lg p-1 flex flex-col gap-0.5"
        style={{ minWidth: '320px' }}
      >
        {rows}
      </div>
    </div>
  )
}

export default RackDiagram
