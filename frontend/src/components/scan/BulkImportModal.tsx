import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckSquare, X } from 'lucide-react'
import { devicesApi } from '../../api/devices'
import { cabinetsApi } from '../../api/cabinets'
import { vendorsApi } from '../../api/vendors'
import type { DeviceType, DeviceBulkCreateItem } from '../../types'

interface FoundHost {
  ip: string
  mac: string | null
  vendor: string | null
  hostname: string | null
}

interface BulkRow extends DeviceBulkCreateItem {
  _ip: string
  _mac: string | null
  _vendor_hint: string | null
}

const DEVICE_TYPES: DeviceType[] = ['server', 'workstation', 'printer', 'camera', 'phone', 'ap', 'other']

interface Props {
  hosts: FoundHost[]
  onClose: () => void
  onSuccess: (ips: string[]) => void
}

const BulkImportModal: React.FC<Props> = ({ hosts, onClose, onSuccess }) => {
  const qc = useQueryClient()

  const [rows, setRows] = useState<BulkRow[]>(() =>
    hosts.map((h) => ({
      _ip: h.ip,
      _mac: h.mac,
      _vendor_hint: h.vendor,
      name: h.hostname || h.ip,
      primary_ip: h.ip,
      device_type: 'other' as DeviceType,
      status: 'active' as const,
      mac_address: h.mac ?? undefined,
    }))
  )
  const [globalCabinetId, setGlobalCabinetId] = useState<number | null>(null)
  const [globalVendorId, setGlobalVendorId] = useState<number | null>(null)
  const [skipDuplicates, setSkipDuplicates] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [result, setResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null)

  const { data: cabinetsData } = useQuery({
    queryKey: ['cabinets', 'all'],
    queryFn: () => cabinetsApi.list({ size: 100 }),
    staleTime: 60_000,
  })
  const { data: vendorsData } = useQuery({
    queryKey: ['vendors', 'all'],
    queryFn: () => vendorsApi.list({ size: 200 }),
    staleTime: 60_000,
  })

  const updateRow = (idx: number, patch: Partial<BulkRow>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  const handleApplyGlobal = () => {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        cabinet_id: globalCabinetId ?? r.cabinet_id,
        vendor_id: globalVendorId ?? r.vendor_id,
      }))
    )
  }

  const handleSubmit = async () => {
    setIsSaving(true)
    try {
      const res = await devicesApi.bulkCreate({
        devices: rows.map((r) => ({
          name: r.name,
          primary_ip: r.primary_ip,
          device_type: r.device_type,
          status: r.status,
          cabinet_id: r.cabinet_id ?? null,
          vendor_id: r.vendor_id ?? null,
          mac_address: r.mac_address ?? null,
        })),
        skip_duplicates: skipDuplicates,
      })
      setResult(res)
      qc.invalidateQueries({ queryKey: ['devices'] })
    } catch {
      setResult({ created: 0, skipped: 0, errors: ['Errore di rete durante il salvataggio.'] })
    } finally {
      setIsSaving(false)
    }
  }

  const handleClose = () => {
    if (result) onSuccess(rows.map((r) => r._ip))
    else onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <CheckSquare size={18} className="text-primary-600" />
            <h2 className="text-base font-semibold text-gray-900">
              Importazione massiva — {hosts.length} dispositivi
            </h2>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {result ? (
          /* Result view */
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
            <div className="text-center">
              <p className="text-4xl font-bold text-green-600">{result.created}</p>
              <p className="text-sm text-gray-500 mt-1">dispositivi creati</p>
            </div>
            {result.skipped > 0 && (
              <p className="text-sm text-gray-400">{result.skipped} saltati (duplicati)</p>
            )}
            {result.errors.length > 0 && (
              <div className="w-full bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-xs font-medium text-red-700 mb-1">Errori:</p>
                {result.errors.map((e, i) => (
                  <p key={i} className="text-xs text-red-600">{e}</p>
                ))}
              </div>
            )}
            <button onClick={handleClose} className="px-5 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700">
              Chiudi
            </button>
          </div>
        ) : (
          <>
            {/* Global settings bar */}
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Armadio per tutti</label>
                <select
                  value={globalCabinetId ?? ''}
                  onChange={(e) => setGlobalCabinetId(e.target.value ? Number(e.target.value) : null)}
                  className="border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">— Nessuno —</option>
                  {cabinetsData?.items.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Vendor per tutti</label>
                <select
                  value={globalVendorId ?? ''}
                  onChange={(e) => setGlobalVendorId(e.target.value ? Number(e.target.value) : null)}
                  className="border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">— Nessuno —</option>
                  {vendorsData?.items.map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={handleApplyGlobal}
                className="px-3 py-1.5 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                Applica a tutti
              </button>
              <label className="flex items-center gap-1.5 ml-auto text-xs text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={skipDuplicates}
                  onChange={(e) => setSkipDuplicates(e.target.checked)}
                  className="rounded"
                />
                Salta duplicati
              </label>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">IP / MAC</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Nome</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Tipo</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Armadio</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Vendor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row, idx) => (
                    <tr key={row._ip} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <span className="font-mono text-green-700">{row._ip}</span>
                        {row._mac && <br />}
                        {row._mac && <span className="font-mono text-gray-400 text-[10px]">{row._mac}</span>}
                        {row._vendor_hint && <br />}
                        {row._vendor_hint && <span className="text-gray-400 text-[10px]">{row._vendor_hint}</span>}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={row.name}
                          onChange={(e) => updateRow(idx, { name: e.target.value })}
                          className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary-400"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={row.device_type}
                          onChange={(e) => updateRow(idx, { device_type: e.target.value as DeviceType })}
                          className="border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary-400"
                        >
                          {DEVICE_TYPES.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={row.cabinet_id ?? ''}
                          onChange={(e) => updateRow(idx, { cabinet_id: e.target.value ? Number(e.target.value) : null })}
                          className="border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary-400 max-w-[120px]"
                        >
                          <option value="">—</option>
                          {cabinetsData?.items.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={row.vendor_id ?? ''}
                          onChange={(e) => updateRow(idx, { vendor_id: e.target.value ? Number(e.target.value) : null })}
                          className="border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary-400 max-w-[120px]"
                        >
                          <option value="">—</option>
                          {vendorsData?.items.map((v) => (
                            <option key={v.id} value={v.id}>{v.name}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-between">
              <p className="text-xs text-gray-500">{rows.length} dispositivi da importare</p>
              <div className="flex gap-3">
                <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
                  Annulla
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isSaving}
                  className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 font-medium"
                >
                  {isSaving ? 'Importazione...' : `Importa ${rows.length} dispositivi`}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default BulkImportModal
