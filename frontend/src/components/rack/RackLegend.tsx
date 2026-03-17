import React from 'react'
import type { DeviceType } from '../../types'

const deviceTypes: { type: DeviceType; label: string; color: string }[] = [
  { type: 'switch', label: 'Switch', color: 'bg-blue-500' },
  { type: 'router', label: 'Router', color: 'bg-green-500' },
  { type: 'ap', label: 'Access Point', color: 'bg-purple-500' },
  { type: 'server', label: 'Server', color: 'bg-orange-500' },
  { type: 'patch_panel', label: 'Patch Panel', color: 'bg-gray-400' },
  { type: 'firewall', label: 'Firewall', color: 'bg-red-500' },
  { type: 'ups', label: 'UPS', color: 'bg-yellow-500' },
  { type: 'workstation', label: 'Workstation', color: 'bg-teal-500' },
  { type: 'other', label: 'Altro', color: 'bg-gray-500' },
]

const RackLegend: React.FC = () => {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Legenda</h4>
      <div className="grid grid-cols-2 gap-2">
        {deviceTypes.map(({ type, label, color }) => (
          <div key={type} className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-sm flex-shrink-0 ${color}`} />
            <span className="text-xs text-gray-600">{label}</span>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm flex-shrink-0 bg-gray-100 border border-gray-300" />
          <span className="text-xs text-gray-600">Libero</span>
        </div>
      </div>
    </div>
  )
}

export default RackLegend
