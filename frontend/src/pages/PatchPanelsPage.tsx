import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Grid3X3 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { patchPanelsApi } from '../api/patchPanels'
import LoadingSpinner from '../components/common/LoadingSpinner'
import EmptyState from '../components/common/EmptyState'
import Pagination from '../components/common/Pagination'

const PatchPanelsPage: React.FC = () => {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['patch-panels', page],
    queryFn: () => patchPanelsApi.list({ page, size: 20 }),
    staleTime: 30_000,
  })

  if (isLoading) return <LoadingSpinner centered />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Patch Panel</h1>
        <p className="text-sm text-gray-500 mt-1">Gestisci le porte dei patch panel</p>
      </div>

      {data?.items.length === 0 ? (
        <EmptyState
          icon={<Grid3X3 size={48} />}
          title="Nessun patch panel"
          description="Aggiungi dispositivi di tipo 'Patch Panel' per gestirli qui."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data?.items.map((pp) => (
              <div
                key={pp.id}
                onClick={() => navigate(`/patch-panel/${pp.id}`)}
                className="bg-white rounded-xl border border-gray-200 p-5 cursor-pointer hover:shadow-md hover:border-gray-300 transition-all"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">{pp.name}</h3>
                    <p className="text-sm text-gray-500 mt-0.5">{pp.cabinet?.name ?? '—'}</p>
                    <p className="text-xs text-gray-400">{pp.cabinet?.site?.name ?? '—'}</p>
                  </div>
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <Grid3X3 size={20} className="text-gray-500" />
                  </div>
                </div>
                <div className="mt-3 text-xs text-gray-500">
                  {pp.primary_ip && <p className="font-mono">{pp.primary_ip}</p>}
                  {pp.model && <p>{pp.model}</p>}
                </div>
              </div>
            ))}
          </div>
          {data && <Pagination page={page} pages={data.pages} total={data.total} size={data.size} onPageChange={setPage} />}
        </>
      )}
    </div>
  )
}

export default PatchPanelsPage
