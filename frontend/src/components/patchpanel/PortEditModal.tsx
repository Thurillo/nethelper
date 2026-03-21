import React, { useState, useEffect } from 'react'
import Modal from '../common/Modal'
import { patchPanelsApi } from '../../api/patchPanels'
import { useDevices } from '../../hooks/useDevices'
import { devicesApi } from '../../api/devices'
import type { PatchPortDetail, NetworkInterface } from '../../types'

interface PortEditModalProps {
  isOpen: boolean
  onClose: () => void
  port: PatchPortDetail | null
  deviceId: number
  onSaved: () => void
}

/** Estrae il numero porta dal nome (es. "port-5" → 5) */
function extractPortNumber(name: string): string {
  const m = name.match(/(\d+)$/)
  return m ? m[1] : name
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
      setLabel(port.interface.label ?? '')
      setRoomDestination(port.interface.room_destination ?? '')
      setNotes(port.interface.notes ?? '')
      setSelectedInterfaceId(port.linked_interface?.id ?? '')
      setSelectedSwitchId('')
      setSwitchInterfaces([])
    }
  }, [port])

  useEffect(() => {
    if (selectedSwitchId) {
      devicesApi.getInterfaces(selectedSwitchId as number)
        .then(setSwitchInterfaces)
        .catch(() => setSwitchInterfaces([]))
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
      const portId = port.interface.id

      // 1. Salva metadati (label, stanza, note)
      await patchPanelsApi.updatePort(deviceId, portId, {
        label: label || null,
        room_destination: roomDestination || null,
        notes: notes || null,
      })

      // 2. Gestione collegamento switch
      const newLinkId = selectedInterfaceId ? Number(selectedInterfaceId) : null
      const oldLinkId = port.linked_interface?.id ?? null

      if (newLinkId !== oldLinkId) {
        // Rimuove vecchio collegamento se esisteva
        if (oldLinkId && port.cable_id) {
          await patchPanelsApi.unlinkPort(deviceId, portId)
        }
        // Crea nuovo collegamento se selezionato
        if (newLinkId) {
          await patchPanelsApi.linkPort(deviceId, portId, newLinkId)
        }
      }

      onSaved()
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Errore durante il salvataggio'
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }

  const handleUnlink = async () => {
    if (!port || !port.cable_id) return
    setIsLoading(true)
    setError(null)
    try {
      await patchPanelsApi.unlinkPort(deviceId, port.interface.id)
      setSelectedInterfaceId('')
      onSaved()
      onClose()
    } catch {
      setError('Errore durante la rimozione del collegamento')
    } finally {
      setIsLoading(false)
    }
  }

  const portNum = port ? extractPortNumber(port.interface.name) : '—'
  const currentLinkLabel = port?.linked_interface
    ? `${port.linked_interface.device_name ?? '?'} → ${port.linked_interface.name}`
    : null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Modifica porta ${portNum}`}
      size="md"
      footer={
        <>
          {port?.linked_interface && (
            <button
              type="button"
              onClick={handleUnlink}
              disabled={isLoading}
              className="mr-auto px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-300 rounded-lg hover:bg-red-50 disabled:opacity-50"
            >
              Rimuovi collegamento
            </button>
          )}
          <button type="button" onClick={onClose} disabled={isLoading}
            className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
            Annulla
          </button>
          <button type="submit" form="port-edit-form" disabled={isLoading}
            className="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
            {isLoading ? 'Salvataggio...' : 'Salva'}
          </button>
        </>
      }
    >
      <form id="port-edit-form" onSubmit={handleSave} className="space-y-4">
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
        )}

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
          <label className="block text-sm font-medium text-gray-700 mb-1">Destinazione fisica</label>
          <input
            type="text"
            value={roomDestination}
            onChange={(e) => setRoomDestination(e.target.value)}
            placeholder="es. Ufficio A, Stanza 101, Piano 2"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <p className="text-xs text-gray-400 mt-1">Dove esce fisicamente questo cavo</p>
        </div>

        {/* Collegamento attuale */}
        {currentLinkLabel && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            <p className="text-xs text-gray-500 mb-0.5">Collegata a</p>
            <p className="text-sm font-medium text-green-800 font-mono">{currentLinkLabel}</p>
          </div>
        )}

        {/* Nuovo collegamento switch */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {currentLinkLabel ? 'Cambia collegamento switch' : 'Collega a switch'}
          </label>
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
