import React, { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronUp, Edit2, Link, Network, Plus, Server, Trash2, Wifi, WifiOff } from 'lucide-react'
import { devicesApi } from '../api/devices'
import { switchesApi, type SwitchPortUpdateBody } from '../api/switches'
import { vlansApi } from '../api/vlans'
import { cabinetsApi } from '../api/cabinets'
import { vendorsApi } from '../api/vendors'
import LoadingSpinner from '../components/common/LoadingSpinner'
import EmptyState from '../components/common/EmptyState'
import Modal from '../components/common/Modal'
import ConfirmDialog from '../components/common/ConfirmDialog'
import QuickAddVendorModal from '../components/common/QuickAddVendorModal'
import { PortOptionGroups } from '../utils/portOptions'
import { QK } from '../utils/queryKeys'
import DeviceCombobox from '../components/common/DeviceCombobox'
import { useAuthStore } from '../store/authStore'
import { useUiStore } from '../store/uiStore'
import type { Device, DeviceCreate, SwitchPortDetail, DevicePortDetail } from '../types'

// ─── Port dot ────────────────────────────────────────────────────────────────

const SwitchPortDot: React.FC<{
  port: SwitchPortDetail
  selected: boolean
  onClick: () => void
}> = ({ port, selected, onClick }) => {
  const iface = port.interface
  const isConnected = port.linked_interface !== null
  const isDisabled = iface.admin_up === false

  const bg = isDisabled
    ? 'bg-red-100 border-red-200 text-red-300'
    : isConnected
    ? 'bg-green-500 border-green-600 text-white'
    : 'bg-gray-100 border-gray-300 text-gray-400'

  const label = iface.name.match(/(\d+)$/)?.[1] ?? iface.name.slice(0, 3)

  const tooltip = [
    iface.name,
    iface.label,
    isDisabled ? 'Disabilitata' : null,
    port.linked_interface ? `→ ${port.linked_interface.device_name} ${port.linked_interface.name}` : null,
  ].filter(Boolean).join(' | ')

  return (
    <button
      onClick={onClick}
      title={tooltip}
      className={`flex items-center justify-center border rounded text-[10px] font-bold transition-all hover:opacity-75 flex-shrink-0 ${bg} ${
        selected ? 'ring-2 ring-primary-500 ring-offset-1' : ''
      }`}
      style={{ width: 30, height: 30 }}
    >
      {label}
    </button>
  )
}

// ─── Port edit modal ──────────────────────────────────────────────────────────

