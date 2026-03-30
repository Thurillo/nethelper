import React, { useState } from 'react'
import { Play, Plus, X } from 'lucide-react'
import { useStartIpRangeScan } from '../../hooks/useScanJobs'

const COMMON_PORTS = [22, 80, 443, 8080]

interface IpRangeScanFormProps {
  onScanStarted?: (jobId: number) => void
}

const IpRangeScanForm: React.FC<IpRangeScanFormProps> = ({ onScanStarted }) => {
  const [ipStart, setIpStart] = useState('')
  const [ipEnd, setIpEnd] = useState('')
  const [selectedPorts, setSelectedPorts] = useState<Set<number>>(new Set([22, 80, 443]))
  const [customPortInput, setCustomPortInput] = useState('')
  const [portRangeFrom, setPortRangeFrom] = useState('')
  const [portRangeTo, setPortRangeTo] = useState('')
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

  const addCustomPort = () => {
    const p = parseInt(customPortInput)
    if (!isNaN(p) && p >= 1 && p <= 65535) {
      setSelectedPorts((prev) => new Set([...prev, p]))
      setCustomPortInput('')
    }
  }

  const addPortRange = () => {
    const from = parseInt(portRangeFrom)
    const to = parseInt(portRangeTo)
    if (!isNaN(from) && !isNaN(to) && from >= 1 && to <= 65535 && from <= to) {
      if (to - from > 999) {
        setError('Range porte troppo grande (max 1000 porte)')
        return
      }
      setSelectedPorts((prev) => {
        const next = new Set(prev)
        for (let p = from; p <= to; p++) next.add(p)
        return next
      })
      setPortRangeFrom('')
      setPortRangeTo('')
    }
  }

  const removePort = (port: number) => {
    setSelectedPorts((prev) => {
      const next = new Set(prev)
      next.delete(port)
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
  const sortedPorts = Array.from(selectedPorts).sort((a, b) => a - b)

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
        start_ip: ipStart,
        end_ip: ipEnd,
        ports: sortedPorts,
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700">Porte da controllare</label>

        {/* Preset checkboxes */}
        <div className="flex flex-wrap gap-3">
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

        {/* Custom single ports */}
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={65535}
            value={customPortInput}
            onChange={(e) => setCustomPortInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomPort() } }}
            placeholder="Porta personalizzata"
            className="w-44 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono"
          />
          <button
            type="button"
            onClick={addCustomPort}
            className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <Plus size={14} /> Aggiungi
          </button>
        </div>

        {/* Port range */}
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={65535}
            value={portRangeFrom}
            onChange={(e) => setPortRangeFrom(e.target.value)}
            placeholder="Da porta"
            className="w-28 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono"
          />
          <span className="text-gray-400 text-sm">—</span>
          <input
            type="number"
            min={1}
            max={65535}
            value={portRangeTo}
            onChange={(e) => setPortRangeTo(e.target.value)}
            placeholder="A porta"
            className="w-28 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono"
          />
          <button
            type="button"
            onClick={addPortRange}
            className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <Plus size={14} /> Aggiungi range
          </button>
        </div>

        {/* Selected ports tags */}
        {sortedPorts.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 p-2 bg-gray-50 rounded-lg border border-gray-200">
            {sortedPorts.map((port) => (
              <span key={port} className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-gray-300 rounded text-xs font-mono text-gray-700">
                {port}
                <button type="button" onClick={() => removePort(port)} className="text-gray-400 hover:text-red-500">
                  <X size={10} />
                </button>
              </span>
            ))}
            <span className="text-xs text-gray-400 self-center ml-1">{sortedPorts.length} porte</span>
          </div>
        ) : (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-1.5">
            Nessuna porta selezionata — modalità <strong>ping-only</strong>: verranno mostrati solo gli host che rispondono al ping ICMP.
          </p>
        )}
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
