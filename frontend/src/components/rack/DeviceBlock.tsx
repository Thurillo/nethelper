import React, { useState } from 'react'
import { clsx } from 'clsx'
import type { Device } from '../../types'

const SLOT_HEIGHT = 28

const deviceTypeColors: Record<string, string> = {
  switch: 'bg-blue-500 border-blue-600 text-white',
  router: 'bg-green-500 border-green-600 text-white',
  ap: 'bg-purple-500 border-purple-600 text-white',
  server: 'bg-orange-500 border-orange-600 text-white',
  patch_panel: 'bg-gray-400 border-gray-500 text-white',
  firewall: 'bg-red-500 border-red-600 text-white',
  ups: 'bg-yellow-500 border-yellow-600 text-gray-900',
  workstation: 'bg-teal-500 border-teal-600 text-white',
  printer: 'bg-pink-500 border-pink-600 text-white',
  camera: 'bg-indigo-500 border-indigo-600 text-white',
  phone: 'bg-teal-400 border-teal-500 text-white',
  other: 'bg-gray-500 border-gray-600 text-white',
}

interface DeviceBlockProps {
  device: Device
  uHeight: number
  onClick: () => void
}

const DeviceBlock: React.FC<DeviceBlockProps> = ({ device, uHeight, onClick }) => {
  const [showTooltip, setShowTooltip] = useState(false)
  const colorClass = deviceTypeColors[device.device_type] ?? deviceTypeColors.other
  const height = uHeight * SLOT_HEIGHT

  return (
    <div
      className={clsx(
        'relative border rounded cursor-pointer transition-opacity hover:opacity-90 px-2 flex flex-col justify-center overflow-hidden',
        colorClass
      )}
      style={{ height: `${height}px` }}
      onClick={onClick}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <p className="text-xs font-semibold truncate leading-tight">{device.name}</p>
      {uHeight > 1 && (
        <p className="text-xs opacity-80 truncate leading-tight">{device.model ?? device.device_type}</p>
      )}
      {device.primary_ip && uHeight > 1 && (
        <p className="text-xs opacity-70 truncate">{device.primary_ip}</p>
      )}

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute left-full top-0 ml-2 z-20 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg min-w-[180px] whitespace-nowrap pointer-events-none">
          <p className="font-semibold">{device.name}</p>
          {device.model && <p className="opacity-80">{device.model}</p>}
          {device.primary_ip && <p className="opacity-80">IP: {device.primary_ip}</p>}
          {device.serial_number && <p className="opacity-80">S/N: {device.serial_number}</p>}
          <p className="opacity-70 mt-1 capitalize">{device.device_type.replace('_', ' ')}</p>
        </div>
      )}
    </div>
  )
}

export default DeviceBlock
