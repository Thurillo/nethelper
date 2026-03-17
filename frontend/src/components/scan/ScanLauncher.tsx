import React, { useState } from 'react'
import { Play } from 'lucide-react'
import { useDevices } from '../../hooks/useDevices'
import { useStartScan } from '../../hooks/useScanJobs'
import type { ScanType } from '../../types'

const SCAN_TYPES: { value: ScanType; label: string; description: string }[] = [
  { value: 'snmp_full', label: 'SNMP Completo', description: 'Interfacce, ARP, MAC, LLDP' },
  { value: 'snmp_arp', label: 'SNMP ARP', description: 'Solo tabella ARP' },
  { value: 'snmp_mac', label: 'SNMP MAC', description: 'Solo tabella MAC' },
  { value: 'snmp_lldp', label: 'SNMP LLDP', description: 'Solo neighbor LLDP' },
  { value: 'ssh_full', label: 'SSH Completo', description: 'Completo via SSH' },
]

interface ScanLauncherProps {
  preselectedDeviceId?: number
  onScanStarted?: (jobId: number) => void
}

const ScanLauncher: React.FC<ScanLauncherProps> = ({ preselectedDeviceId, onScanStarted }) => {
  const [deviceId, setDeviceId] = useState<number | ''>(preselectedDeviceId ?? '')
  const [scanType, setScanType] = useState<ScanType>('snmp_full')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const { data: devicesData } = useDevices({ size: 200 })
  const startScan = useStartScan()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!deviceId) {
      setError('Seleziona un dispositivo')
      return
    }
    setError(null)
    setSuccess(false)
    try {
      const job = await startScan.mutateAsync({ deviceId: deviceId as number, scanType })
      setSuccess(true)
      onScanStarted?.(job.id)
    } catch {
      setError('Errore durante l\'avvio della scansione')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <h3 className="font-semibold text-gray-900">Avvia scansione dispositivo</h3>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
      {success && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">Scansione avviata con successo!</p>}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Dispositivo</label>
        <select
          value={deviceId}
          onChange={(e) => setDeviceId(e.target.value ? Number(e.target.value) : '')}
          disabled={!!preselectedDeviceId}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100"
        >
          <option value="">-- Seleziona dispositivo --</option>
          {devicesData?.items
            .filter((d) => ['switch', 'router', 'firewall', 'server'].includes(d.device_type))
            .map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.primary_ip ?? 'no IP'})
              </option>
            ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Tipo di scansione</label>
        <div className="space-y-2">
          {SCAN_TYPES.map((st) => (
            <label key={st.value} className="flex items-start gap-3 cursor-pointer group">
              <input
                type="radio"
                name="scan-type"
                value={st.value}
                checked={scanType === st.value}
                onChange={() => setScanType(st.value)}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">{st.label}</p>
                <p className="text-xs text-gray-500">{st.description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={startScan.isPending}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50"
      >
        <Play size={16} />
        {startScan.isPending ? 'Avvio...' : 'Avvia Scansione'}
      </button>
    </form>
  )
}

export default ScanLauncher
