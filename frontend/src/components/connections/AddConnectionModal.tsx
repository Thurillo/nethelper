import React, { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Modal from '../common/Modal'
import { devicesApi } from '../../api/devices'
import { interfacesApi } from '../../api/interfaces'
import { switchesApi } from '../../api/switches'
import { patchPanelsApi } from '../../api/patchPanels'
import { cablesApi } from '../../api/cables'
import type { ConnectionPath } from '../../api/connections'

type Mode = 'direct' | 'via_pp'

interface Props {
  isOpen: boolean
  onClose: () => void
  /** Pre-fill from an existing connection (edit mode) */
  editing?: ConnectionPath | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sel = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white disabled:bg-gray-50 disabled:text-gray-400'
const lbl = 'block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide'

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mt-4 mb-2">
      <span className="text-xs font-bold uppercase tracking-widest text-primary-600">{children}</span>
      <div className="flex-1 h-px bg-primary-100" />
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

const AddConnectionModal: React.FC<Props> = ({ isOpen, onClose, editing }) => {
  const qc = useQueryClient()

  const [mode, setMode] = useState<Mode>('direct')
  const [error, setError] = useState<string | null>(null)

  // Point A
  const [deviceId, setDeviceId] = useState<number | ''>('')
  const [ifaceAId, setIfaceAId] = useState<number | ''>('')

  // Point B (patch panel)
  const [ppId, setPpId] = useState<number | ''>('')
  const [ppIfaceDevSide, setPpIfaceDevSide] = useState<number | ''>('')
  const [ppIfaceSwSide, setPpIfaceSwSide] = useState<number | ''>('')

  // Point C (switch)
  const [switchId, setSwitchId] = useState<number | ''>('')
  const [ifaceCId, setIfaceCId] = useState<number | ''>('')

  // ── Prefill when editing ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return
    if (editing) {
      setMode(editing.pp_id ? 'via_pp' : 'direct')
      setDeviceId(editing.device_id ?? '')
      setIfaceAId(editing.iface_a_id ?? '')
      setPpId(editing.pp_id ?? '')
      setPpIfaceDevSide(editing.iface_b_pp_side ?? '')
      setPpIfaceSwSide(editing.iface_b_sw_side ?? '')
      setSwitchId(editing.switch_id ?? '')
      setIfaceCId(editing.iface_c_id ?? '')
    } else {
      setMode('direct')
      setDeviceId(''); setIfaceAId('')
      setPpId(''); setPpIfaceDevSide(''); setPpIfaceSwSide('')
      setSwitchId(''); setIfaceCId('')
    }
    setError(null)
  }, [isOpen, editing])

  // Reset dependent fields when parent changes
  useEffect(() => { setIfaceAId('') }, [deviceId])
  useEffect(() => { setPpIfaceDevSide(''); setPpIfaceSwSide('') }, [ppId])
  useEffect(() => { setIfaceCId('') }, [switchId])

  // ── Data fetches ─────────────────────────────────────────────────────────

  const { data: endDevices } = useQuery({
    queryKey: ['devices-end'],
    queryFn: () => devicesApi.list({ size: 500, exclude_device_type: 'patch_panel' }),
    enabled: isOpen,
    staleTime: 30_000,
  })
  // Filter client-side: exclude switches too
  const endDeviceList = (endDevices?.items ?? []).filter(d => d.device_type !== 'switch')

  const { data: deviceIfaces } = useQuery({
    queryKey: ['ifaces-device', deviceId],
    queryFn: () => interfacesApi.list({ device_id: deviceId as number, size: 200 }),
    enabled: isOpen && !!deviceId,
    staleTime: 10_000,
  })

  const { data: switches } = useQuery({
    queryKey: ['devices-switches'],
    queryFn: () => devicesApi.list({ device_type: 'switch', size: 500 }),
    enabled: isOpen,
    staleTime: 30_000,
  })

  const { data: switchPorts } = useQuery({
    queryKey: ['switch-ports', switchId],
    queryFn: () => switchesApi.getPorts(switchId as number),
    enabled: isOpen && !!switchId,
    staleTime: 10_000,
  })

  const { data: patchPanels } = useQuery({
    queryKey: ['patch-panels-all'],
    queryFn: () => patchPanelsApi.list({ size: 500 }),
    enabled: isOpen && mode === 'via_pp',
    staleTime: 30_000,
  })

  const { data: ppPorts } = useQuery({
    queryKey: ['pp-ports', ppId],
    queryFn: () => patchPanelsApi.getPorts(ppId as number),
    enabled: isOpen && mode === 'via_pp' && !!ppId,
    staleTime: 10_000,
  })

  // ── Free port filtering ──────────────────────────────────────────────────
  // In edit mode, the "currently selected" port is already linked to the old
  // cable — we include it anyway so the user can keep it.
  const freeSwitchPorts = (switchPorts ?? []).filter(p =>
    !p.linked_interface || p.interface.id === ifaceCId
  )
  const freePpPortsDevSide = (ppPorts ?? []).filter(p =>
    (!p.linked_interface || p.interface.id === ppIfaceDevSide) &&
    p.interface.id !== ppIfaceSwSide
  )
  const freePpPortsSwSide = (ppPorts ?? []).filter(p =>
    (!p.linked_interface || p.interface.id === ppIfaceSwSide) &&
    p.interface.id !== ppIfaceDevSide
  )

  // ── Save ──────────────────────────────────────────────────────────────────
  const save = useMutation({
    mutationFn: async () => {
      if (!ifaceAId || !ifaceCId) throw new Error('Seleziona dispositivo, interfaccia e porta switch')
      if (mode === 'via_pp' && (!ppIfaceDevSide || !ppIfaceSwSide)) throw new Error('Seleziona le porte del patch panel')

      // Delete old cables if editing
      if (editing?.cable_bc_id) await cablesApi.delete(editing.cable_bc_id)
      if (editing?.cable_ab_id) await cablesApi.delete(editing.cable_ab_id)

      if (mode === 'direct') {
        // A → C: one cable
        const a = Math.min(ifaceAId as number, ifaceCId as number)
        const b = Math.max(ifaceAId as number, ifaceCId as number)
        await cablesApi.create({ interface_a_id: a, interface_b_id: b })
      } else {
        // A → B(dev) : cable AB
        const ab_a = Math.min(ifaceAId as number, ppIfaceDevSide as number)
        const ab_b = Math.max(ifaceAId as number, ppIfaceDevSide as number)
        await cablesApi.create({ interface_a_id: ab_a, interface_b_id: ab_b })
        // B(sw) → C : cable BC
        const bc_a = Math.min(ppIfaceSwSide as number, ifaceCId as number)
        const bc_b = Math.max(ppIfaceSwSide as number, ifaceCId as number)
        await cablesApi.create({ interface_a_id: bc_a, interface_b_id: bc_b })
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['connections'] })
      qc.invalidateQueries({ queryKey: ['switch-ports'] })
      qc.invalidateQueries({ queryKey: ['pp-ports'] })
      qc.invalidateQueries({ queryKey: ['patch-panel-ports'] })
      onClose()
    },
    onError: (e: Error) => setError(e.message || 'Errore durante il salvataggio'),
  })

  const handleSubmit = (ev: React.FormEvent) => { ev.preventDefault(); setError(null); save.mutate() }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? 'Modifica connessione' : 'Nuova connessione'}
      size="lg"
      footer={
        <>
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Annulla</button>
          <button type="button" onClick={handleSubmit} disabled={save.isPending} className="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
            {save.isPending ? 'Salvataggio...' : 'Salva'}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-1">
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-2">{error}</p>}

        {/* Mode selector */}
        <div className="flex gap-3 mb-2">
          {(['direct', 'via_pp'] as Mode[]).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                mode === m
                  ? 'bg-primary-50 border-primary-400 text-primary-700'
                  : 'border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              {m === 'direct' ? '⬦ Diretto (A → C)' : '⬦ Via Patch Panel (A → B → C)'}
            </button>
          ))}
        </div>

        {/* ── Punto A ── */}
        <SectionLabel>Punto A — Dispositivo</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Dispositivo</label>
            <select value={deviceId} onChange={e => setDeviceId(e.target.value ? Number(e.target.value) : '')} className={sel}>
              <option value="">— seleziona —</option>
              {endDeviceList.map(d => (
                <option key={d.id} value={d.id}>{d.notes || d.name}{d.primary_ip ? ` (${d.primary_ip})` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={lbl}>Interfaccia</label>
            <select value={ifaceAId} onChange={e => setIfaceAId(e.target.value ? Number(e.target.value) : '')} disabled={!deviceId} className={sel}>
              <option value="">— seleziona —</option>
              {deviceIfaces?.items.map(i => (
                <option key={i.id} value={i.id}>{i.name}{i.label ? ` — ${i.label}` : ''}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Punto B (optional) ── */}
        {mode === 'via_pp' && (
          <>
            <SectionLabel>Punto B — Patch Panel</SectionLabel>
            <div>
              <label className={lbl}>Patch Panel</label>
              <select value={ppId} onChange={e => setPpId(e.target.value ? Number(e.target.value) : '')} className={sel}>
                <option value="">— seleziona —</option>
                {patchPanels?.items.map(pp => (
                  <option key={pp.id} value={pp.id}>{pp.name}{pp.cabinet_name ? ` (${pp.cabinet_name})` : ''}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div>
                <label className={lbl}>Porta lato dispositivo</label>
                <select value={ppIfaceDevSide} onChange={e => setPpIfaceDevSide(e.target.value ? Number(e.target.value) : '')} disabled={!ppId} className={sel}>
                  <option value="">— libera —</option>
                  {freePpPortsDevSide.map(p => {
                    const m = p.interface.name.match(/(\d+)$/)
                    const num = m ? m[1] : p.interface.name
                    return <option key={p.interface.id} value={p.interface.id}>Porta {num}{p.interface.label ? ` — ${p.interface.label}` : ''}</option>
                  })}
                </select>
              </div>
              <div>
                <label className={lbl}>Porta lato switch</label>
                <select value={ppIfaceSwSide} onChange={e => setPpIfaceSwSide(e.target.value ? Number(e.target.value) : '')} disabled={!ppId} className={sel}>
                  <option value="">— libera —</option>
                  {freePpPortsSwSide.map(p => {
                    const m = p.interface.name.match(/(\d+)$/)
                    const num = m ? m[1] : p.interface.name
                    return <option key={p.interface.id} value={p.interface.id}>Porta {num}{p.interface.label ? ` — ${p.interface.label}` : ''}</option>
                  })}
                </select>
              </div>
            </div>
          </>
        )}

        {/* ── Punto C ── */}
        <SectionLabel>Punto C — Switch</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Switch</label>
            <select value={switchId} onChange={e => setSwitchId(e.target.value ? Number(e.target.value) : '')} className={sel}>
              <option value="">— seleziona —</option>
              {switches?.items.map(sw => (
                <option key={sw.id} value={sw.id}>{sw.notes || sw.name}{sw.primary_ip ? ` (${sw.primary_ip})` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={lbl}>Porta (solo libere)</label>
            <select value={ifaceCId} onChange={e => setIfaceCId(e.target.value ? Number(e.target.value) : '')} disabled={!switchId} className={sel}>
              <option value="">— seleziona —</option>
              {freeSwitchPorts.map(p => (
                <option key={p.interface.id} value={p.interface.id}>
                  {p.interface.name}{p.interface.label ? ` — ${p.interface.label}` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </form>
    </Modal>
  )
}

export default AddConnectionModal
