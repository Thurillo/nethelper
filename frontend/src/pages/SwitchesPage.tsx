import React, { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronUp, Edit2, Link, Network, Plus, Server } from 'lucide-react'
import { devicesApi } from '../api/devices'
import { switchesApi, type SwitchPortUpdateBody } from '../api/switches'
import { vlansApi } from '../api/vlans'
import LoadingSpinner from '../components/common/LoadingSpinner'
import EmptyState from '../components/common/EmptyState'
import QuickAddVendorModal from '../components/common/QuickAddVendorModal'
import { PortOptionGroups } from '../utils/portOptions'
import { QK } from '../utils/queryKeys'
import type { Device, SwitchPortDetail, DevicePortDetail } from '../types'

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
  const [label, setLabel] = useState('')
  const [description, setDescription] = useState('')
  const [adminUp, setAdminUp] = useState(true)
  const [vlanId, setVlanId] = useState('')
  const [speedMbps, setSpeedMbps] = useState('')
  const [linkMode, setLinkMode] = useState<'keep' | 'unlink' | 'new'>('keep')
  const [targetIfaceId, setTargetIfaceId] = useState<number | null>(null)
  const [targetDeviceId, setTargetDeviceId] = useState<number | ''>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: allDevices } = useQuery({
    queryKey: QK.devices.forLink(),
    queryFn: () => devicesApi.list({ size: 500, exclude_device_type: 'patch_panel' }),
    enabled: isOpen,
    staleTime: 60_000,
  })

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
      setTargetDeviceId('')
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

      onSaved()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Errore durante il salvataggio'
      setError(msg)
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
                {/* Step 1: pick device */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Dispositivo</label>
                  <select
                    value={targetDeviceId}
                    onChange={e => { setTargetDeviceId(e.target.value ? Number(e.target.value) : ''); setTargetIfaceId(null) }}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none bg-white"
                  >
                    <option value="">— seleziona dispositivo —</option>
                    {(allDevices?.items ?? []).filter(d => d.id !== deviceId).map(d => (
                      <option key={d.id} value={d.id}>
                        {d.notes || d.name}{d.primary_ip ? ` · ${d.primary_ip}` : ''}
                        {d.cabinet_name ? ` · ${d.cabinet_name}` : ''}
                      </option>
                    ))}
                  </select>
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

  if (isLoading) return <div className="py-6 flex justify-center"><LoadingSpinner /></div>
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

const SwitchCard: React.FC<{ sw: Device; initialExpanded?: boolean }> = ({ sw, initialExpanded = false }) => {
  const [expanded, setExpanded] = useState(initialExpanded)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (initialExpanded && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [initialExpanded])

  return (
    <div ref={cardRef} className={`bg-white rounded-xl border transition-all ${
      expanded ? 'border-primary-300 shadow-sm col-span-full' : 'border-gray-200 hover:border-primary-200 hover:shadow-sm'
    }`}>
      <button
        onClick={() => setExpanded(prev => !prev)}
        className="w-full text-left p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`p-2 rounded-lg flex-shrink-0 ${expanded ? 'bg-primary-100' : 'bg-gray-100'}`}>
              <Network size={18} className={expanded ? 'text-primary-600' : 'text-gray-500'} />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-gray-900 truncate">{sw.name}</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {sw.cabinet_name ?? '—'}
                {sw.model && <span className="ml-2 text-gray-400">{sw.model}</span>}
                {sw.primary_ip && <span className="ml-2 font-mono text-gray-400">{sw.primary_ip}</span>}
              </p>
            </div>
          </div>
          <div className={`flex-shrink-0 transition-colors ${expanded ? 'text-primary-500' : 'text-gray-400'}`}>
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5">
          <SwitchExpanded deviceId={sw.id} />
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

const SwitchesPage: React.FC = () => {
  const [vendorModalOpen, setVendorModalOpen] = useState(false)
  const [vendorAdded, setVendorAdded] = useState<string | null>(null)
  const [cabinetFilter, setCabinetFilter] = useState<string>('')
  const [searchParams] = useSearchParams()
  const expandId = searchParams.get('expand') ? Number(searchParams.get('expand')) : null

  const { data, isLoading } = useQuery({
    queryKey: QK.devices.switches(),
    queryFn: () => devicesApi.list({ device_type: 'switch', page: 1, size: 500 }),
    staleTime: 30_000,
  })

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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Switch</h1>
          <p className="text-sm text-gray-500 mt-1">
            {data ? `${data.total} switch in ${groups.length} armadi` : 'Gestisci le porte degli switch'}
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
            <Plus size={14} />
            Aggiungi vendor
          </button>
        </div>
      </div>

      <QuickAddVendorModal
        isOpen={vendorModalOpen}
        onClose={() => setVendorModalOpen(false)}
        onCreated={(name) => setVendorAdded(name)}
      />

      {isLoading ? (
        <LoadingSpinner centered />
      ) : data?.items.length === 0 ? (
        <EmptyState
          icon={<Network size={48} />}
          title="Nessuno switch"
          description="Aggiungi dispositivi di tipo 'Switch' per gestirli qui."
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
                  <SwitchCard key={sw.id} sw={sw} initialExpanded={sw.id === expandId} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default SwitchesPage
