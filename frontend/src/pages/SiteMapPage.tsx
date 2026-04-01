import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Upload, Trash2, MapPin, Save, Server, Network } from 'lucide-react'
import { sitesApi } from '../api/sites'
import { cabinetsApi } from '../api/cabinets'
import { useAuthStore } from '../store/authStore'
import LoadingSpinner from '../components/common/LoadingSpinner'
import type { Cabinet } from '../types'

/* ── Draggable cabinet marker ── */
interface MarkerProps {
  cabinet: Cabinet
  pct: { x: number; y: number }
  onDragEnd: (id: number, x: number, y: number) => void
  containerRef: React.MutableRefObject<HTMLDivElement | null>
  isAdmin: boolean
}

const CabinetMarker: React.FC<MarkerProps> = ({ cabinet, pct, onDragEnd, containerRef, isAdmin }) => {
  const markerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (!isAdmin) return
    e.preventDefault()
    dragging.current = true

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const x = Math.max(0, Math.min(100, ((ev.clientX - rect.left) / rect.width) * 100))
      const y = Math.max(0, Math.min(100, ((ev.clientY - rect.top) / rect.height) * 100))
      if (markerRef.current) {
        markerRef.current.style.left = `${x}%`
        markerRef.current.style.top = `${y}%`
      }
    }

    const onUp = (ev: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return
      dragging.current = false
      const rect = containerRef.current.getBoundingClientRect()
      const x = Math.max(0, Math.min(100, ((ev.clientX - rect.left) / rect.width) * 100))
      const y = Math.max(0, Math.min(100, ((ev.clientY - rect.top) / rect.height) * 100))
      onDragEnd(cabinet.id, x, y)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [cabinet.id, containerRef, isAdmin, onDragEnd])

  return (
    <div
      ref={markerRef}
      onMouseDown={onMouseDown}
      style={{ left: `${pct.x}%`, top: `${pct.y}%` }}
      className="absolute -translate-x-1/2 -translate-y-1/2 group z-10"
      title={cabinet.name}
    >
      <div className={`
        flex flex-col items-center gap-0.5
        ${isAdmin ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}
      `}>
        <div className="w-8 h-8 rounded-lg bg-primary-600 border-2 border-white shadow-md flex items-center justify-center">
          <Server size={14} className="text-white" />
        </div>
        <div className="bg-gray-900/80 text-white text-[10px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap max-w-[80px] truncate">
          {cabinet.name}
        </div>
      </div>
    </div>
  )
}

