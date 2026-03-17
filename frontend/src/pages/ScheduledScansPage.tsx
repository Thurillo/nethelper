import React, { useState } from 'react'
import { Plus, Clock, ToggleLeft, ToggleRight } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { scheduledScansApi } from '../api/scheduledScans'
import { useAuthStore } from '../store/authStore'
import { useDevices } from '../hooks/useDevices'
import Modal from '../components/common/Modal'
import LoadingSpinner from '../components/common/LoadingSpinner'
import EmptyState from '../components/common/EmptyState'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import type { ScheduledScanCreate, ScanType } from '../types'

const SCAN_TYPES: { value: ScanType; label: string }[] = [
  { value: 'snmp_full', label: 'SNMP Completo' },
  { value: 'snmp_arp', label: 'SNMP ARP' },
  { value: 'snmp_mac', label: 'SNMP MAC' },
  { value: 'snmp_lldp', label: 'SNMP LLDP' },
  { value: 'ssh_full', label: 'SSH Completo' },
]

const CRON_PRESETS = [
  { label: 'Ogni ora', value: '0 * * * *' },
  { label: 'Ogni 6 ore', value: '0 */6 * * *' },
  { label: 'Ogni giorno (00:00)', value: '0 0 * * *' },
  { label: 'Ogni giorno (02:00)', value: '0 2 * * *' },
  { label: 'Ogni settimana (domenica)', value: '0 2 * * 0' },
]

const ScheduledScansPage: React.FC = () => {
  const { isAdmin } = useAuthStore()
  const qc = useQueryClient()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [form, setForm] = useState<ScheduledScanCreate>({ device_id: 0, scan_type: 'snmp_full', cron_expression: '0 2 * * *', is_enabled: true })
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['scheduled-scans'],
    queryFn: () => scheduledScansApi.list({ size: 50 }),
    staleTime: 30_000,
  })

  const { data: devicesData } = useDevices({ size: 200 })

  const createScan = useMutation({
    mutationFn: (d: ScheduledScanCreate) => scheduledScansApi.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['scheduled-scans'] }); setIsModalOpen(false) },
    onError: () => setError('Errore durante il salvataggio'),
  })

  const toggleScan = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) => scheduledScansApi.toggle(id, enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduled-scans'] }),
  })

  const deleteScan = useMutation({
    mutationFn: (id: number) => scheduledScansApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduled-scans'] }),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.device_id || !form.cron_expression) { setError('Tutti i campi obbligatori'); return }
    createScan.mutate(form)
  }

  const SCAN_LABELS = Object.fromEntries(SCAN_TYPES.map((s) => [s.value, s.label]))

  if (isLoading) return <LoadingSpinner centered />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pianificazione scansioni</h1>
          <p className="text-sm text-gray-500 mt-1">Configura le scansioni automatiche</p>
        </div>
        {isAdmin() && (
          <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700">
            <Plus size={16} />Nuova pianificazione
          </button>
        )}
      </div>

      {data?.items.length === 0 ? (
        <EmptyState
          icon={<Clock size={48} />}
          title="Nessuna pianificazione"
          description="Configura scansioni automatiche per mantenere aggiornato l'inventario."
          action={isAdmin() ? { label: 'Nuova pianificazione', onClick: () => setIsModalOpen(true) } : undefined}
        />
      ) : (
        <div className="space-y-3">
          {data?.items.map((scan) => (
            <div key={scan.id} className={`bg-white rounded-xl border ${scan.is_enabled ? 'border-gray-200' : 'border-gray-100 opacity-70'} p-4`}>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-gray-900">{scan.device?.name ?? `Device #${scan.device_id}`}</span>
                    <span className="text-sm text-gray-500">—</span>
                    <span className="text-sm text-gray-600">{SCAN_LABELS[scan.scan_type] ?? scan.scan_type}</span>
                  </div>
                  <div className="flex items-center gap-4 mt-1">
                    <span className="text-xs text-gray-400 font-mono bg-gray-100 px-2 py-0.5 rounded">{scan.cron_expression}</span>
                    {scan.last_run_at && <span className="text-xs text-gray-400">Ultimo: {format(new Date(scan.last_run_at), 'dd/MM HH:mm', { locale: it })}</span>}
                    {scan.next_run_at && <span className="text-xs text-gray-400">Prossimo: {format(new Date(scan.next_run_at), 'dd/MM HH:mm', { locale: it })}</span>}
                  </div>
                </div>
                {isAdmin() && (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleScan.mutate({ id: scan.id, enabled: !scan.is_enabled })}
                      className={`text-2xl ${scan.is_enabled ? 'text-green-500' : 'text-gray-400'}`}
                      title={scan.is_enabled ? 'Disabilita' : 'Abilita'}
                    >
                      {scan.is_enabled ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                    </button>
                    <button
                      onClick={() => deleteScan.mutate(scan.id)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Elimina
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setError(null) }} title="Nuova pianificazione" size="md"
        footer={
          <>
            <button onClick={() => { setIsModalOpen(false); setError(null) }} className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Annulla</button>
            <button onClick={handleSubmit} disabled={createScan.isPending} className="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
              {createScan.isPending ? 'Salvataggio...' : 'Crea'}
            </button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dispositivo *</label>
            <select value={form.device_id} onChange={(e) => setForm((f) => ({ ...f, device_id: Number(e.target.value) }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value={0}>-- Seleziona --</option>
              {devicesData?.items.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo scansione *</label>
            <select value={form.scan_type} onChange={(e) => setForm((f) => ({ ...f, scan_type: e.target.value as ScanType }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              {SCAN_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Frequenza *</label>
            <div className="space-y-2 mb-2">
              {CRON_PRESETS.map((preset) => (
                <label key={preset.value} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="cron-preset" checked={form.cron_expression === preset.value} onChange={() => setForm((f) => ({ ...f, cron_expression: preset.value }))} />
                  <span className="text-sm text-gray-700">{preset.label}</span>
                  <span className="text-xs text-gray-400 font-mono">({preset.value})</span>
                </label>
              ))}
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="cron-preset" checked={!CRON_PRESETS.map((p) => p.value).includes(form.cron_expression)} onChange={() => setForm((f) => ({ ...f, cron_expression: '' }))} />
                <span className="text-sm text-gray-700">Personalizzato</span>
              </label>
            </div>
            <input type="text" value={form.cron_expression} onChange={(e) => setForm((f) => ({ ...f, cron_expression: e.target.value }))} placeholder="*/5 * * * *" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="enabled" checked={form.is_enabled} onChange={(e) => setForm((f) => ({ ...f, is_enabled: e.target.checked }))} className="rounded border-gray-300" />
            <label htmlFor="enabled" className="text-sm text-gray-700">Abilitata</label>
          </div>
        </form>
      </Modal>
    </div>
  )
}

export default ScheduledScansPage
