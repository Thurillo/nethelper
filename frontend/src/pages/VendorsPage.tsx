import React, { useState } from 'react'
import { Plus, Eye, EyeOff } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { vendorsApi } from '../api/vendors'
import { useAuthStore } from '../store/authStore'
import { Navigate } from 'react-router-dom'
import Table, { Column } from '../components/common/Table'
import Modal from '../components/common/Modal'
import Pagination from '../components/common/Pagination'
import LoadingSpinner from '../components/common/LoadingSpinner'
import type { Vendor, VendorCreate } from '../types'

const VendorsPage: React.FC = () => {
  const { isAdmin } = useAuthStore()
  if (!isAdmin()) return <Navigate to="/" replace />

  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editing, setEditing] = useState<Vendor | null>(null)
  const [form, setForm] = useState<VendorCreate>({ name: '', slug: '', snmp_version_default: 2, ssh_port_default: 22 })
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['vendors', page],
    queryFn: () => vendorsApi.list({ page, size: 20 }),
    staleTime: 30_000,
  })

  const createVendor = useMutation({
    mutationFn: (d: VendorCreate) => vendorsApi.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vendors'] }); closeModal() },
    onError: () => setError('Errore durante il salvataggio'),
  })

  const updateVendor = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<VendorCreate> }) => vendorsApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vendors'] }); closeModal() },
    onError: () => setError('Errore durante il salvataggio'),
  })

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', slug: '', snmp_version_default: 2, ssh_port_default: 22 })
    setError(null)
    setIsModalOpen(true)
  }

  const openEdit = (v: Vendor) => {
    setEditing(v)
    setForm({
      name: v.name, slug: v.slug, driver: v.driver ?? undefined,
      snmp_community_default: v.snmp_community_default ?? undefined,
      snmp_version_default: v.snmp_version_default,
      ssh_username_default: v.ssh_username_default ?? undefined,
      ssh_port_default: v.ssh_port_default,
    })
    setError(null)
    setIsModalOpen(true)
  }

  const closeModal = () => { setIsModalOpen(false); setEditing(null); setError(null); setShowPassword(false) }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.slug) { setError('Nome e slug sono obbligatori'); return }
    if (editing) updateVendor.mutate({ id: editing.id, data: form })
    else createVendor.mutate(form)
  }

  const autoSlug = (name: string) => name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

  const columns: Column<Vendor>[] = [
    { key: 'name', header: 'Nome', sortable: true, render: (v) => <span className="font-medium text-gray-900">{v.name}</span> },
    { key: 'slug', header: 'Slug', render: (v) => <span className="font-mono text-xs text-gray-600">{v.slug}</span> },
    { key: 'driver', header: 'Driver', render: (v) => <span className="text-gray-500 text-xs">{v.driver ?? '—'}</span> },
    { key: 'snmp_community_default', header: 'Community SNMP', render: (v) => <span className="text-gray-500 text-xs">{v.snmp_community_default ?? '—'}</span> },
    { key: 'ssh_username_default', header: 'Utente SSH', render: (v) => <span className="text-gray-500 text-xs">{v.ssh_username_default ?? '—'}</span> },
    { key: 'ssh_password_default', header: 'Password SSH', render: (_v) => <span className="text-gray-300">●●●●●</span> },
    { key: 'actions', header: '', render: (v) => <button onClick={(e) => { e.stopPropagation(); openEdit(v) }} className="text-xs text-primary-600 hover:underline">Modifica</button> },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vendor</h1>
          <p className="text-sm text-gray-500 mt-1">Gestisci i vendor dei dispositivi</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700">
          <Plus size={16} />Nuovo Vendor
        </button>
      </div>

      {isLoading ? <LoadingSpinner centered /> : (
        <>
          <Table columns={columns} data={data?.items ?? []} keyExtractor={(v) => v.id} emptyTitle="Nessun vendor" emptyDescription="Aggiungi i vendor dei dispositivi." />
          {data && <Pagination page={page} pages={data.pages} total={data.total} size={data.size} onPageChange={setPage} />}
        </>
      )}

      <Modal isOpen={isModalOpen} onClose={closeModal} title={editing ? 'Modifica vendor' : 'Nuovo vendor'} size="lg"
        footer={
          <>
            <button onClick={closeModal} className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Annulla</button>
            <button onClick={handleSubmit} disabled={createVendor.isPending || updateVendor.isPending} className="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
              {createVendor.isPending || updateVendor.isPending ? 'Salvataggio...' : 'Salva'}
            </button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
              <input type="text" value={form.name} onChange={(e) => { const name = e.target.value; setForm((f) => ({ ...f, name, slug: autoSlug(name) })) }} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Slug *</label>
              <input type="text" value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Driver</label>
              <input type="text" value={form.driver ?? ''} onChange={(e) => setForm((f) => ({ ...f, driver: e.target.value || undefined }))} placeholder="es. cisco_ios" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Community SNMP default</label>
              <input type="text" value={form.snmp_community_default ?? ''} onChange={(e) => setForm((f) => ({ ...f, snmp_community_default: e.target.value || undefined }))} placeholder="public" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Versione SNMP default</label>
              <select value={form.snmp_version_default} onChange={(e) => setForm((f) => ({ ...f, snmp_version_default: Number(e.target.value) }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                <option value={1}>v1</option>
                <option value={2}>v2c</option>
                <option value={3}>v3</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username SSH default</label>
              <input type="text" value={form.ssh_username_default ?? ''} onChange={(e) => setForm((f) => ({ ...f, ssh_username_default: e.target.value || undefined }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password SSH default</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.ssh_password_default ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, ssh_password_default: e.target.value || undefined }))}
                  autoComplete="new-password"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Porta SSH default</label>
              <input type="number" min={1} max={65535} value={form.ssh_port_default} onChange={(e) => setForm((f) => ({ ...f, ssh_port_default: Number(e.target.value) }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
          </div>
        </form>
      </Modal>
    </div>
  )
}

export default VendorsPage
