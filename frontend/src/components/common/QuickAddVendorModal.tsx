import React, { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2 } from 'lucide-react'
import { vendorsApi } from '../../api/vendors'
import type { VendorCreate } from '../../types'

const autoSlug = (name: string) =>
  name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

const QuickAddVendorModal: React.FC<{
  isOpen: boolean
  onClose: () => void
  onCreated?: (name: string) => void
}> = ({ isOpen, onClose, onCreated }) => {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [error, setError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: (data: VendorCreate) => vendorsApi.create(data),
    onSuccess: (vendor) => {
      qc.invalidateQueries({ queryKey: ['vendors'] })
      onCreated?.(vendor.name)
      handleClose()
    },
    onError: () => setError('Errore durante il salvataggio. Verifica che lo slug non esista già.'),
  })

  const handleClose = () => {
    setName('')
    setSlug('')
    setError(null)
    onClose()
  }

  const handleNameChange = (val: string) => {
    setName(val)
    setSlug(autoSlug(val))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !slug.trim()) {
      setError('Nome e slug sono obbligatori')
      return
    }
    create.mutate({
      name: name.trim(),
      slug: slug.trim(),
      snmp_version_default: 2,
      ssh_port_default: 22,
    })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary-50">
            <Building2 size={16} className="text-primary-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-gray-900">Aggiungi vendor</h2>
            <p className="text-xs text-gray-500 mt-0.5">Puoi aggiungere i dettagli SSH/SNMP in seguito</p>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4 space-y-4">
            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
              <input
                type="text"
                value={name}
                onChange={e => handleNameChange(e.target.value)}
                placeholder="es. TP-Link Systems Inc"
                autoFocus
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Slug *</label>
              <input
                type="text"
                value={slug}
                onChange={e => setSlug(e.target.value)}
                placeholder="es. tp-link"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <p className="text-xs text-gray-400 mt-1">Identificatore univoco — generato automaticamente dal nome</p>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={create.isPending}
              className="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {create.isPending ? 'Salvataggio...' : 'Aggiungi vendor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default QuickAddVendorModal
