import React, { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { prefixesApi } from '../api/prefixes'
import { ipAddressesApi } from '../api/ipAddresses'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Badge } from '../components/common/Badge'
import Modal from '../components/common/Modal'
import Pagination from '../components/common/Pagination'
import LoadingSpinner from '../components/common/LoadingSpinner'
import type { IpAddressCreate } from '../types'

const PrefixDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const prefixId = Number(id)
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [isAddModal, setIsAddModal] = useState(false)
  const [addForm, setAddForm] = useState<IpAddressCreate>({ address: '', status: 'active' })
  const [addError, setAddError] = useState<string | null>(null)

  const { data: prefix, isLoading } = useQuery({
    queryKey: ['prefixes', prefixId],
    queryFn: () => prefixesApi.get(prefixId),
    staleTime: 30_000,
  })

  const { data: ipData, isLoading: loadingIps } = useQuery({
    queryKey: ['prefixes', prefixId, 'ip-addresses', page],
    queryFn: () => prefixesApi.getIpAddresses(prefixId, { page, size: 20 }),
    staleTime: 30_000,
  })

  const { data: availableIps } = useQuery({
    queryKey: ['prefixes', prefixId, 'available-ips'],
    queryFn: () => prefixesApi.getAvailableIps(prefixId, 20),
    staleTime: 60_000,
  })

  const createIp = useMutation({
    mutationFn: (d: IpAddressCreate) => ipAddressesApi.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prefixes', prefixId] })
      setIsAddModal(false)
      setAddForm({ address: '', status: 'active' })
      setAddError(null)
    },
    onError: () => setAddError('Errore durante il salvataggio'),
  })

  const handleAddIp = (e: React.FormEvent) => {
    e.preventDefault()
    if (!addForm.address) { setAddError('Indirizzo obbligatorio'); return }
    createIp.mutate({ ...addForm, prefix_id: prefixId })
  }

  if (isLoading) return <LoadingSpinner centered />
  if (!prefix) return <div className="text-center text-gray-500 py-12">Prefisso non trovato</div>

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <Link to="/prefissi" className="hover:text-gray-700">Prefissi IP</Link>
        <span>/</span>
        <span className="text-gray-900 font-mono">{prefix.prefix}</span>
      </nav>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold font-mono text-gray-900">{prefix.prefix}</h1>
              <Badge variant={prefix.status === 'active' ? 'green' : prefix.status === 'deprecated' ? 'red' : 'gray'}>{prefix.status}</Badge>
              {prefix.is_pool && <Badge variant="indigo">Pool</Badge>}
              {prefix.vlan && <Badge variant="blue">VLAN {prefix.vlan.vid} — {prefix.vlan.name}</Badge>}
            </div>
            <p className="text-sm text-gray-500 mt-1">
              {prefix.site?.name ?? 'Nessuna sede'}
              {prefix.description ? ` — ${prefix.description}` : ''}
            </p>
          </div>
          <button
            onClick={() => setIsAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700"
          >
            <Plus size={16} />
            Aggiungi IP
          </button>
        </div>

        {/* Utilization bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
            <span>{prefix.used_ips} usati su {prefix.total_ips} totali</span>
            <span className="font-semibold">{prefix.utilization_percent.toFixed(1)}%</span>
          </div>
          <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${prefix.utilization_percent > 90 ? 'bg-red-500' : prefix.utilization_percent > 70 ? 'bg-yellow-500' : 'bg-green-500'}`}
              style={{ width: `${Math.min(prefix.utilization_percent, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* IP Addresses */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Indirizzi IP assegnati</h3>
        </div>
        {loadingIps ? <LoadingSpinner centered /> : (
          <>
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Indirizzo</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">DNS</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Dispositivo</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Stato</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Sorgente</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Ultimo visto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ipData?.items.map((ip) => (
                  <tr key={ip.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-mono font-medium text-gray-900">{ip.address}</td>
                    <td className="px-5 py-3 text-gray-500">{ip.dns_name ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-600">{ip.device?.name ?? '—'}</td>
                    <td className="px-5 py-3"><Badge variant={ip.status === 'active' ? 'green' : 'gray'}>{ip.status}</Badge></td>
                    <td className="px-5 py-3 text-gray-500 text-xs">{ip.source}</td>
                    <td className="px-5 py-3 text-gray-400 text-xs">{ip.last_seen ? format(new Date(ip.last_seen), 'dd/MM HH:mm', { locale: it }) : '—'}</td>
                  </tr>
                ))}
                {ipData?.items.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-500 text-sm">Nessun indirizzo assegnato</td></tr>
                )}
              </tbody>
            </table>
            {ipData && <Pagination page={page} pages={ipData.pages} total={ipData.total} size={ipData.size} onPageChange={setPage} />}
          </>
        )}
      </div>

      {/* Available IPs */}
      {availableIps && availableIps.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-3">IP disponibili (primi {availableIps.length})</h3>
          <div className="flex flex-wrap gap-2">
            {availableIps.map((ip) => (
              <button
                key={ip}
                onClick={() => { setAddForm({ address: ip, status: 'active', prefix_id: prefixId }); setIsAddModal(true) }}
                className="font-mono text-xs px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded hover:bg-green-100"
              >
                {ip}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Add IP modal */}
      <Modal isOpen={isAddModal} onClose={() => { setIsAddModal(false); setAddError(null) }} title="Aggiungi indirizzo IP" size="md"
        footer={
          <>
            <button onClick={() => { setIsAddModal(false); setAddError(null) }} className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Annulla</button>
            <button onClick={handleAddIp} disabled={createIp.isPending} className="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
              {createIp.isPending ? 'Salvataggio...' : 'Aggiungi'}
            </button>
          </>
        }
      >
        <form onSubmit={handleAddIp} className="space-y-4">
          {addError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{addError}</p>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Indirizzo IP *</label>
            <input type="text" value={addForm.address} onChange={(e) => setAddForm((f) => ({ ...f, address: e.target.value }))} placeholder="192.168.1.10" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">DNS</label>
            <input type="text" value={addForm.dns_name ?? ''} onChange={(e) => setAddForm((f) => ({ ...f, dns_name: e.target.value || null }))} placeholder="host.example.com" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
            <input type="text" value={addForm.notes ?? ''} onChange={(e) => setAddForm((f) => ({ ...f, notes: e.target.value || null }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
        </form>
      </Modal>
    </div>
  )
}

export default PrefixDetailPage
