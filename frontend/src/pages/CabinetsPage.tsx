import React, { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { cabinetsApi } from '../api/cabinets'
import { sitesApi } from '../api/sites'
import { useAuthStore } from '../store/authStore'
import Table, { Column } from '../components/common/Table'
import Modal from '../components/common/Modal'
import Pagination from '../components/common/Pagination'
import LoadingSpinner from '../components/common/LoadingSpinner'
import type { Cabinet, CabinetCreate } from '../types'

const CabinetsPage: React.FC = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const siteIdParam = searchParams.get('site_id') ? Number(searchParams.get('site_id')) : undefined
  const { isAdmin } = useAuthStore()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editing, setEditing] = useState<Cabinet | null>(null)
  const [form, setForm] = useState<CabinetCreate>({ name: '', site_id: siteIdParam ?? 0, u_count: 42 })
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['cabinets', { site_id: siteIdParam, page }],
    queryFn: () => cabinetsApi.list({ site_id: siteIdParam, page, size: 20 }),
    staleTime: 30_000,
  })

  const { data: sitesData } = useQuery({
    queryKey: ['sites', 'all'],
    queryFn: () => sitesApi.list({ size: 100 }),
    staleTime: 60_000,
  })

  const createCabinet = useMutation({
    mutationFn: (d: CabinetCreate) => cabinetsApi.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cabinets'] }); closeModal() },
    onError: () => setError('Errore durante il salvataggio'),
  })

  const updateCabinet = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CabinetCreate> }) => cabinetsApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cabinets'] }); closeModal() },
    onError: () => setError('Errore durante il salvataggio'),
  })

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', site_id: siteIdParam ?? 0, u_count: 42 })
    setError(null)
    setIsModalOpen(true)
  }

  const openEdit = (c: Cabinet) => {
    setEditing(c)
    setForm({ name: c.name, site_id: c.site_id, u_count: c.u_count, description: c.description ?? undefined })
    setError(null)
    setIsModalOpen(true)
  }

  const closeModal = () => { setIsModalOpen(false); setEditing(null); setError(null) }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.site_id) { setError('Nome e sede sono obbligatori'); return }
    if (editing) updateCabinet.mutate({ id: editing.id, data: form })
    else createCabinet.mutate(form)
  }

  const columns: Column<Cabinet>[] = [
    { key: 'name', header: 'Nome', sortable: true, render: (c) => <span className="font-medium text-gray-900">{c.name}</span> },
    { key: 'site', header: 'Sede', render: (c) => <span className="text-gray-600">{c.site?.name ?? '—'}</span> },
    { key: 'u_count', header: 'Dimensione', render: (c) => <span>{c.u_count}U</span> },
    { key: 'devices_count', header: 'Dispositivi', render: (c) => <span className="font-medium">{c.devices_count ?? 0}</span> },
    { key: 'description', header: 'Note', render: (c) => <span className="text-gray-500">{c.description ?? '—'}</span> },
  ]

  if (isAdmin()) {
    columns.push({
      key: 'actions', header: '',
      render: (c) => (
        <button onClick={(e) => { e.stopPropagation(); openEdit(c) }} className="text-xs text-primary-600 hover:underline">Modifica</button>
      ),
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Armadi</h1>
          <p className="text-sm text-gray-500 mt-1">Gestisci gli armadi rack</p>
        </div>
        {isAdmin() && (
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700">
            <Plus size={16} />Nuovo Armadio
          </button>
        )}
      </div>

      {isLoading ? <LoadingSpinner centered /> : (
        <>
          <Table columns={columns} data={data?.items ?? []} keyExtractor={(c) => c.id} onRowClick={(c) => navigate(`/armadi/${c.id}`)} emptyTitle="Nessun armadio" emptyDescription="Crea il primo armadio rack." />
          {data && <Pagination page={page} pages={data.pages} total={data.total} size={data.size} onPageChange={setPage} />}
        </>
      )}

      <Modal isOpen={isModalOpen} onClose={closeModal} title={editing ? 'Modifica armadio' : 'Nuovo armadio'} size="md"
        footer={
          <>
            <button onClick={closeModal} className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Annulla</button>
            <button onClick={handleSubmit} disabled={createCabinet.isPending || updateCabinet.isPending} className="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
              {createCabinet.isPending || updateCabinet.isPending ? 'Salvataggio...' : 'Salva'}
            </button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
            <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sede *</label>
            <select value={form.site_id} onChange={(e) => setForm((f) => ({ ...f, site_id: Number(e.target.value) }))} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value={0}>-- Seleziona sede --</option>
              {sitesData?.items.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dimensione (U)</label>
            <input type="number" min={1} max={100} value={form.u_count} onChange={(e) => setForm((f) => ({ ...f, u_count: Number(e.target.value) }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
            <input type="text" value={form.description ?? ''} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value || null }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
        </form>
      </Modal>
    </div>
  )
}

export default CabinetsPage
