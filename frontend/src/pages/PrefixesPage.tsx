import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { prefixesApi } from '../api/prefixes'
import { sitesApi } from '../api/sites'
import { vlansApi } from '../api/vlans'
import { useAuthStore } from '../store/authStore'
import Modal from '../components/common/Modal'
import Pagination from '../components/common/Pagination'
import LoadingSpinner from '../components/common/LoadingSpinner'
import EmptyState from '../components/common/EmptyState'
import { Badge } from '../components/common/Badge'
import type { IpPrefix, IpPrefixCreate } from '../types'

const PrefixesPage: React.FC = () => {
  const navigate = useNavigate()
  const { isAdmin } = useAuthStore()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editing, setEditing] = useState<IpPrefix | null>(null)
  const [form, setForm] = useState<IpPrefixCreate>({ prefix: '', status: 'active', is_pool: false })
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<{ site_id?: number; status?: string }>({})

  const { data, isLoading } = useQuery({
    queryKey: ['prefixes', filters, page],
    queryFn: () => prefixesApi.list({ ...filters, page, size: 20 }),
    staleTime: 30_000,
  })

  const { data: sitesData } = useQuery({ queryKey: ['sites', 'all'], queryFn: () => sitesApi.list({ size: 100 }), staleTime: 60_000 })
  const { data: vlansData } = useQuery({ queryKey: ['vlans', 'all'], queryFn: () => vlansApi.list({ size: 100 }), staleTime: 60_000 })

  const createPrefix = useMutation({
    mutationFn: (d: IpPrefixCreate) => prefixesApi.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prefixes'] }); closeModal() },
    onError: () => setError('Errore durante il salvataggio'),
  })

  const updatePrefix = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<IpPrefixCreate> }) => prefixesApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prefixes'] }); closeModal() },
    onError: () => setError('Errore durante il salvataggio'),
  })

  const openCreate = () => { setEditing(null); setForm({ prefix: '', status: 'active', is_pool: false }); setError(null); setIsModalOpen(true) }
  const openEdit = (p: IpPrefix) => { setEditing(p); setForm({ prefix: p.prefix, status: p.status, is_pool: p.is_pool, site_id: p.site_id ?? undefined, vlan_id: p.vlan_id ?? undefined, description: p.description ?? undefined }); setError(null); setIsModalOpen(true) }
  const closeModal = () => { setIsModalOpen(false); setEditing(null); setError(null) }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.prefix) { setError('Il prefisso è obbligatorio'); return }
    if (editing) updatePrefix.mutate({ id: editing.id, data: form })
    else createPrefix.mutate(form)
  }

  const statusVariant = (s: string) => s === 'active' ? 'green' : s === 'deprecated' ? 'red' : s === 'container' ? 'blue' : 'gray'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Prefissi IP</h1>
          <p className="text-sm text-gray-500 mt-1">Gestisci i prefissi di rete</p>
        </div>
        {isAdmin() && (
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700">
            <Plus size={16} />Nuovo Prefisso
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap bg-white rounded-xl border border-gray-200 p-4">
        <select value={filters.status ?? ''} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value || undefined }))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
          <option value="">Tutti gli stati</option>
          <option value="active">Attivo</option>
          <option value="reserved">Riservato</option>
          <option value="deprecated">Deprecato</option>
          <option value="container">Contenitore</option>
        </select>
        <select value={filters.site_id ?? ''} onChange={(e) => setFilters((f) => ({ ...f, site_id: e.target.value ? Number(e.target.value) : undefined }))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
          <option value="">Tutte le sedi</option>
          {sitesData?.items.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {isLoading ? <LoadingSpinner centered /> : data?.items.length === 0 ? (
        <EmptyState title="Nessun prefisso" description="Aggiungi i prefissi di rete." action={{ label: 'Nuovo prefisso', onClick: openCreate }} />
      ) : (
        <>
          <div className="space-y-3">
            {data?.items.map((prefix) => (
              <div
                key={prefix.id}
                onClick={() => navigate(`/prefissi/${prefix.id}`)}
                className="bg-white rounded-xl border border-gray-200 p-4 cursor-pointer hover:shadow-md hover:border-gray-300 transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-mono font-bold text-gray-900">{prefix.prefix}</span>
                      <Badge variant={statusVariant(prefix.status)}>{prefix.status}</Badge>
                      {prefix.is_pool && <Badge variant="indigo">Pool</Badge>}
                      {prefix.vlan && <Badge variant="blue">VLAN {prefix.vlan.vid}</Badge>}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {prefix.site?.name ?? 'Nessuna sede'}{prefix.description ? ` — ${prefix.description}` : ''}
                    </p>
                  </div>
                  {/* Utilization bar */}
                  <div className="flex-shrink-0 w-48">
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                      <span>{prefix.used_ips} / {prefix.total_ips}</span>
                      <span>{prefix.utilization_percent.toFixed(0)}%</span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${prefix.utilization_percent > 90 ? 'bg-red-500' : prefix.utilization_percent > 70 ? 'bg-yellow-500' : 'bg-green-500'}`}
                        style={{ width: `${Math.min(prefix.utilization_percent, 100)}%` }}
                      />
                    </div>
                  </div>
                  {isAdmin() && (
                    <button onClick={(e) => { e.stopPropagation(); openEdit(prefix) }} className="text-xs text-primary-600 hover:underline flex-shrink-0">Modifica</button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {data && <Pagination page={page} pages={data.pages} total={data.total} size={data.size} onPageChange={setPage} />}
        </>
      )}

      <Modal isOpen={isModalOpen} onClose={closeModal} title={editing ? 'Modifica prefisso' : 'Nuovo prefisso'} size="md"
        footer={
          <>
            <button onClick={closeModal} className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Annulla</button>
            <button onClick={handleSubmit} disabled={createPrefix.isPending || updatePrefix.isPending} className="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
              {createPrefix.isPending || updatePrefix.isPending ? 'Salvataggio...' : 'Salva'}
            </button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Prefisso CIDR *</label>
            <input type="text" value={form.prefix} onChange={(e) => setForm((f) => ({ ...f, prefix: e.target.value }))} placeholder="192.168.1.0/24" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stato</label>
              <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as IpPrefixCreate['status'] }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                <option value="active">Attivo</option>
                <option value="reserved">Riservato</option>
                <option value="deprecated">Deprecato</option>
                <option value="container">Contenitore</option>
              </select>
            </div>
            <div className="flex items-center gap-2 mt-6">
              <input type="checkbox" id="is-pool" checked={form.is_pool} onChange={(e) => setForm((f) => ({ ...f, is_pool: e.target.checked }))} className="rounded border-gray-300" />
              <label htmlFor="is-pool" className="text-sm text-gray-700">Pool di indirizzi</label>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sede</label>
            <select value={form.site_id ?? ''} onChange={(e) => setForm((f) => ({ ...f, site_id: e.target.value ? Number(e.target.value) : undefined }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">-- Nessuna sede --</option>
              {sitesData?.items.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">VLAN</label>
            <select value={form.vlan_id ?? ''} onChange={(e) => setForm((f) => ({ ...f, vlan_id: e.target.value ? Number(e.target.value) : undefined }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">-- Nessuna VLAN --</option>
              {vlansData?.items.map((v) => <option key={v.id} value={v.id}>VLAN {v.vid} — {v.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrizione</label>
            <input type="text" value={form.description ?? ''} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value || null }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
        </form>
      </Modal>
    </div>
  )
}

export default PrefixesPage
