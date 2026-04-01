import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, ArrowRight, Minus, ChevronLeft, ChevronRight, Plus, Edit2, Trash2 } from 'lucide-react'
import { connectionsApi, type ConnectionPath } from '../api/connections'
import { devicesApi } from '../api/devices'
import { sitesApi } from '../api/sites'
import { cabinetsApi } from '../api/cabinets'
import { cablesApi } from '../api/cables'
import LoadingSpinner from '../components/common/LoadingSpinner'
import AddConnectionModal from '../components/connections/AddConnectionModal'
import { useAuthStore } from '../store/authStore'

const PAGE_SIZE = 50

const ConnectionsPage: React.FC = () => {
  const { isAdmin } = useAuthStore()
  const [q, setQ] = useState('')
  const [switchId, setSwitchId] = useState<number | undefined>()
  const [siteId, setSiteId] = useState<number | undefined>()
  const [cabinetId, setCabinetId] = useState<number | undefined>()
  const [onlyDirect, setOnlyDirect] = useState(false)
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingConn, setEditingConn] = useState<ConnectionPath | null>(null)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['connections', { q, switchId, siteId, cabinetId, onlyDirect, page }],
    queryFn: () => connectionsApi.list({
      q: q || undefined,
      switch_id: switchId,
      site_id: siteId,
      cabinet_id: cabinetId,
      only_direct: onlyDirect || undefined,
      page,
      size: PAGE_SIZE,
    }),
    placeholderData: (prev) => prev,
  })

  const { data: switches } = useQuery({
    queryKey: ['devices-switches'],
    queryFn: () => devicesApi.list({ device_type: 'switch', size: 500 }),
  })

  const { data: sites } = useQuery({
    queryKey: ['sites'],
    queryFn: () => sitesApi.list(),
  })

  const { data: cabinets } = useQuery({
    queryKey: ['cabinets', siteId],
    queryFn: () => cabinetsApi.list(siteId ? { site_id: siteId } : undefined),
  })

  const handleSiteChange = (val: string) => {
    setSiteId(val ? Number(val) : undefined)
    setCabinetId(undefined)
    setPage(1)
  }

  const paths: ConnectionPath[] = data?.items ?? []
  const total: number = data?.total ?? 0
  const totalPages: number = data?.pages ?? 1

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Connessioni</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Percorsi di rete: Dispositivo → Patch Panel → Switch
          </p>
        </div>
        <div className="flex items-center gap-3">
          {total > 0 && <span className="text-sm text-gray-500">{total} percorsi</span>}
          {isAdmin() && (
            <button
              onClick={() => { setEditingConn(null); setModalOpen(true) }}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700"
            >
              <Plus size={15} />
              Nuova connessione
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap gap-3 items-center">
          {/* Text search */}
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={q}
              onChange={e => { setQ(e.target.value); setPage(1) }}
              placeholder="Cerca dispositivo, switch, patch panel..."
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Site */}
          <select
            value={siteId ?? ''}
            onChange={e => handleSiteChange(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
          >
            <option value="">Tutte le sedi</option>
            {sites?.items?.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          {/* Cabinet */}
          <select
            value={cabinetId ?? ''}
            onChange={e => { setCabinetId(e.target.value ? Number(e.target.value) : undefined); setPage(1) }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
          >
            <option value="">Tutti gli armadi</option>
            {cabinets?.items?.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          {/* Switch filter */}
          <select
            value={switchId ?? ''}
            onChange={e => { setSwitchId(e.target.value ? Number(e.target.value) : undefined); setPage(1) }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
          >
            <option value="">Tutti gli switch</option>
            {switches?.items?.map(sw => (
              <option key={sw.id} value={sw.id}>{sw.name}</option>
            ))}
          </select>

          {/* Only direct */}
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={onlyDirect}
              onChange={e => { setOnlyDirect(e.target.checked); setPage(1) }}
              className="rounded text-primary-600"
            />
            Solo diretti (senza PP)
          </label>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="py-16"><LoadingSpinner centered /></div>
        ) : paths.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="font-medium">Nessuna connessione trovata</p>
            <p className="text-sm mt-1">Esegui una scansione su uno switch per scoprire i collegamenti</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 text-left font-medium text-gray-500 text-xs uppercase tracking-wide">
                    Dispositivo (A)
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 text-xs uppercase tracking-wide">
                    Interfaccia
                  </th>
                  <th className="px-2 py-3 text-center text-gray-400 text-xs">→</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 text-xs uppercase tracking-wide">
                    Patch Panel (B)
                  </th>
                  <th className="px-2 py-3 text-center text-gray-400 text-xs">→</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 text-xs uppercase tracking-wide">
                    Switch (C)
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 text-xs uppercase tracking-wide">
                    Porta Switch
                  </th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {paths.map((path: ConnectionPath, idx: number) => (
                  <ConnectionRow
                    key={idx}
                    path={path}
                    onEdit={isAdmin() ? () => { setEditingConn(path); setModalOpen(true) } : undefined}
                    onDelete={isAdmin() ? async () => {
                      if (path.cable_ab_id) await cablesApi.delete(path.cable_ab_id)
                      if (path.cable_bc_id) await cablesApi.delete(path.cable_bc_id)
                      qc.invalidateQueries({ queryKey: ['connections'] })
                      qc.invalidateQueries({ queryKey: ['switch-ports'] })
                      qc.invalidateQueries({ queryKey: ['patch-panel-ports'] })
                    } : undefined}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit modal */}
      <AddConnectionModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditingConn(null) }}
        editing={editingConn}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>
            Pagina {page} di {totalPages} ({total} percorsi)
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Row component
// ---------------------------------------------------------------------------

const ConnectionRow: React.FC<{ path: ConnectionPath; onEdit?: () => void; onDelete?: () => Promise<void> }> = ({ path, onEdit, onDelete }) => {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!onDelete) return
    setDeleting(true)
    try { await onDelete() } finally { setDeleting(false); setConfirming(false) }
  }

  return (
    <tr className="hover:bg-gray-50/50 transition-colors">
      {/* Device A */}
      <td className="px-4 py-3">
        {path.device_id ? (
          <Link to={`/dispositivi/${path.device_id}`} className="font-medium text-gray-900 hover:text-primary-600">
            {path.device_name}
          </Link>
        ) : (
          <span className="text-gray-400">—</span>
        )}
        {path.device_ip && (
          <span className="ml-2 text-xs font-mono text-gray-400">{path.device_ip}</span>
        )}
      </td>

      {/* Interface A */}
      <td className="px-4 py-3">
        <span className="font-mono text-xs text-gray-500">{path.iface_a_name ?? '—'}</span>
      </td>

      {/* Arrow */}
      <td className="px-2 py-3 text-center">
        {path.pp_id ? (
          <ArrowRight size={14} className="text-gray-300 mx-auto" />
        ) : (
          <Minus size={14} className="text-gray-200 mx-auto" />
        )}
      </td>

      {/* Patch Panel B */}
      <td className="px-4 py-3">
        {path.pp_id ? (
          <span className="text-gray-700">{path.pp_name}</span>
        ) : (
          <span className="text-gray-300 text-xs italic">diretto</span>
        )}
        {path.pp_cabinet && (
          <span className="ml-2 text-xs text-gray-400">{path.pp_cabinet}</span>
        )}
      </td>

      {/* Arrow */}
      <td className="px-2 py-3 text-center">
        <ArrowRight size={14} className="text-gray-300 mx-auto" />
      </td>

      {/* Switch C */}
      <td className="px-4 py-3">
        {path.switch_id ? (
          <Link to={`/switch?expand=${path.switch_id}`} className="font-medium text-gray-900 hover:text-primary-600">
            {path.switch_name}
          </Link>
        ) : (
          <span className="text-gray-400">—</span>
        )}
        {path.switch_ip && (
          <span className="ml-2 text-xs font-mono text-gray-400">{path.switch_ip}</span>
        )}
      </td>

      {/* Switch port */}
      <td className="px-4 py-3">
        <span className="font-mono text-xs text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">
          {path.iface_c_name ?? '—'}
        </span>
      </td>

      {/* Actions */}
      <td className="px-2 py-3 text-right">
        <div className="flex items-center justify-end gap-1">
          {onEdit && !confirming && (
            <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors" title="Modifica">
              <Edit2 size={13} />
            </button>
          )}
          {onDelete && !confirming && (
            <button onClick={() => setConfirming(true)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Elimina">
              <Trash2 size={13} />
            </button>
          )}
          {confirming && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500 whitespace-nowrap">Eliminare?</span>
              <button onClick={handleDelete} disabled={deleting} className="px-2 py-0.5 text-xs text-white bg-red-500 hover:bg-red-600 rounded disabled:opacity-50">
                {deleting ? '...' : 'Sì'}
              </button>
              <button onClick={() => setConfirming(false)} className="px-2 py-0.5 text-xs text-gray-600 bg-gray-100 hover:bg-gray-200 rounded">
                No
              </button>
            </div>
          )}
        </div>
      </td>
    </tr>
  )
}

export default ConnectionsPage
