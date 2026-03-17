import React, { useState, useEffect } from 'react'
import Modal from '../common/Modal'
import { patchPanelsApi } from '../../api/patchPanels'
import { useDevices } from '../../hooks/useDevices'
import { devicesApi } from '../../api/devices'
import type { PatchPanelPort, NetworkInterface } from '../../types'

interface PortEditModalProps {
  isOpen: boolean
  onClose: () => void
  port: PatchPanelPort | null
  deviceId: number
  onSaved: () => void
}

const PortEditModal: React.FC<PortEditModalProps> = ({ isOpen, onClose, port, deviceId, onSaved }) => {
  const [label, setLabel] = useState('')
  const [roomDestination, setRoomDestination] = useState('')
  const [notes, setNotes] = useState('')
  const [selectedInterfaceId, setSelectedInterfaceId] = useState<number | ''>('')
  const [selectedSwitchId, setSelectedSwitchId] = useState<number | ''>('')
  const [switchInterfaces, setSwitchInterfaces] = useState<NetworkInterface[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: switchesData } = useDevices({ device_type: 'switch', size: 100 })

  useEffect(() => {
    if (port) {
      setLabel(port.label ?? '')
      setRoomDestination(port.room_destination ?? '')
      setNotes(port.notes ?? '')
      setSelectedInterfaceId(port.linked_interface_id ?? '')
    }
  }, [port])

  useEffect(() => {
    if (selectedSwitchId) {
      devicesApi.getInterfaces(selectedSwitchId as number).then(setSwitchInterfaces).catch(() => setSwitchInterfaces([]))
    } else {
      setSwitchInterfaces([])
    }
  }, [selectedSwitchId])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!port) return
    setIsLoading(true)
    setError(null)
    try {
      await patchPanelsApi.updatePort(deviceId, port.port_number, {
        label: label || null,
        room_destination: roomDestination || null,
        linked_interface_id: selectedInterfaceId ? Number(selectedInterfaceId) : null,
        notes: notes || null,
      })
      onSaved()
      onClose()
    } catch {
      setError('Errore durante il salvataggio')
    } finally {
      setIsLoading(false)
    }
  }

  const handleUnlink = async () => {
    if (!port) return
    setIsLoading(true)
    try {
      await patchPanelsApi.unlinkPort(deviceId, port.port_number)
      setSelectedInterfaceId('')
      onSaved()
      onClose()
    } catch {
      setError('Errore durante la rimozione del collegamento')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Modifica porta ${port?.port_number}`}
      size="md"
      footer={
        <>
          {port?.linked_interface_id && (
            <button
              type="button"
              onClick={handleUnlink}
              disabled={isLoading}
              className="mr-auto px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-300 rounded-lg hover:bg-red-50 disabled:opacity-50"
            >
              Rimuovi collegamento
            </button>
          )}
          <button type="button" onClick={onClose} disabled={isLoading} className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
            Annulla
          </button>
          <button type="submit" form="port-edit-form" disabled={isLoading} className="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
            {isLoading ? 'Salvataggio...' : 'Salva'}
          </button>
        </>
      }
    >
      <form id="port-edit-form" onSubmit={handleSave} className="space-y-4">
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Etichetta porta</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="es. Scrivania 101"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Stanza di destinazione</label>
          <input
            type="text"
            value={roomDestination}
            onChange={(e) => setRoomDestination(e.target.value)}
            placeholder="es. Stanza 101, Piano 2"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Collega a switch</label>
          <select
            value={selectedSwitchId}
            onChange={(e) => setSelectedSwitchId(e.target.value ? Number(e.target.value) : '')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">-- Seleziona switch --</option>
            {switchesData?.items.map((sw) => (
              <option key={sw.id} value={sw.id}>{sw.name}</option>
            ))}
          </select>
        </div>

        {switchInterfaces.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Porta dello switch</label>
            <select
              value={selectedInterfaceId}
              onChange={(e) => setSelectedInterfaceId(e.target.value ? Number(e.target.value) : '')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">-- Seleziona porta --</option>
              {switchInterfaces.map((iface) => (
                <option key={iface.id} value={iface.id}>
                  {iface.name}{iface.label ? ` (${iface.label})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
          />
        </div>
      </form>
    </Modal>
  )
}

export default PortEditModal
