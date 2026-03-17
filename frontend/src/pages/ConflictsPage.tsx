import React, { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useUiStore } from '../store/uiStore'
import { useConflicts } from '../hooks/useConflicts'
import ConflictReviewTable from '../components/conflicts/ConflictReviewTable'
import Modal from '../components/common/Modal'
import { useCabinets } from '../hooks/useCabinets'
import { useUpdateDevice } from '../hooks/useDevices'
import type { ConflictStatus, ScanConflict } from '../types'

const ConflictsPage: React.FC = () => {
  const pendingConflicts = useUiStore((s) => s.pendingConflicts)
  const [activeTab, setActiveTab] = useState<ConflictStatus>('pending')
  const [confirmSwitchConflict, setConfirmSwitchConflict] = useState<ScanConflict | null>(null)
  const [selectedCabinetId, setSelectedCabinetId] = useState<number | ''>('')
  const [uPosition, setUPosition] = useState(1)

  const { data: unmanagedData } = useConflicts({
    conflict_type: 'suspected_unmanaged_switch',
    status: 'pending',
    size: 5,
  })

  const { data: cabinetsData } = useCabinets()
  const updateDevice = useUpdateDevice()

  const handleConfirmSwitch = async () => {
    if (!confirmSwitchConflict?.device_id) return
    await updateDevice.mutateAsync({
      id: confirmSwitchConflict.device_id,
      data: {
        device_type: 'switch',
        cabinet_id: selectedCabinetId ? Number(selectedCabinetId) : undefined,
        u_position: uPosition,
      },
    })
    setConfirmSwitchConflict(null)
  }

  const tabs: { key: ConflictStatus; label: string }[] = [
    { key: 'pending', label: 'In attesa' },
    { key: 'accepted', label: 'Accettati' },
    { key: 'rejected', label: 'Rifiutati' },
    { key: 'ignored', label: 'Ignorati' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Conflitti</h1>
          {pendingConflicts > 0 && (
            <span className="bg-orange-500 text-white text-sm font-bold rounded-full px-3 py-0.5">
              {pendingConflicts}
            </span>
          )}
        </div>
      </div>

      {/* Suspected unmanaged switches banner */}
      {unmanagedData && unmanagedData.items.length > 0 && (
        <div className="bg-orange-50 border border-orange-300 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="text-orange-500" size={18} />
            <p className="font-semibold text-orange-800">
              {unmanagedData.items.length} switch non gesit{unmanagedData.items.length === 1 ? 'o' : 'i'} sospetto{unmanagedData.items.length !== 1 ? 'i' : ''} rilevat{unmanagedData.items.length === 1 ? 'o' : 'i'}
            </p>
          </div>
          <div className="space-y-2">
            {unmanagedData.items.map((c) => (
              <div key={c.id} className="flex items-center gap-3 bg-white rounded-lg p-3 border border-orange-200">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{c.detected_value ?? 'IP sconosciuto'}</p>
                  <p className="text-xs text-gray-500">{c.description}</p>
                </div>
                <button
                  onClick={() => setConfirmSwitchConflict(c)}
                  className="px-3 py-1.5 bg-orange-500 text-white text-xs font-medium rounded-lg hover:bg-orange-600"
                >
                  Conferma come Switch
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-0">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-primary-600 text-primary-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <ConflictReviewTable defaultStatus={activeTab} />

      {/* Confirm switch modal */}
      <Modal
        isOpen={!!confirmSwitchConflict}
        onClose={() => setConfirmSwitchConflict(null)}
        title="Conferma switch non gestito"
        size="md"
        footer={
          <>
            <button onClick={() => setConfirmSwitchConflict(null)} className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Annulla</button>
            <button onClick={handleConfirmSwitch} disabled={updateDevice.isPending} className="px-4 py-2 text-sm text-white bg-orange-500 rounded-lg hover:bg-orange-600 disabled:opacity-50">
              {updateDevice.isPending ? 'Salvataggio...' : 'Conferma switch'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Questo dispositivo verrà registrato come switch nell'inventario.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Assegna ad armadio (opzionale)</label>
            <select
              value={selectedCabinetId}
              onChange={(e) => setSelectedCabinetId(e.target.value ? Number(e.target.value) : '')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">-- Nessun armadio --</option>
              {cabinetsData?.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {selectedCabinetId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Posizione U</label>
              <input type="number" min={1} max={42} value={uPosition} onChange={(e) => setUPosition(Number(e.target.value))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}

export default ConflictsPage
