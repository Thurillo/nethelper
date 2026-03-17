import React, { useState } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usersApi } from '../api/users'
import { useAuthStore } from '../store/authStore'
import { Navigate } from 'react-router-dom'
import Table, { Column } from '../components/common/Table'
import Modal from '../components/common/Modal'
import Pagination from '../components/common/Pagination'
import LoadingSpinner from '../components/common/LoadingSpinner'
import { UserRoleBadge } from '../components/common/Badge'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import type { User, UserCreate, UserRole } from '../types'

const UsersPage: React.FC = () => {
  const { isAdmin } = useAuthStore()
  if (!isAdmin()) return <Navigate to="/" replace />

  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [isCreateModal, setIsCreateModal] = useState(false)
  const [resetModal, setResetModal] = useState<User | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [form, setForm] = useState<UserCreate>({ username: '', email: '', password: '', role: 'viewer' })
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['users', page],
    queryFn: () => usersApi.list({ page, size: 20 }),
    staleTime: 30_000,
  })

  const createUser = useMutation({
    mutationFn: (d: UserCreate) => usersApi.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setIsCreateModal(false); setForm({ username: '', email: '', password: '', role: 'viewer' }); setError(null) },
    onError: () => setError('Errore durante la creazione. Verifica che username e email siano unici.'),
  })

  const updateUser = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { is_active?: boolean; role?: UserRole } }) => usersApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })

  const resetPassword = useMutation({
    mutationFn: ({ id, password }: { id: number; password: string }) => usersApi.resetPassword(id, password),
    onSuccess: () => { setResetModal(null); setNewPassword('') },
    onError: () => setError('Errore durante il reset della password'),
  })

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.username || !form.email || !form.password) { setError('Tutti i campi sono obbligatori'); return }
    createUser.mutate(form)
  }

  const columns: Column<User>[] = [
    { key: 'username', header: 'Username', render: (u) => <span className="font-medium text-gray-900">{u.username}</span> },
    { key: 'email', header: 'Email', render: (u) => <span className="text-gray-600">{u.email}</span> },
    { key: 'role', header: 'Ruolo', render: (u) => <UserRoleBadge role={u.role} /> },
    { key: 'is_active', header: 'Attivo', render: (u) => (
      <button
        onClick={(e) => { e.stopPropagation(); updateUser.mutate({ id: u.id, data: { is_active: !u.is_active } }) }}
        className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${u.is_active ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
      >
        {u.is_active ? 'Attivo' : 'Disattivo'}
      </button>
    )},
    { key: 'last_login', header: 'Ultimo accesso', render: (u) => <span className="text-gray-400 text-xs">{u.last_login ? format(new Date(u.last_login), 'dd/MM/yyyy HH:mm', { locale: it }) : '—'}</span> },
    { key: 'actions', header: '', render: (u) => (
      <div className="flex gap-2">
        <select
          value={u.role}
          onChange={(e) => updateUser.mutate({ id: u.id, data: { role: e.target.value as UserRole } })}
          onClick={(e) => e.stopPropagation()}
          className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500"
        >
          <option value="viewer">Viewer</option>
          <option value="operator">Operator</option>
          <option value="admin">Admin</option>
        </select>
        <button onClick={(e) => { e.stopPropagation(); setResetModal(u) }} className="text-xs text-orange-500 hover:underline flex items-center gap-1"><RefreshCw size={10} />Reset PW</button>
      </div>
    )},
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Utenti</h1>
          <p className="text-sm text-gray-500 mt-1">Gestisci gli account utente</p>
        </div>
        <button onClick={() => setIsCreateModal(true)} className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700">
          <Plus size={16} />Nuovo Utente
        </button>
      </div>

      {isLoading ? <LoadingSpinner centered /> : (
        <>
          <Table columns={columns} data={data?.items ?? []} keyExtractor={(u) => u.id} emptyTitle="Nessun utente" />
          {data && <Pagination page={page} pages={data.pages} total={data.total} size={data.size} onPageChange={setPage} />}
        </>
      )}

      {/* Create user modal */}
      <Modal isOpen={isCreateModal} onClose={() => { setIsCreateModal(false); setError(null) }} title="Nuovo utente" size="md"
        footer={
          <>
            <button onClick={() => { setIsCreateModal(false); setError(null) }} className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Annulla</button>
            <button onClick={handleCreate} disabled={createUser.isPending} className="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
              {createUser.isPending ? 'Creazione...' : 'Crea utente'}
            </button>
          </>
        }
      >
        <form onSubmit={handleCreate} className="space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username *</label>
            <input type="text" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
            <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
            <input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required autoComplete="new-password" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ruolo</label>
            <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as UserRole }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="viewer">Visualizzatore</option>
              <option value="operator">Operatore</option>
              <option value="admin">Amministratore</option>
            </select>
          </div>
        </form>
      </Modal>

      {/* Reset password modal */}
      <Modal isOpen={!!resetModal} onClose={() => { setResetModal(null); setNewPassword(''); setError(null) }} title={`Reset password — ${resetModal?.username}`} size="sm"
        footer={
          <>
            <button onClick={() => { setResetModal(null); setNewPassword('') }} className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Annulla</button>
            <button onClick={() => { if (resetModal && newPassword) resetPassword.mutate({ id: resetModal.id, password: newPassword }) }} disabled={!newPassword || resetPassword.isPending} className="px-4 py-2 text-sm text-white bg-orange-500 rounded-lg hover:bg-orange-600 disabled:opacity-50">
              {resetPassword.isPending ? 'Reset...' : 'Reimposta password'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
          <label className="block text-sm font-medium text-gray-700 mb-1">Nuova password</label>
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
      </Modal>
    </div>
  )
}

export default UsersPage
