import React, { useState, useEffect } from 'react'
import Modal from '../common/Modal'
import { useDevices } from '../../hooks/useDevices'
import { useUpdateDevice } from '../../hooks/useDevices'
import { useQueryClient } from '@tanstack/react-query'

interface DevicePlacementModalProps {
  isOpen: boolean
  onClose: () => void
  cabinetId: number
  suggestedU?: number
  freeSlots: number[]
  /** When provided, skips device selector and pre-fills u_position / u_height */
  preselectedDeviceId?: number
  preselectedDeviceName?: string
  preselectedDeviceUPosition?: number
  preselectedDeviceUHeight?: number
}

const DevicePlacementModal: React.FC<DevicePlacementModalProps> = ({
  isOpen,
  onClose,
  cabinetId,
  suggestedU,
  freeSlots,
  preselectedDeviceId,
  preselectedDeviceName,
  preselectedDeviceUPosition,
  preselectedDeviceUHeight,
}) => {
  const [deviceId, setDeviceId] = useState<number | ''>('')
  const [uPosition, setUPosition] = useState<number>(suggestedU ?? 1)
  const [uHeight, setUHeight] = useState<number>(1)
  const [error, setError] = useState<string | null>(null)

  const isEditing = !!preselectedDeviceId
  const { data: devicesData } = useDevices({ size: 200 })
  const updateDevice = useUpdateDevice()
  const qc = useQueryClient()

  // Sync preselected values when they change or modal opens
  useEffect(() => {
    if (isOpen) {
      if (preselectedDeviceId) {
        setDeviceId(preselectedDeviceId)
        setUPosition(preselectedDeviceUPosition ?? 1)
        setUHeight(preselectedDeviceUHeight ?? 1)
      } else {
        setDeviceId('')
        setUPosition(suggestedU ?? 1)
        setUHeight(1)
      }
      setError(null)
    }
  }, [isOpen, preselectedDeviceId, preselectedDeviceUPosition, preselectedDeviceUHeight, suggestedU])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!deviceId) {
      setError('Seleziona un dispositivo')
      return
    }

    // For new placements, validate that all required U positions are free
    if (!isEditing) {
      if (!freeSlots.includes(uPosition)) {
        setError(`La posizione U${uPosition} non è disponibile`)
        return
      }
      for (let i = 0; i < uHeight; i++) {
        if (!freeSlots.includes(uPosition + i)) {
          setError(`Non ci sono ${uHeight}U libere a partire da U${uPosition}`)
          return
        }
      }
    }

    try {
      await updateDevice.mutateAsync({
        id: deviceId as number,
        data: { cabinet_id: cabinetId, u_position: uPosition, u_height: uHeight },
      })
      qc.invalidateQueries({ queryKey: ['cabinets', cabinetId, 'rack-diagram'] })
      onClose()
    } catch {
      setError('Errore durante il salvataggio')
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? `Modifica posizione — ${preselectedDeviceName ?? ''}` : 'Posiziona dispositivo in armadio'}
      size="md"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Annulla
          </button>
          <button
            type="submit"
            form="placement-form"
            disabled={updateDevice.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {updateDevice.isPending ? 'Salvataggio...' : isEditing ? 'Sposta' : 'Posiziona'}
          </button>
        </>
      }
    >
      <form id="placement-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}

        {/* Device selector — only shown when NOT editing an existing device */}
        {!isEditing && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dispositivo</label>
            <select
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value ? Number(e.target.value) : '')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">-- Seleziona dispositivo --</option>
              {devicesData?.items.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.device_type.replace('_', ' ')})
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Posizione U</label>
          <select
            value={uPosition}
            onChange={(e) => setUPosition(Number(e.target.value))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {freeSlots.map((u) => (
              <option key={u} value={u}>
                U{u}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Altezza (U)</label>
          <input
            type="number"
            min={1}
            max={42}
            value={uHeight}
            onChange={(e) => setUHeight(Number(e.target.value))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </form>
    </Modal>
  )
}

export default DevicePlacementModal
