import React, { useState } from 'react'
import { Plus, Layers } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { vlansApi } from '../api/vlans'
import { sitesApi } from '../api/sites'
import { useAuthStore } from '../store/authStore'
import Table, { Column } from '../components/common/Table'
import Modal from '../components/common/Modal'
import Pagination from '../components/common/Pagination'
import LoadingSpinner from '../components/common/LoadingSpinner'
import { Badge } from '../components/common/Badge'
import type { Vlan, VlanCreate } from '../types'

const VlansPage: React.FC = () => {
  const { isAdmin } = useAuthStore()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editing, setEditing] = useState<Vlan | null>(null)
  const [form, setForm] = useState<VlanCreate>({ vid: 1, name: '', status: 'active' })
  const [error, setError] = useState<string | null>(null)
  const [selectedVlan, setSelectedVlan] = useState<Vlan | null>(null)
  const [vlanTab, setVlanTab] = useState<'interfaces' | 'prefixes'>('interfaces')

  const { data, isLoading } = useQuery({
    queryKey: ['vlans', page],
    queryFn: () => vlansApi.list({ page, size: 20 }),
    staleTime: 30_000,
  })

  const { data: sitesData } = useQuery({
    queryKey: ['sites', 'all'],
    queryFn: () => sitesApi.list({ size: 100 }),
    staleTime: 60_000,
  })

  const { data: vlanInterfaces } = useQuery({
    queryKey: ['vlans', selectedVlan?.id, 'interfaces'],
    queryFn: () => vlansApi.getInterfaces(selectedVlan!.id),
    enabled: !!selectedVlan && vlanTab === 'interfaces',
    staleTime: 30_000,
  })

  const { data: vlanPrefixes } = useQuery({
    queryKey: ['vlans', selectedVlan?.id, 'prefixes'],
    queryFn: () => vlansApi.getPrefixes(selectedVlan!.id),
    enabled: !!selectedVlan && vlanTab === 'prefixes',
    staleTime: 30_000,
  })

  const createVlan = useMutation({
    mutationFn: (d: VlanCreate) => vlansApi.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vlans'] }); closeModal() },
    onError: () => setError('Errore durante il salvataggio'),
  })

  const updateVlan = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<VlanCreate> }) => vlansApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vlans'] }); closeModal() },
    onError: () => setError('Errore durante il salvataggio'),
  })

  const openCreate = () => { setEditing(null); setForm({ vid: 1, name: '', status: 'active' }); setError(null); setIsModalOpen(true) }
  const openEdit = (v: Vlan) => { setEditing(v); setForm({ vid: v.vid, name: v.name, status: v.status, site_id: v.site_id ?? undefined, description: v.description ?? undefined }); setError(null); setIsModalOpen(true) }
  const closeModal = () => { setIsModalOpen(false); setEditing(null); setError(null) }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.vid) { setError('ID VLAN e nome sono obbligatori'); return }
    if (editing) updateVlan.mutate({ id: editing.id, data: form })
    else createVlan.mutate(form)
  }

  const statusVariant = (s: string) => s === 'active' ? 'green' : s === 'deprecated' ? 'red' : 'gray'

  const columns: Column<Vlan>[] = [
    { key: 'vid', header: 'ID VLAN', sortable: true, render: (v) => <span className="font-bold font-mono">{v.vid}</span> },
    { key: 'name', header: 'Nome', render: (v) => <span className="font-medium text-gray-900">{v.name}</span> },
    { key: 'site', header: 'Sede', render: (v) => <span className="text-gray-500 text-xs">{v.site?.name ?? '—'}</span> },
    { key: 'status', header: 'Stato', render: (v) => <Badge variant={statusVariant(v.status)}>{v.status}</Badge> },
    { key: 'interfaces_count', header: 'Interfacce', render: (v) => <span>{v.interfaces_count ?? 0}</span> },
    { key: 'prefixes_count', header: 'Prefissi', render: (v) => <span>{v.prefixes_count ?? 0}</span> },
    ...(isAdmin() ? [{ key: 'actions', header: '', render: (v: Vlan) => (
      <button onClick={(e) => { e.stopPropagation(); openEdit(v) }} className="text-xs text-primary-600 hover:underline">Modifica</button>
    )} as Column<Vlan>] : []),
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">VLAN</h1>
          <p className="text-sm text-gray-500 mt-1">Gestisci le VLAN di rete</p>
        </div>
        {isAdmin() && (
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700">
            <Plus size={16} />Nuova VLAN
          </button>
        )}
      </div>

      {isLoading ? <LoadingSpinner centered /> : (
        <>
          <Table columns={columns} data={data?.items ?? []} keyExtractor={(v) => v.id} onRowClick={setSelectedVlan} emptyTitle="Nessuna VLAN" emptyDescription="Crea la prima VLAN." />
          {data && <Pagination page={page} pages={data.pages} total={data.total} size={data.size} onPageChange={setPage} />}
        </>
      )}

      {/* VLAN detail drawer */}
      {selectedVlan && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <Layers size={18} className="text-gray-400" />
              <h3 className="font-semibold text-gray-900">VLAN {selectedVlan.vid} — {selectedVlan.name}</h3>
            </div>
            <button onClick={() => setSelectedVlan(null)} className="text-gray-400 hover:text-gray-600">×</button>
          </div>
          <div className="flex gap-0 border-b border-gray-200 px-5">
            {(['interfaces', 'prefixes'] as const).map((tab) => (
              <button key={tab} onClick={() => setVlanTab(tab)} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${vlanTab === tab ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                {tab === 'interfaces' ? 'Interfacce' : 'Prefissi IP'}
              </button>
            ))}
          </div>
          <div className="p-5">
            {vlanTab === 'interfaces' && (
              <div className="space-y-2">
                {vlanInterfaces?.map((iface) => (
                  <div key={iface.id} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                    <span className="font-mono text-sm text-gray-700">{iface.name}</span>
                    <span className="text-xs text-gray-400">{iface.device?.name ?? '—'}</span>
                  </div>
                ))}
                {vlanInterfaces?.length === 0 && <p className="text-sm text-gray-500 py-4 text-center">Nessuna interfaccia associata</p>}
              </div>
            )}
            {vlanTab === 'prefixes' && (
              <div className="space-y-2">
                {vlanPrefixes?.map((prefix) => (
                  <div key={prefix.id} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                    <span className="font-mono text-sm text-gray-700">{prefix.prefix}</span>
                    <span className="text-xs text-gray-400">{prefix.site?.name ?? '—'}</span>
                    <span className="text-xs text-gray-500 ml-auto">{prefix.utilization_percent.toFixed(0)}% usato</span>
                  </div>
                ))}
                {vlanPrefixes?.length === 0 && <p className="text-sm text-gray-500 py-4 text-center">Nessun prefisso associato</p>}
              </div>
            )}
          </div>
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={closeModal} title={editing ? 'Modifica VLAN' : 'Nuova VLAN'} size="md"
        footer={
          <>
            <button onClick={closeModal} className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Annulla</button>
            <button onClick={handleSubmit} disabled={createVlan.isPending || updateVlan.isPending} className="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
              {createVlan.isPending || updateVlan.isPending ? 'Salvataggio...' : 'Salva'}
            </button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ID VLAN *</label>
              <input type="number" min={1} max={4094} value={form.vid} onChange={(e) => setForm((f) => ({ ...f, vid: Number(e.target.value) }))} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stato</label>
              <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as 'active' | 'reserved' | 'deprecated' }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                <option value="active">Attiva</option>
                <option value="reserved">Riservata</option>
                <option value="deprecated">Deprecata</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
            <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sede</label>
            <select value={form.site_id ?? ''} onChange={(e) => setForm((f) => ({ ...f, site_id: e.target.value ? Number(e.target.value) : undefined }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">-- Nessuna sede --</option>
              {sitesData?.items.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
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

export default VlansPage