/* ── Page ── */
const SiteMapPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const siteId = Number(id)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { isAdmin } = useAuthStore()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [positions, setPositions] = useState<Record<number, { x: number; y: number }>>({})
  const [dirty, setDirty] = useState(false)
  const [floorPlanUrl, setFloorPlanUrl] = useState<string | null>(null)

  const { data: site, isLoading: siteLoading } = useQuery({
    queryKey: ['sites', siteId],
    queryFn: () => sitesApi.get(siteId),
  })

  const { data: cabinets = [], isLoading: cabinetsLoading } = useQuery({
    queryKey: ['sites', siteId, 'cabinets'],
    queryFn: () => sitesApi.getCabinets(siteId),
    enabled: !!siteId,
  })

  // Load floor plan image
  const { data: floorPlanData } = useQuery({
    queryKey: ['sites', siteId, 'floor-plan'],
    queryFn: () => sitesApi.getFloorPlan(siteId),
    enabled: !!site?.has_floor_plan,
    retry: false,
  })

  useEffect(() => {
    if (floorPlanData) setFloorPlanUrl(floorPlanData.floor_plan)
  }, [floorPlanData])

  // Initialize positions from cabinet data
  useEffect(() => {
    if (!cabinets.length) return
    const initial: Record<number, { x: number; y: number }> = {}
    cabinets.forEach((c) => {
      initial[c.id] = { x: c.map_x ?? 50, y: c.map_y ?? 50 }
    })
    setPositions(initial)
  }, [cabinets])

  const uploadMutation = useMutation({
    mutationFn: ({ floorPlan, name }: { floorPlan: string; name: string }) =>
      sitesApi.uploadFloorPlan(siteId, floorPlan, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sites', siteId] })
      qc.invalidateQueries({ queryKey: ['sites', siteId, 'floor-plan'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => sitesApi.deleteFloorPlan(siteId),
    onSuccess: () => {
      setFloorPlanUrl(null)
      qc.invalidateQueries({ queryKey: ['sites', siteId] })
      qc.invalidateQueries({ queryKey: ['sites', siteId, 'floor-plan'] })
    },
  })

  const savePositionMutation = useMutation({
    mutationFn: ({ cabinetId, x, y }: { cabinetId: number; x: number; y: number }) =>
      cabinetsApi.update(cabinetId, { map_x: x, map_y: y }),
  })

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const result = ev.target?.result as string
      setFloorPlanUrl(result)
      uploadMutation.mutate({ floorPlan: result, name: file.name })
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleDragEnd = (id: number, x: number, y: number) => {
    setPositions((prev) => ({ ...prev, [id]: { x, y } }))
    setDirty(true)
  }

  const handleSavePositions = async () => {
    const mutations = Object.entries(positions).map(([idStr, { x, y }]) =>
      savePositionMutation.mutateAsync({ cabinetId: Number(idStr), x, y })
    )
    await Promise.all(mutations)
    setDirty(false)
    qc.invalidateQueries({ queryKey: ['sites', siteId, 'cabinets'] })
  }

  if (siteLoading || cabinetsLoading) return <LoadingSpinner centered />

  const admin = isAdmin()

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/sedi')}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">{site?.name} — Planimetria</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {cabinets.length} armad{cabinets.length === 1 ? 'o' : 'i'} · trascina per riposizionare
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/sedi/${siteId}/rete`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Network size={15} />
            Diagramma di rete
          </Link>
          {dirty && (
            <button
              onClick={handleSavePositions}
              disabled={savePositionMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              <Save size={14} />
              {savePositionMutation.isPending ? 'Salvataggio...' : 'Salva posizioni'}
            </button>
          )}
          {admin && floorPlanUrl && (
            <button
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 size={14} />
              Rimuovi planimetria
            </button>
          )}
          {admin && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                <Upload size={14} />
                {floorPlanUrl ? 'Sostituisci' : 'Carica planimetria'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Map area */}
      <div className="card overflow-hidden">
        {floorPlanUrl ? (
          <div ref={containerRef} className="relative select-none" style={{ userSelect: 'none' }}>
            <img
              src={floorPlanUrl}
              alt="Planimetria"
              className="w-full h-auto block"
              draggable={false}
            />
            {cabinets.map((cabinet) => {
              const pos = positions[cabinet.id] ?? { x: 50, y: 50 }
              return (
                <CabinetMarker
                  key={cabinet.id}
                  cabinet={cabinet}
                  pct={pos}
                  onDragEnd={handleDragEnd}
                  containerRef={containerRef}
                  isAdmin={admin}
                />
              )
            })}
            {admin && cabinets.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-white/80 backdrop-blur rounded-xl p-4 text-center">
                  <MapPin size={24} className="mx-auto text-gray-400 mb-2" />
                  <p className="text-sm text-gray-600">Nessun armadio in questa sede</p>
                  <Link to="/armadi" className="text-xs text-primary-600 hover:underline">Crea un armadio</Link>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <MapPin size={28} className="text-gray-400" />
            </div>
            <h2 className="font-semibold text-gray-900 mb-1">Nessuna planimetria caricata</h2>
            <p className="text-sm text-gray-500 mb-4 max-w-sm">
              Carica un'immagine della planimetria della sede per posizionare gli armadi rack sulla mappa.
            </p>
            {admin && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700"
                >
                  <Upload size={16} />
                  Carica planimetria
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Cabinet legend */}
      {cabinets.length > 0 && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Armadi in questa sede</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {cabinets.map((c) => (
              <Link
                key={c.id}
                to={`/armadi/${c.id}`}
                className="flex items-center gap-2 p-2 rounded-lg border border-gray-100 hover:bg-gray-50 hover:border-primary-200 transition-colors"
              >
                <div className="w-6 h-6 rounded bg-primary-100 flex items-center justify-center flex-shrink-0">
                  <Server size={12} className="text-primary-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-900 truncate">{c.name}</p>
                  {c.devices_count !== undefined && (
                    <p className="text-[10px] text-gray-400">{c.devices_count} dispositivi</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default SiteMapPage