const SwitchPortEditModal: React.FC<{
  isOpen: boolean
  onClose: () => void
  port: SwitchPortDetail | null
  deviceId: number
  onSaved: () => void
}> = ({ isOpen, onClose, port, deviceId, onSaved }) => {
  const { addToast } = useUiStore()
  const [label, setLabel] = useState('')
  const [description, setDescription] = useState('')
  const [adminUp, setAdminUp] = useState(true)
  const [vlanId, setVlanId] = useState('')
  const [speedMbps, setSpeedMbps] = useState('')
  const [linkMode, setLinkMode] = useState<'keep' | 'unlink' | 'new'>('keep')
  const [targetIfaceId, setTargetIfaceId] = useState<number | null>(null)
  const [targetDeviceId, setTargetDeviceId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: targetDevicePorts } = useQuery<DevicePortDetail[]>({
    queryKey: QK.devices.ports(targetDeviceId as number),
    queryFn: () => devicesApi.getPorts(targetDeviceId as number),
    enabled: isOpen && !!targetDeviceId,
    staleTime: 10_000,
  })

  const { data: vlans } = useQuery({
    queryKey: QK.vlans.all(),
    queryFn: () => vlansApi.list({ size: 500 }),
    enabled: isOpen,
    staleTime: 60_000,
  })

  React.useEffect(() => {
    if (port && isOpen) {
      setLabel(port.interface.label ?? '')
      setDescription(port.interface.description ?? '')
      setAdminUp(port.interface.admin_up !== false)
      setVlanId(port.interface.vlan_id != null ? String(port.interface.vlan_id) : '')
      setSpeedMbps(port.interface.speed_mbps != null ? String(port.interface.speed_mbps) : '')
      setLinkMode('keep')
      setTargetIfaceId(null)
      setTargetDeviceId(null)
      setError(null)
    }
  }, [port, isOpen])

  if (!isOpen || !port) return null

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const updateBody: SwitchPortUpdateBody = {
        label: label.trim() || null,
        description: description.trim() || null,
        admin_up: adminUp,
        vlan_id: vlanId ? parseInt(vlanId) : null,
        speed_mbps: speedMbps ? parseInt(speedMbps) : null,
      }
      await switchesApi.updatePort(deviceId, port.interface.id, updateBody)

      if (linkMode === 'unlink' && port.cable_id != null) {
        await switchesApi.unlinkPort(deviceId, port.interface.id)
      } else if (linkMode === 'new' && targetIfaceId != null) {
        if (port.cable_id != null) {
          await switchesApi.unlinkPort(deviceId, port.interface.id)
        }
        await switchesApi.linkPort(deviceId, port.interface.id, targetIfaceId)
      }

      addToast('Porta salvata', 'success')
      onSaved()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Errore durante il salvataggio'
      setError(msg)
      addToast(msg, 'error')
    } finally {
      setSaving(false)
    }
  }


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Modifica porta</h2>
            <p className="text-xs text-gray-500 mt-0.5">{port.interface.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          {/* Label */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Etichetta</label>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="es. Postazione 1"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Descrizione</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            />
          </div>

          {/* Toggle abilitazione porta */}
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={adminUp} onChange={e => setAdminUp(e.target.checked)}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
              <span className="text-sm text-gray-700">Abilitata</span>
            </label>
          </div>

          {/* VLAN + Speed */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">VLAN</label>
              <select
                value={vlanId}
                onChange={e => setVlanId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none bg-white"
              >
                <option value="">— nessuna —</option>
                {(vlans?.items ?? []).map(v => (
                  <option key={v.id} value={v.id}>
                    {v.vid} — {v.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Velocità (Mbps)</label>
              <input
                type="number"
                value={speedMbps}
                onChange={e => setSpeedMbps(e.target.value)}
                placeholder="—"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              />
            </div>
          </div>

          {/* Connection */}
          <div className="border border-gray-200 rounded-xl p-3 space-y-2">
            <p className="text-xs font-medium text-gray-600">Connessione</p>

            {port.linked_interface ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-full font-mono">
                  <Link size={10} />
                  {port.linked_interface.device_name} — {port.linked_interface.name}
                </span>
              </div>
            ) : (
              <p className="text-xs text-gray-400">Nessuna connessione</p>
            )}

            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setLinkMode('keep')}
                className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                  linkMode === 'keep' ? 'bg-primary-50 border-primary-300 text-primary-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                Mantieni
              </button>
              {port.linked_interface && (
                <button
                  onClick={() => setLinkMode('unlink')}
                  className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                    linkMode === 'unlink' ? 'bg-red-50 border-red-300 text-red-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  Rimuovi
                </button>
              )}
              <button
                onClick={() => setLinkMode('new')}
                className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                  linkMode === 'new' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                Cambia
              </button>
            </div>

            {linkMode === 'new' && (
              <div className="space-y-2 pt-1">
                {/* Step 1: pick device via combobox */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Dispositivo</label>
                  <DeviceCombobox
                    value={targetDeviceId}
                    onChange={(id) => { setTargetDeviceId(id); setTargetIfaceId(null) }}
                    excludeDeviceId={deviceId}
                    excludeDeviceType="patch_panel"
                    placeholder="Cerca dispositivo..."
                  />
                </div>
                {/* Step 2: pick interface */}
                {targetDeviceId && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Interfaccia</label>
                    <select
                      value={targetIfaceId ?? ''}
                      onChange={e => setTargetIfaceId(e.target.value ? parseInt(e.target.value) : null)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none bg-white"
                    >
                      <option value="">— seleziona interfaccia —</option>
                      <PortOptionGroups
                        ports={targetDevicePorts ?? []}
                        currentPortId={port.linked_interface?.id}
                      />
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Annulla
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Salvataggio...' : 'Salva'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Expanded switch content ──────────────────────────────────────────────────

const SwitchExpanded: React.FC<{
  deviceId: number
}> = ({ deviceId }) => {
  const queryClient = useQueryClient()
  const [selectedPortId, setSelectedPortId] = useState<number | null>(null)
  const [editingPort, setEditingPort] = useState<SwitchPortDetail | null>(null)

  const { data: ports, refetch, isLoading } = useQuery<SwitchPortDetail[]>({
    queryKey: ['switch-ports', deviceId],
    queryFn: () => switchesApi.getPorts(deviceId),
    staleTime: 30_000,
  })

  if (isLoading) return (
    <div className="border-t border-gray-100 pt-4 space-y-4 animate-pulse">
      {/* Stats skeleton */}
      <div className="flex items-center gap-4">
        {[60, 50, 55].map((w, i) => (
          <div key={i} className="h-3 bg-gray-200 rounded-full" style={{ width: w }} />
        ))}
      </div>
      {/* Port row skeleton */}
      <div className="bg-gray-800 rounded-xl p-3">
        <div className="flex gap-1 flex-wrap">
          {Array.from({ length: 24 }).map((_, i) => (
            <div key={i} className="w-7 h-7 rounded bg-gray-600 opacity-50" />
          ))}
        </div>
      </div>
      {/* Table skeleton */}
      <div className="space-y-1.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-9 bg-gray-100 rounded-lg" />
        ))}
      </div>
    </div>
  )
  if (!ports || ports.length === 0) return <p className="text-sm text-gray-400 py-4">Nessuna porta configurata.</p>

  const connectedCount = ports.filter(p => p.linked_interface !== null).length
  const disabledCount = ports.filter(p => p.interface.admin_up === false).length
  const freeCount = ports.length - connectedCount - disabledCount

  return (
    <div className="border-t border-gray-100 pt-4 space-y-4">
      {/* Stats */}
      <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-green-500 inline-block" />
          {connectedCount} connesse
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-gray-200 border border-gray-300 inline-block" />
          {freeCount} libere
        </span>
        {disabledCount > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-200 inline-block" />
            {disabledCount} disabilitate
          </span>
        )}
      </div>

      {/* Port row */}
      <div className="bg-gray-800 rounded-xl p-3 overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {ports.map(port => (
            <SwitchPortDot
              key={port.interface.id}
              port={port}
              selected={selectedPortId === port.interface.id}
              onClick={() => setSelectedPortId(prev => prev === port.interface.id ? null : port.interface.id)}
            />
          ))}
        </div>
      </div>

      {/* Port table */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 font-medium">
            <tr>
              <th className="text-left px-4 py-2.5 w-32">Porta</th>
              <th className="text-left px-4 py-2.5">Etichetta</th>
              <th className="text-left px-4 py-2.5 w-16">VLAN</th>
              <th className="text-left px-4 py-2.5 w-24">Velocità</th>
              <th className="text-left px-4 py-2.5">Connessa a</th>
              <th className="px-4 py-2.5 w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {ports.map(port => {
              const iface = port.interface
              const isSelected = selectedPortId === iface.id
              const isConnected = port.linked_interface !== null
              const isDisabled = iface.admin_up === false

              const badgeBg = isDisabled
                ? 'bg-red-100 border-red-200 text-red-400'
                : isConnected
                ? 'bg-green-500 border-green-600 text-white'
                : 'bg-gray-100 border-gray-300 text-gray-500'

              return (
                <tr
                  key={iface.id}
                  onClick={() => setSelectedPortId(prev => prev === iface.id ? null : iface.id)}
                  className={`cursor-pointer transition-colors ${isSelected ? 'bg-primary-50' : 'hover:bg-gray-50'}`}
                >
                  {/* Porta */}
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center justify-center px-2 h-6 rounded text-xs font-mono border ${badgeBg}`}>
                      {iface.name}
                    </span>
                  </td>

                  {/* Etichetta */}
                  <td className="px-4 py-2.5 text-gray-700">
                    {iface.label ?? <span className="text-gray-300">—</span>}
                  </td>

                  {/* VLAN */}
                  <td className="px-4 py-2.5 text-gray-500 text-xs font-mono">
                    {iface.vlan_id ?? <span className="text-gray-300">—</span>}
                  </td>

                  {/* Velocità */}
                  <td className="px-4 py-2.5 text-gray-500 text-xs">
                    {iface.speed_mbps != null
                      ? iface.speed_mbps >= 1000
                        ? `${iface.speed_mbps / 1000}G`
                        : `${iface.speed_mbps}M`
                      : <span className="text-gray-300">—</span>}
                  </td>

                  {/* Connessa a */}
                  <td className="px-4 py-2.5">
                    {port.linked_interface ? (
                      <span className="inline-flex items-center gap-1.5 text-green-700 font-mono text-xs bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                        <Link size={10} />
                        {port.linked_interface.device_name ?? '?'} — {port.linked_interface.name}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>

                  {/* Modifica */}
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={e => { e.stopPropagation(); setEditingPort(port) }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-colors"
                    >
                      <Edit2 size={11} />
                      Modifica
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <SwitchPortEditModal
        isOpen={!!editingPort}
        onClose={() => setEditingPort(null)}
        port={editingPort}
        deviceId={deviceId}
        onSaved={() => {
          refetch()
          queryClient.invalidateQueries({ queryKey: ['switch-ports', deviceId] })
          queryClient.invalidateQueries({ queryKey: ['patch-panel-ports'] })
          queryClient.invalidateQueries({ queryKey: ['connections'] })
          queryClient.invalidateQueries({ queryKey: ['devices'] })
          setEditingPort(null)
        }}
      />
    </div>
  )
}

// ─── Switch card ──────────────────────────────────────────────────────────────

const SwitchCard: React.FC<{
  sw: Device
  initialExpanded?: boolean
  onEdit: (sw: Device) => void
  onDelete: (sw: Device) => void
}> = ({ sw, initialExpanded = false, onEdit, onDelete }) => {
  const { isAdmin } = useAuthStore()
  const [expanded, setExpanded] = useState(initialExpanded)
  const cardRef = useRef<HTMLDivElement>(null)
  const isUnmanaged = sw.device_type === 'unmanaged_switch'

  useEffect(() => {
    if (initialExpanded && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [initialExpanded])

  return (
    <div ref={cardRef} className={`bg-white rounded-xl border transition-all ${
      expanded ? 'border-primary-300 shadow-sm col-span-full' : 'border-gray-200 hover:border-primary-200 hover:shadow-sm'
    }`}>
      <div className="p-5">
        <div className="flex items-start gap-3">
          {/* Expand button */}
          <button
            onClick={() => setExpanded(prev => !prev)}
            className="flex items-center gap-3 min-w-0 flex-1 text-left"
          >
            <div className={`p-2 rounded-lg flex-shrink-0 ${expanded ? 'bg-primary-100' : 'bg-gray-100'}`}>
              {isUnmanaged
                ? <WifiOff size={18} className={expanded ? 'text-primary-600' : 'text-gray-400'} />
                : <Network size={18} className={expanded ? 'text-primary-600' : 'text-gray-500'} />
              }
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-gray-900 truncate">{sw.name}</h3>
                {isUnmanaged && (
                  <span className="text-[10px] font-medium text-gray-400 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded flex-shrink-0">
                    non gestito
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {sw.cabinet_name ?? '—'}
                {sw.model && <span className="ml-2 text-gray-400">{sw.model}</span>}
                {sw.primary_ip && <span className="ml-2 font-mono text-gray-400">{sw.primary_ip}</span>}
              </p>
            </div>
          </button>

          {/* Actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {isAdmin() && (
              <>
                <button
                  onClick={e => { e.stopPropagation(); onEdit(sw) }}
                  title="Modifica switch"
                  className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <Edit2 size={14} />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); onDelete(sw) }}
                  title="Elimina switch"
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </>
            )}
            <button
              onClick={() => setExpanded(prev => !prev)}
              className={`p-1.5 rounded-lg transition-colors ${expanded ? 'text-primary-500' : 'text-gray-400'}`}
            >
              {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-5 pb-5">
          {isUnmanaged ? (
            <div className="border-t border-gray-100 pt-4">
              <p className="text-sm text-gray-400 flex items-center gap-2">
                <WifiOff size={14} />
                Switch non gestito — il port management SNMP non è disponibile.
              </p>
            </div>
          ) : (
            <SwitchExpanded deviceId={sw.id} />
          )}
        </div>
      )}
    </div>
  )
}

// ─── Cabinet group type ───────────────────────────────────────────────────────

interface CabinetGroup {
  cabinetId: number | null
  cabinetName: string | null
  switches: Device[]
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface SWForm {
  name: string
  device_type: 'switch' | 'unmanaged_switch'
  primary_ip: string
  port_count: number | ''
  cabinet_id: number | ''
  vendor_id: number | ''
  model: string
  notes: string
}

const emptySWForm: SWForm = {
  name: '', device_type: 'switch', primary_ip: '',
  port_count: '', cabinet_id: '', vendor_id: '', model: '', notes: '',
}

const SwitchesPage: React.FC = () => {
  const { isAdmin } = useAuthStore()
  const { addToast } = useUiStore()
  const qc = useQueryClient()

  const [vendorModalOpen, setVendorModalOpen] = useState(false)
  const [vendorAdded, setVendorAdded] = useState<string | null>(null)
  const [cabinetFilter, setCabinetFilter] = useState<string>('')
  const [searchParams] = useSearchParams()
  const expandId = searchParams.get('expand') ? Number(searchParams.get('expand')) : null

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingSW, setEditingSW] = useState<Device | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Device | null>(null)
  const [form, setForm] = useState<SWForm>(emptySWForm)
  const [formError, setFormError] = useState<string | null>(null)

  const { data: managed, isLoading: loadingManaged } = useQuery({
    queryKey: QK.devices.switches(),
    queryFn: () => devicesApi.list({ device_type: 'switch', page: 1, size: 500 }),
    staleTime: 30_000,
  })

  const { data: unmanaged, isLoading: loadingUnmanaged } = useQuery({
    queryKey: ['devices-unmanaged-switches'],
    queryFn: () => devicesApi.list({ device_type: 'unmanaged_switch', page: 1, size: 500 }),
    staleTime: 30_000,
  })

  const isLoading = loadingManaged || loadingUnmanaged
  const allItems = [...(managed?.items ?? []), ...(unmanaged?.items ?? [])]
  const totalCount = (managed?.total ?? 0) + (unmanaged?.total ?? 0)

  const { data: cabinetsData } = useQuery({
    queryKey: QK.cabinets.all(),
    queryFn: () => cabinetsApi.list({ size: 100 }),
    staleTime: 60_000,
    enabled: isModalOpen,
  })

  const { data: vendorsData } = useQuery({
    queryKey: QK.vendors.all(),
    queryFn: () => vendorsApi.list({ size: 100 }),
    staleTime: 60_000,
    enabled: isModalOpen,
  })

  const createMutation = useMutation({
    mutationFn: (f: SWForm) => devicesApi.create({
      name: f.name,
      device_type: f.device_type,
      status: 'active',
      primary_ip: f.primary_ip.trim() || null,
      port_count: f.port_count !== '' ? Number(f.port_count) : null,
      cabinet_id: f.cabinet_id !== '' ? Number(f.cabinet_id) : null,
      vendor_id: f.vendor_id !== '' ? Number(f.vendor_id) : null,
      model: f.model.trim() || null,
      notes: f.notes.trim() || null,
      management_ip: null, mac_address: null, serial_number: null, asset_tag: null,
      u_position: null, u_height: 1, os_version: null,
      snmp_community: null, snmp_version: 2, ssh_username: null, ssh_password: null, ssh_port: 22,
    } as DeviceCreate),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.devices.switches() })
      qc.invalidateQueries({ queryKey: ['devices-unmanaged-switches'] })
      qc.invalidateQueries({ queryKey: ['devices'] })
      addToast('Switch creato', 'success')
      closeModal()
    },
    onError: () => { setFormError('Errore durante la creazione'); addToast('Errore durante la creazione', 'error') },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, f }: { id: number; f: SWForm }) => devicesApi.update(id, {
      name: f.name,
      primary_ip: f.primary_ip.trim() || null,
      cabinet_id: f.cabinet_id !== '' ? Number(f.cabinet_id) : null,
      vendor_id: f.vendor_id !== '' ? Number(f.vendor_id) : null,
      model: f.model.trim() || null,
      notes: f.notes.trim() || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.devices.switches() })
      qc.invalidateQueries({ queryKey: ['devices-unmanaged-switches'] })
      qc.invalidateQueries({ queryKey: ['devices'] })
      addToast('Switch aggiornato', 'success')
      closeModal()
    },
    onError: () => { setFormError('Errore durante il salvataggio'); addToast('Errore durante il salvataggio', 'error') },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => devicesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.devices.switches() })
      qc.invalidateQueries({ queryKey: ['devices-unmanaged-switches'] })
      qc.invalidateQueries({ queryKey: ['devices'] })
      addToast('Switch eliminato', 'success')
      setDeleteTarget(null)
    },
    onError: () => addToast('Errore durante l\'eliminazione', 'error'),
  })

  const openCreate = () => {
    setEditingSW(null); setForm(emptySWForm); setFormError(null); setIsModalOpen(true)
  }
  const openEdit = (sw: Device) => {
    setEditingSW(sw)
    setForm({
      name: sw.name,
      device_type: sw.device_type as 'switch' | 'unmanaged_switch',
      primary_ip: sw.primary_ip ?? '',
      port_count: '',
      cabinet_id: sw.cabinet_id ?? '',
      vendor_id: sw.vendor_id ?? '',
      model: sw.model ?? '',
      notes: sw.notes ?? '',
    })
    setFormError(null); setIsModalOpen(true)
  }
  const closeModal = () => { setIsModalOpen(false); setEditingSW(null); setFormError(null) }

  const handleSubmit = () => {
    if (!form.name.trim()) { setFormError('Il nome è obbligatorio'); return }
    if (editingSW) updateMutation.mutate({ id: editingSW.id, f: form })
    else createMutation.mutate(form)
  }

  const data = { items: allItems, total: totalCount }

  // Group by cabinet
  const groups: CabinetGroup[] = []
  for (const sw of data?.items ?? []) {
    const existing = groups.find(g => g.cabinetId === (sw.cabinet_id ?? null))
    if (existing) {
      existing.switches.push(sw)
    } else {
      groups.push({ cabinetId: sw.cabinet_id ?? null, cabinetName: sw.cabinet_name ?? null, switches: [sw] })
    }
  }
  groups.sort((a, b) => {
    if (a.cabinetName === null) return 1
    if (b.cabinetName === null) return -1
    return a.cabinetName.localeCompare(b.cabinetName)
  })

  const visibleGroups = cabinetFilter
    ? groups.filter(g => String(g.cabinetId ?? 'none') === cabinetFilter)
    : groups

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Switch</h1>
          <p className="text-sm text-gray-500 mt-1">
            {!isLoading ? `${totalCount} switch in ${groups.length} armadi` : 'Gestisci le porte degli switch'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {vendorAdded && (
            <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-2.5 py-1.5 rounded-lg">
              ✓ Vendor "{vendorAdded}" aggiunto
            </span>
          )}
          <select
            value={cabinetFilter}
            onChange={e => setCabinetFilter(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Tutti gli armadi</option>
            {groups.map(g => (
              <option key={g.cabinetId ?? 'none'} value={String(g.cabinetId ?? 'none')}>
                {g.cabinetName ?? 'Senza armadio'} ({g.switches.length})
              </option>
            ))}
          </select>
          <button
            onClick={() => { setVendorAdded(null); setVendorModalOpen(true) }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-colors"
          >
            Aggiungi vendor
          </button>
          {isAdmin() && (
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
            >
              <Plus size={15} />
              Nuovo switch
            </button>
          )}
        </div>
      </div>

      <QuickAddVendorModal
        isOpen={vendorModalOpen}
        onClose={() => setVendorModalOpen(false)}
        onCreated={(name) => setVendorAdded(name)}
      />

      {isLoading ? (
        <LoadingSpinner centered />
      ) : allItems.length === 0 ? (
        <EmptyState
          icon={<Network size={48} />}
          title="Nessuno switch"
          description="Crea il primo switch per iniziare a gestirne le porte e le connessioni."
          action={isAdmin() ? { label: 'Nuovo switch', onClick: openCreate } : undefined}
        />
      ) : (
        <div className="space-y-8">
          {visibleGroups.map(group => (
            <div key={group.cabinetId ?? 'none'} className="space-y-3">
              <div className="flex items-center gap-2">
                <Server size={15} className="text-gray-400 flex-shrink-0" />
                <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
                  {group.cabinetName ?? 'Senza armadio'}
                </h2>
                <span className="text-xs text-gray-400">({group.switches.length})</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {group.switches.map(sw => (
                  <SwitchCard key={sw.id} sw={sw} initialExpanded={sw.id === expandId} onEdit={openEdit} onDelete={setDeleteTarget} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingSW ? `Modifica — ${editingSW.name}` : 'Nuovo switch'}
        size="md"
        footer={
          <>
            <button onClick={closeModal} className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
              Annulla
            </button>
            <button onClick={handleSubmit} disabled={isPending} className="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
              {isPending ? 'Salvataggio...' : 'Salva'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{formError}</p>
          )}

          {/* Tipo switch (solo creazione) */}
          {!editingSW && (
            <div className="flex gap-2">
              {([
                { value: 'switch', label: 'Gestito (SNMP/SSH)', icon: <Wifi size={14} /> },
                { value: 'unmanaged_switch', label: 'Non gestito', icon: <WifiOff size={14} /> },
              ] as const).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm(p => ({ ...p, device_type: opt.value }))}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg border transition-colors ${
                    form.device_type === opt.value
                      ? 'bg-primary-50 border-primary-400 text-primary-700'
                      : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {opt.icon}{opt.label}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Nome */}
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="es. SW-01"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                autoFocus
              />
            </div>

            {/* IP primario */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                IP primario
                {form.device_type === 'unmanaged_switch' && (
                  <span className="ml-1 text-xs text-gray-400">(opzionale)</span>
                )}
              </label>
              <input
                type="text"
                value={form.primary_ip}
                onChange={e => setForm(p => ({ ...p, primary_ip: e.target.value }))}
                placeholder="es. 192.168.1.10"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono"
              />
            </div>

            {/* Numero porte (solo creazione) */}
            {!editingSW && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Numero porte</label>
                <input
                  type="number"
                  min={1}
                  max={512}
                  value={form.port_count}
                  onChange={e => setForm(p => ({ ...p, port_count: e.target.value ? Number(e.target.value) : '' }))}
                  placeholder="es. 24"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <p className="text-xs text-gray-400 mt-1">Non modificabile dopo la creazione</p>
              </div>
            )}

            {/* Armadio */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Armadio</label>
              <select
                value={form.cabinet_id}
                onChange={e => setForm(p => ({ ...p, cabinet_id: e.target.value ? Number(e.target.value) : '' }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">— Nessun armadio —</option>
                {cabinetsData?.items.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* Vendor */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
              <select
                value={form.vendor_id}
                onChange={e => setForm(p => ({ ...p, vendor_id: e.target.value ? Number(e.target.value) : '' }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">— Nessun vendor —</option>
                {vendorsData?.items.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>

            {/* Modello */}
            <div className={editingSW ? '' : 'sm:col-span-2'}>
              <label className="block text-sm font-medium text-gray-700 mb-1">Modello</label>
              <input
                type="text"
                value={form.model}
                onChange={e => setForm(p => ({ ...p, model: e.target.value }))}
                placeholder="es. Cisco SG350-28"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            {/* Note */}
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
              <textarea
                value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              />
            </div>
          </div>
        </div>
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Elimina switch"
        message={`Sei sicuro di voler eliminare "${deleteTarget?.name}"? Tutti i cavi collegati alle sue porte verranno rimossi.`}
        confirmLabel="Elimina"
        variant="danger"
        isLoading={deleteMutation.isPending}
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id) }}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}

export default SwitchesPage
