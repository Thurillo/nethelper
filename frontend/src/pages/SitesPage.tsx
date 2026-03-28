import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Plus, Map, Network } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { sitesApi } from '../api/sites'
import { useAuthStore } from '../store/authStore'
import Table, { Column } from '../components/common/Table'
import Modal from '../components/common/Modal'
import LoadingSpinner from '../components/common/LoadingSpinner'
import Pagination from '../components/common/Pagination'
import type { Site, SiteCreate } from '../types'

const SitesPage: React.FC = () => {
  const navigate = useNavigate()
  const { isAdmin } = useAuthStore()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingSite, setEditingSite] = useState<Site | null>(null)
  const [form, setForm] = useState<SiteCreate>({ name: '', description: null, address: null })
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['sites', page],
    queryFn: () => sitesApi.list({ page, size: 20 }),
    staleTime: 30_000,
  })

  const createSite = useMutation({
    mutationFn: (data: SiteCreate) => sitesApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sites'] }); closeModal() },
    onError: () => setError('Errore durante il salvataggio'),
  })

  const updateSite = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<SiteCreate> }) => sitesApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sites'] }); closeModal() },
    onError: () => setError('Errore durante il salvataggio'),
  })

  const openCreate = () => {
    setEditingSite(null)
    setForm({ name: '', description: null, address: null })
    setError(null)
    setIsModalOpen(true)
  }

  const openEdit = (site: Site) => {
    setEditingSite(site)
    setForm({ name: site.name, description: site.description, address: site.address })
    setError(null)
    setIsModalOpen(true)
  }

  const closeModal = () => { setIsModalOpen(false); setEditingSite(null); setError(null) }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name) { setError('Il nome è obbligatorio'); return }
    if (editingSite) {
      updateSite.mutate({ id: editingSite.id, data: form })
    } else {
      createSite.mutate(form)
    }
  }

  const columns: Column<Site>[] = [
    { key: 'name', header: 'Nome', sortable: true, render: (s) => <span className="font-medium text-gray-900">{s.name}</span> },
    { key: 'description', header: 'Descrizione', render: (s) => <span className="text-gray-500">{s.description ?? '—'}</span> },
    { key: 'address', header: 'Indirizzo', render: (s) => <span className="text-gray-500">{s.address ?? '—'}</span> },
    { key: 'cabinets_count', header: 'Armadi', render: (s) => <span className="font-medium">{s.cabinets_count ?? 0}</span> },
  ]

  columns.push({
    key: 'map_action',
    header: '',
    render: (s) => (
      <div className="flex items-center gap-3">
        <Link
          to={`/sedi/${s.id}/mappa`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-primary-600 transition-colors"
          title="Planimetria"
        >
          <Map size={13} />
          Mappa
          {s.has_floor_plan && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />}
        </Link>
        <Link
          to={`/sedi/${s.id}/rete`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-primary-600 transition-colors"
          title="Diagramma di rete"
        >
          <Network size={13} />
          Rete
        </Link>
      </div>
    ),
  })

  if (isAdmin()) {
    columns.push({
      key: 'actions',
      header: '',
      render: (s) => (
        <button
          onClick={(e) => { e.stopPropagation(); openEdit(s) }}
          className="text-xs text-primary-600 hover:underline"
        >
          Modifica
        </button>
      ),
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sedi</h1>
          <p className="text-sm text-gray-500 mt-1">Gestisci le sedi dell'infrastruttura</p>
        </div>
        {isAdmin() && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700"
          >
            <Plus size={16} />
            Nuova Sede
          </button>
        )}
      </div>

      {isLoading ? (
        <LoadingSpinner centered />
      ) : (
        <>
          <Table
            columns={columns}
            data={data?.items ?? []}
            keyExtractor={(s) => s.id}
            onRowClick={(s) => navigate(`/armadi?site_id=${s.id}`)}
            emptyTitle="Nessuna sede"
            emptyDescription="Crea la prima sede per iniziare."
          />
          {data && (
            <Pagination page={page} pages={data.pages} total={data.total} size={data.size} onPageChange={setPage} />
          )}
        </>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingSite ? 'Modifica sede' : 'Nuova sede'}
        size="md"
        footer={
          <>
            <button onClick={closeModal} className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Annulla</button>
            <button onClick={handleSubmit} disabled={createSite.isPending || updateSite.isPending} className="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
              {createSite.isPending || updateSite.isPending ? 'Salvataggio...' : 'Salva'}
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrizione</label>
            <input type="text" value={form.description ?? ''} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value || null }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Indirizzo</label>
            <input type="text" value={form.address ?? ''} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value || null }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
        </form>
      </Modal>
    </div>
  )
}

export default SitesPage
