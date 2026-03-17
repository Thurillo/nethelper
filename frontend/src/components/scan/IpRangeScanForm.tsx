import React, { useState } from 'react'
import { Play } from 'lucide-react'
import { useStartIpRangeScan } from '../../hooks/useScanJobs'

const COMMON_PORTS = [22, 80, 443, 8080, 8443, 3389, 5900]

interface IpRangeScanFormProps {
  onScanStarted?: (jobId: number) => void
}

const IpRangeScanForm: React.FC<IpRangeScanFormProps> = ({ onScanStarted }) => {
  const [ipStart, setIpStart] = useState('')
  const [ipEnd, setIpEnd] = useState('')
  const [selectedPorts, setSelectedPorts] = useState<Set<number>>(new Set([22, 80, 443]))
  const [timeout, setTimeout] = useState(500)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const startScan = useStartIpRangeScan()

  const togglePort = (port: number) => {
    setSelectedPorts((prev) => {
      const next = new Set(prev)
      if (next.has(port)) next.delete(port)
      else next.add(port)
      return next
    })
  }

  const estimateIpCount = (): number | null => {
    const parts = (ip: string) => ip.split('.').map(Number)
    try {
      const startParts = parts(ipStart)
      const endParts = parts(ipEnd)
      if (startParts.length !== 4 || endParts.length !== 4) return null
      const startNum = (startParts[0] << 24) | (startParts[1] << 16) | (startParts[2] << 8) | startParts[3]
      const endNum = (endParts[0] << 24) | (endParts[1] << 16) | (endParts[2] << 8) | endParts[3]
      return endNum - startNum + 1
    } catch {
      return null
    }
  }

  const ipCount = estimateIpCount()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    if (!ipStart || !ipEnd) {
      setError('Inserisci IP iniziale e finale')
      return
    }
    if (ipCount !== null && ipCount <= 0) {
      setError("L'IP iniziale deve essere minore dell'IP finale")
      return
    }
    if (ipCount !== null && ipCount > 65536) {
      setError('Intervallo troppo grande (max 65536 indirizzi)')
      return
    }
    try {
      const job = await startScan.mutateAsync({
        ip_start: ipStart,
        ip_end: ipEnd,
        ports: Array.from(selectedPorts),
        timeout_ms: timeout,
      })
      setSuccess(true)
      onScanStarted?.(job.id)
    } catch {
      setError("Errore durante l'avvio della scansione")
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <h3 className="font-semibold text-gray-900">Scansione intervallo IP</h3>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
      {success && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">Scansione avviata con successo!</p>}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">IP iniziale</label>
          <input
            type="text"
            value={ipStart}
            onChange={(e) => setIpStart(e.target.value)}
            placeholder="es. 192.168.1.1"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">IP finale</label>
          <input
            type="text"
            value={ipEnd}
            onChange={(e) => setIpEnd(e.target.value)}
            placeholder="es. 192.168.1.254"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono"
          />
        </div>
      </div>

      {ipCount !== null && ipCount > 0 && (
        <p className="text-xs text-blue-600 bg-blue-50 rounded px-3 py-1.5">
          Stima: <strong>{ipCount}</strong> indirizzi IP da scansionare
        </p>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Porte da controllare</label>
        <div className="flex flex-wrap gap-2">
          {COMMON_PORTS.map((port) => (
            <label key={port} className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedPorts.has(port)}
                onChange={() => togglePort(port)}
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-700 font-mono">{port}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Timeout per host (ms)
        </label>
        <input
          type="number"
          min={100}
          max={10000}
          value={timeout}
          onChange={(e) => setTimeout(Number(e.target.value))}
          className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      <button
        type="submit"
        disabled={startScan.isPending}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50"
      >
        <Play size={16} />
        {startScan.isPending ? 'Avvio...' : 'Avvia Scansione Range'}
      </button>
    </form>
  )
}

export default IpRangeScanForm
