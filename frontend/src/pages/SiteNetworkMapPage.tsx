import React, { memo, useCallback, useMemo, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  type Node,
  type Edge,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ArrowLeft, Save, Network, ChevronDown, ChevronRight } from 'lucide-react'
import { sitesApi } from '../api/sites'
import { cabinetsApi } from '../api/cabinets'
import { devicesApi } from '../api/devices'
import { topologyApi } from '../api/topology'
import { checkmkApi } from '../api/checkmk'
import { useAuthStore } from '../store/authStore'
import CheckMKBadge from '../components/common/CheckMKBadge'
import LoadingSpinner from '../components/common/LoadingSpinner'
import type { DeviceType, TopologyNode, CheckMKStatus, Device, Cabinet } from '../types'

// ─── Constants ────────────────────────────────────────────────────────────────

const CANVAS_W = 2000
const CANVAS_H = 1200

const DEVICE_LABELS: Record<string, string> = {
  switch: 'Switch',
  router: 'Router',
  access_point: 'Access Point',
  server: 'Server',
  patch_panel: 'Patch Panel',
  pdu: 'PDU',
  firewall: 'Firewall',
  ups: 'UPS',
  unmanaged_switch: 'Switch non gestito',
  workstation: 'Workstation',
  printer: 'Stampante',
  camera: 'Telecamera',
  phone: 'Telefono',
  other: 'Altro',
}

const DEVICE_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  switch:           { bg: 'bg-blue-50',   border: 'border-blue-400',   text: 'text-blue-900',   dot: 'bg-blue-400'   },
  router:           { bg: 'bg-green-50',  border: 'border-green-400',  text: 'text-green-900',  dot: 'bg-green-400'  },
  access_point:     { bg: 'bg-purple-50', border: 'border-purple-400', text: 'text-purple-900', dot: 'bg-purple-400' },
  server:           { bg: 'bg-orange-50', border: 'border-orange-400', text: 'text-orange-900', dot: 'bg-orange-400' },
  patch_panel:      { bg: 'bg-gray-50',   border: 'border-gray-400',   text: 'text-gray-700',   dot: 'bg-gray-400'   },
  pdu:              { bg: 'bg-yellow-50', border: 'border-yellow-400', text: 'text-yellow-900', dot: 'bg-yellow-400' },
  firewall:         { bg: 'bg-red-50',    border: 'border-red-400',    text: 'text-red-900',    dot: 'bg-red-400'    },
  ups:              { bg: 'bg-yellow-50', border: 'border-yellow-300', text: 'text-yellow-800', dot: 'bg-yellow-300' },
  unmanaged_switch: { bg: 'bg-indigo-50', border: 'border-indigo-400', text: 'text-indigo-900', dot: 'bg-indigo-400' },
  workstation:      { bg: 'bg-teal-50',   border: 'border-teal-400',   text: 'text-teal-900',   dot: 'bg-teal-400'   },
  printer:          { bg: 'bg-pink-50',   border: 'border-pink-400',   text: 'text-pink-900',   dot: 'bg-pink-400'   },
  camera:           { bg: 'bg-lime-50',   border: 'border-lime-400',   text: 'text-lime-900',   dot: 'bg-lime-400'   },
  phone:            { bg: 'bg-teal-50',   border: 'border-teal-300',   text: 'text-teal-800',   dot: 'bg-teal-300'   },
  other:            { bg: 'bg-gray-50',   border: 'border-gray-400',   text: 'text-gray-700',   dot: 'bg-gray-400'   },
}

const ALL_DEVICE_TYPES = Object.keys(DEVICE_LABELS) as DeviceType[]

// ─── Custom node: floor plan image ────────────────────────────────────────────

interface FloorPlanNodeData extends Record<string, unknown> { imageUrl: string }

const FloorPlanNode = memo(({ data }: { data: FloorPlanNodeData }) => (
  <img
    src={data.imageUrl}
    style={{ width: CANVAS_W, height: CANVAS_H, display: 'block', pointerEvents: 'none', userSelect: 'none' }}
    draggable={false}
    alt="Planimetria"
  />
))
FloorPlanNode.displayName = 'FloorPlanNode'

// ─── Custom node: cabinet ─────────────────────────────────────────────────────

interface CabinetNodeData extends Record<string, unknown> {
  id: number
  name: string
  deviceCount: number
  collapsed: boolean
  onToggle: (id: number) => void
}

const CabinetNode = memo(({ data }: { data: CabinetNodeData }) => (
  <div className="border-2 border-gray-400 rounded-lg bg-white/95 shadow-md" style={{ minWidth: 140 }}>
    <div
      className="flex items-center justify-between px-2 py-1.5 bg-gray-100 rounded-t-[6px] cursor-pointer hover:bg-gray-200 select-none"
      onClick={() => data.onToggle(data.id)}
    >
      <span className="font-semibold text-xs text-gray-800 truncate">{data.name}</span>
      {data.collapsed
        ? <ChevronRight size={12} className="text-gray-500 flex-shrink-0 ml-1" />
        : <ChevronDown size={12} className="text-gray-500 flex-shrink-0 ml-1" />}
    </div>
    <div className="px-2 py-1 text-xs text-gray-500">
      {data.deviceCount} dispositiv{data.deviceCount === 1 ? 'o' : 'i'}
    </div>
  </div>
))
CabinetNode.displayName = 'CabinetNode'

// ─── Custom node: device ──────────────────────────────────────────────────────

interface DeviceNodeData extends Record<string, unknown> {
  label: string
  device_type: string
  primary_ip: string | null
  status: string
  checkmk_status: CheckMKStatus | null
  device_id: number
  onSelect: (id: number) => void
}

const DeviceNode = memo(({ data, selected }: { data: DeviceNodeData; selected: boolean }) => {
  const c = DEVICE_COLORS[data.device_type] ?? DEVICE_COLORS.other
  const isInactive = data.status === 'inactive' || data.status === 'decommissioned'
  return (
    <div
      className={`rounded-lg border-2 px-2.5 py-1.5 text-xs shadow-sm cursor-pointer
        ${c.bg} ${c.border} ${c.text}
        ${selected ? 'ring-2 ring-primary-500 ring-offset-1' : ''}
        ${isInactive ? 'opacity-50' : ''}`}
      style={{ minWidth: 110 }}
      onClick={() => data.onSelect(data.device_id)}
    >
      <div className="font-semibold truncate" style={{ maxWidth: 160 }}>{data.label}</div>
      {data.primary_ip && (
        <div className="text-[10px] opacity-70 mt-0.5">{data.primary_ip}</div>
      )}
      {data.checkmk_status && data.checkmk_status !== 'not_linked' && (
        <div className="mt-1">
          <CheckMKBadge status={data.checkmk_status} />
        </div>
      )}
    </div>
  )
})
DeviceNode.displayName = 'DeviceNode'

const nodeTypes: NodeTypes = {
  floorPlan: FloorPlanNode as unknown as React.ComponentType<any>,
  cabinet: CabinetNode as unknown as React.ComponentType<any>,
  device: DeviceNode as unknown as React.ComponentType<any>,
}

// ─── Canvas inner (needs useReactFlow for screenToFlowPosition) ───────────────

interface CanvasProps {
  nodes: Node[]
  edges: Edge[]
  onNodesChange: (changes: any[]) => void
  onEdgesChange: (changes: any[]) => void
  onNodeDragStop: (e: React.MouseEvent, node: Node) => void
  onDrop: (deviceId: number, x: number, y: number) => void
  isDraggable: boolean
}

const DiagramCanvas: React.FC<CanvasProps> = ({
  nodes, edges, onNodesChange, onEdgesChange, onNodeDragStop, onDrop, isDraggable,
}) => {
  const { screenToFlowPosition } = useReactFlow()

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const deviceId = e.dataTransfer.getData('deviceId')
    if (!deviceId) return
    const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    onDrop(Number(deviceId), pos.x, pos.y)
  }, [screenToFlowPosition, onDrop])

  return (
    <div className="flex-1 h-full" onDrop={handleDrop} onDragOver={handleDragOver}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        nodesDraggable={isDraggable}
        nodesConnectable={false}
        elementsSelectable
        fitView
        fitViewOptions={{ padding: 0.08 }}
        minZoom={0.05}
        maxZoom={3}
        deleteKeyCode={null}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#d1d5db" />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            if (node.type === 'floorPlan') return '#e5e7eb'
            if (node.type === 'cabinet') return '#9ca3af'
            const dt = (node.data as DeviceNodeData | undefined)?.device_type ?? 'other'
            const colors: Record<string, string> = {
              switch: '#93c5fd', router: '#86efac', access_point: '#d8b4fe',
              server: '#fdba74', firewall: '#fca5a5', pdu: '#fde047',
              ups: '#fde047', unmanaged_switch: '#a5b4fc', workstation: '#5eead4',
              printer: '#f9a8d4', camera: '#bef264', phone: '#5eead4',
              patch_panel: '#d1d5db', other: '#9ca3af',
            }
            return colors[dt] ?? '#9ca3af'
          }}
          maskColor="rgba(255,255,255,0.6)"
          style={{ height: 120 }}
        />
      </ReactFlow>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

const SiteNetworkMapPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const siteId = Number(id)
  const isAdmin = useAuthStore((s) => s.isAdmin())

  // Filters & UI state
  const [typeFilters, setTypeFilters] = useState<Record<string, boolean>>(
    Object.fromEntries(ALL_DEVICE_TYPES.map((t) => [t, true]))
  )
  const [showFloorPlan, setShowFloorPlan] = useState(true)
  const [collapsedCabinets, setCollapsedCabinets] = useState<Set<number>>(new Set())
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null)
  const [hasDirty, setHasDirty] = useState(false)
  const dirtyRef = useRef<Record<string, { plan_x: number; plan_y: number; type: 'device' | 'cabinet' }>>({})
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const queryClient = useQueryClient()

  // ── Data fetching ──────────────────────────────────────────────────────────
  const { data: site } = useQuery({
    queryKey: ['sites', siteId],
    queryFn: () => sitesApi.get(siteId),
    staleTime: 60_000,
  })

  const { data: floorPlanData } = useQuery({
    queryKey: ['sites', siteId, 'floor-plan'],
    queryFn: () => sitesApi.getFloorPlan(siteId),
    enabled: !!site?.has_floor_plan,
    staleTime: 300_000,
    retry: false,
  })

  const { data: topology, isLoading: topoLoading } = useQuery({
    queryKey: ['topology', { site_id: siteId }],
    queryFn: () => topologyApi.getTopology({ site_id: siteId }),
    staleTime: 60_000,
  })

  const { data: devicesData } = useQuery({
    queryKey: ['devices', 'all', siteId],
    queryFn: () => devicesApi.list({ site_id: siteId, size: 500 } as any),
    staleTime: 60_000,
  })

  const { data: cabinetsData } = useQuery({
    queryKey: ['cabinets', 'site', siteId],
    queryFn: () => cabinetsApi.list({ site_id: siteId }),
    staleTime: 60_000,
  })

  const { data: checkmkStatus } = useQuery({
    queryKey: ['checkmk', 'status'],
    queryFn: () => checkmkApi.getStatus(),
    staleTime: 60_000,
    retry: false,
  })

  // ── Derived maps ───────────────────────────────────────────────────────────
  const deviceMap = useMemo(() => {
    const map: Record<number, Device> = {}
    devicesData?.items.forEach((d) => { map[d.id] = d })
    return map
  }, [devicesData])

  // ── Cabinet toggle ─────────────────────────────────────────────────────────
  const toggleCabinet = useCallback((cabinetId: number) => {
    setCollapsedCabinets((prev) => {
      const next = new Set(prev)
      next.has(cabinetId) ? next.delete(cabinetId) : next.add(cabinetId)
      return next
    })
  }, [])

  // ── Save positions ─────────────────────────────────────────────────────────
  const savePositions = useCallback(async () => {
    const entries = Object.entries(dirtyRef.current)
    if (entries.length === 0) return
    dirtyRef.current = {}
    setHasDirty(false)
    await Promise.all(entries.map(([key, pos]) => {
      const [type, rawId] = key.split(':')
      const numId = Number(rawId)
      if (type === 'device') {
        return devicesApi.update(numId, { plan_x: pos.plan_x, plan_y: pos.plan_y } as any)
      }
      return cabinetsApi.update(numId, { map_x: pos.plan_x, map_y: pos.plan_y } as any)
    }))
    queryClient.invalidateQueries({ queryKey: ['devices', 'all', siteId] })
    queryClient.invalidateQueries({ queryKey: ['cabinets', 'site', siteId] })
  }, [siteId, queryClient])

  const scheduleSave = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(savePositions, 1500)
  }, [savePositions])

  // ── Build RF nodes ─────────────────────────────────────────────────────────
  const allNodes = useMemo((): Node[] => {
    const result: Node[] = []

    // Floor plan (background image node)
    if (showFloorPlan && floorPlanData?.floor_plan) {
      result.push({
        id: '__floorplan__',
        type: 'floorPlan',
        position: { x: 0, y: 0 },
        draggable: false,
        selectable: false,
        data: { imageUrl: floorPlanData.floor_plan } as FloorPlanNodeData,
        zIndex: -1,
      })
    }

    // Cabinet nodes
    const cabinets = (cabinetsData?.items ?? []) as Cabinet[]
    cabinets.forEach((cab) => {
      if (cab.map_x == null || cab.map_y == null) return
      const collapsed = collapsedCabinets.has(cab.id)
      const devCount = topology?.nodes.filter((n) => deviceMap[n.device_id]?.cabinet_id === cab.id).length ?? 0
      result.push({
        id: `cabinet:${cab.id}`,
        type: 'cabinet',
        position: { x: (cab.map_x / 100) * CANVAS_W, y: (cab.map_y / 100) * CANVAS_H },
        draggable: isAdmin,
        data: { id: cab.id, name: cab.name, deviceCount: devCount, collapsed, onToggle: toggleCabinet } as CabinetNodeData,
        zIndex: 1,
      })
    })

    // Device nodes
    topology?.nodes.forEach((n) => {
      const dev = deviceMap[n.device_id]
      if (!dev || dev.plan_x == null || dev.plan_y == null) return
      const collapsedByCabinet = dev.cabinet_id != null && collapsedCabinets.has(dev.cabinet_id)
      const hidden = !typeFilters[n.device_type] || collapsedByCabinet
      const checkmkEntry = checkmkStatus ? (checkmkStatus as Record<string, any>)[String(n.device_id)] : null
      result.push({
        id: `device:${n.id}`,
        type: 'device',
        position: { x: (dev.plan_x / 100) * CANVAS_W, y: (dev.plan_y / 100) * CANVAS_H },
        draggable: isAdmin,
        hidden,
        data: {
          label: n.label,
          device_type: n.device_type,
          primary_ip: n.primary_ip,
          status: n.status,
          device_id: n.device_id,
          checkmk_status: checkmkEntry?.state_label ?? null,
          onSelect: setSelectedDeviceId,
        } as DeviceNodeData,
        zIndex: 2,
      })
    })

    return result
  }, [showFloorPlan, floorPlanData, cabinetsData, topology, deviceMap, typeFilters,
      collapsedCabinets, isAdmin, toggleCabinet, checkmkStatus])

  // ── Build RF edges ─────────────────────────────────────────────────────────
  const allEdges = useMemo((): Edge[] => (
    (topology?.edges ?? []).map((e) => ({
      id: `edge:${e.id}`,
      source: `device:${e.source}`,
      target: `device:${e.target}`,
      label: e.label ?? `${e.interface_a} ↔ ${e.interface_b}`,
      type: 'default',
      style: { stroke: '#6b7280', strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#6b7280', width: 12, height: 12 },
      labelStyle: { fontSize: 9, fill: '#6b7280' },
      labelBgStyle: { fill: 'white', fillOpacity: 0.85 },
      labelBgPadding: [3, 3] as [number, number],
    }))
  ), [topology])

  const [nodes, setNodes, onNodesChange] = useNodesState(allNodes)
  const [edges, , onEdgesChange] = useEdgesState(allEdges)

  // Sync when source data changes
  React.useEffect(() => { setNodes(allNodes) }, [allNodes, setNodes])
  React.useEffect(() => {
    // edges managed by useEdgesState — reset on topology change
  }, [allEdges])

  // ── Node drag stop ─────────────────────────────────────────────────────────
  const onNodeDragStop = useCallback((_e: React.MouseEvent, node: Node) => {
    if (!isAdmin || node.type === 'floorPlan') return
    const [type] = node.id.split(':')
    const plan_x = Math.max(0, Math.min(100, (node.position.x / CANVAS_W) * 100))
    const plan_y = Math.max(0, Math.min(100, (node.position.y / CANVAS_H) * 100))
    dirtyRef.current[node.id] = { plan_x, plan_y, type: type as 'device' | 'cabinet' }
    // Also optimistically update the node id→position for cabinet nodes
    if (type === 'cabinet') {
      // Update the cabinet onToggle data too (position change only, no re-render needed)
    }
    setHasDirty(true)
    scheduleSave()
  }, [isAdmin, scheduleSave])

  // ── Sidebar drop ───────────────────────────────────────────────────────────
  const onSidebarDrop = useCallback((deviceId: number, x: number, y: number) => {
    const plan_x = Math.max(0, Math.min(100, (x / CANVAS_W) * 100))
    const plan_y = Math.max(0, Math.min(100, (y / CANVAS_H) * 100))
    // Optimistic cache update
    queryClient.setQueryData(['devices', 'all', siteId], (old: any) => {
      if (!old) return old
      return { ...old, items: old.items.map((d: Device) => d.id === deviceId ? { ...d, plan_x, plan_y } : d) }
    })
    dirtyRef.current[`device:${deviceId}`] = { plan_x, plan_y, type: 'device' }
    setHasDirty(true)
    scheduleSave()
  }, [siteId, queryClient, scheduleSave])

  // ── Non-positioned devices ─────────────────────────────────────────────────
  const unpositioned = useMemo(() => {
    const result: Record<string, TopologyNode[]> = {}
    topology?.nodes.forEach((n) => {
      if (deviceMap[n.device_id]?.plan_x == null) {
        const label = DEVICE_LABELS[n.device_type] ?? n.device_type
        if (!result[label]) result[label] = []
        result[label].push(n)
      }
    })
    return result
  }, [topology, deviceMap])

  const unpositionedCount = useMemo(
    () => Object.values(unpositioned).reduce((acc, arr) => acc + arr.length, 0),
    [unpositioned]
  )

  // ── Selected device info ───────────────────────────────────────────────────
  const selectedNode = useMemo(
    () => topology?.nodes.find((n) => n.device_id === selectedDeviceId) ?? null,
    [topology, selectedDeviceId]
  )

  if (topoLoading) {
    return (
      <div className="flex items-center justify-center" style={{ height: 'calc(100vh - 4rem)' }}>
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 4rem)' }}>
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link to={`/sedi/${siteId}/mappa`} className="text-gray-400 hover:text-gray-600">
            <ArrowLeft size={18} />
          </Link>
          <div className="flex items-center gap-1.5 text-sm text-gray-500">
            <Link to="/sedi" className="hover:text-primary-600">Sedi</Link>
            <span>/</span>
            <span className="font-medium text-gray-900">{site?.name}</span>
            <span>/</span>
            <span className="text-gray-700 flex items-center gap-1">
              <Network size={15} className="text-primary-500" />
              Diagramma di rete
            </span>
          </div>
        </div>
        {hasDirty && isAdmin && (
          <button
            onClick={savePositions}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition-colors"
          >
            <Save size={14} />
            Salva posizioni
          </button>
        )}
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar ── */}
        <div className="w-60 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-y-auto text-sm">

          {/* Type filters */}
          <div className="p-3 border-b border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Filtri tipo</span>
              <div className="flex gap-1.5 text-[10px]">
                <button
                  onClick={() => setTypeFilters(Object.fromEntries(ALL_DEVICE_TYPES.map((t) => [t, true])))}
                  className="text-primary-600 hover:underline"
                >Tutti</button>
                <span className="text-gray-300">|</span>
                <button
                  onClick={() => setTypeFilters(Object.fromEntries(ALL_DEVICE_TYPES.map((t) => [t, false])))}
                  className="text-gray-400 hover:underline"
                >Nessuno</button>
              </div>
            </div>
            <div className="space-y-1">
              {ALL_DEVICE_TYPES.map((t) => {
                const c = DEVICE_COLORS[t] ?? DEVICE_COLORS.other
                return (
                  <label key={t} className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={typeFilters[t] ?? true}
                      onChange={(e) => setTypeFilters((prev) => ({ ...prev, [t]: e.target.checked }))}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 h-3.5 w-3.5"
                    />
                    <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${c.dot}`} />
                    <span className="text-xs text-gray-700 group-hover:text-gray-900">{DEVICE_LABELS[t]}</span>
                  </label>
                )
              })}
            </div>
          </div>

          {/* Vista toggle */}
          <div className="p-3 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Vista</span>
            <div className="space-y-1.5">
              {([
                { val: true, label: 'Planimetria' },
                { val: false, label: 'Schema puro' },
              ] as const).map(({ val, label }) => {
                const disabled = val && !floorPlanData?.floor_plan
                return (
                  <label key={label} className={`flex items-center gap-2 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                    <input
                      type="radio"
                      checked={showFloorPlan === val}
                      onChange={() => setShowFloorPlan(val)}
                      disabled={disabled}
                      className="text-primary-600 focus:ring-primary-500"
                    />
                    <span className={`text-xs ${disabled ? 'text-gray-300' : 'text-gray-700'}`}>{label}</span>
                  </label>
                )
              })}
              {!floorPlanData?.floor_plan && (
                <p className="text-[10px] text-gray-400 mt-1">
                  Carica la planimetria dalla{' '}
                  <Link to={`/sedi/${siteId}/mappa`} className="text-primary-500 hover:underline">Mappa sito</Link>
                </p>
              )}
            </div>
          </div>

          {/* Non-positioned devices */}
          {unpositionedCount > 0 && (
            <div className="p-3 border-b border-gray-100">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                Non posizionati ({unpositionedCount})
              </span>
              {isAdmin
                ? <p className="text-[10px] text-gray-400 mb-2">Trascina sul canvas per posizionare</p>
                : <p className="text-[10px] text-gray-400 mb-2">Solo gli admin possono posizionare i dispositivi.</p>}
              {Object.entries(unpositioned).map(([typeLabel, nodeList]) => (
                <div key={typeLabel} className="mb-2">
                  <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1">{typeLabel}</div>
                  {nodeList.map((n) => {
                    const c = DEVICE_COLORS[n.device_type] ?? DEVICE_COLORS.other
                    return (
                      <div
                        key={n.device_id}
                        draggable={isAdmin}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('deviceId', String(n.device_id))
                          e.dataTransfer.effectAllowed = 'move'
                        }}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-gray-700
                          bg-gray-50 border border-gray-200 mb-1 select-none
                          ${isAdmin ? 'cursor-grab hover:bg-primary-50 hover:border-primary-300 active:cursor-grabbing' : 'cursor-default'}`}
                      >
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c.dot}`} />
                        <span className="truncate">{n.label}</span>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}

          {/* Selected device detail */}
          {selectedNode && (
            <div className="p-3 bg-primary-50 border-t border-primary-100 mt-auto">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-primary-800">Selezionato</span>
                <button
                  onClick={() => setSelectedDeviceId(null)}
                  className="text-primary-400 hover:text-primary-600 text-xs leading-none"
                >✕</button>
              </div>
              <div className="text-sm font-semibold text-gray-900 truncate mb-0.5">{selectedNode.label}</div>
              <div className="text-xs text-gray-500 space-y-0.5">
                <div>{DEVICE_LABELS[selectedNode.device_type] ?? selectedNode.device_type}</div>
                {selectedNode.primary_ip && <div className="font-mono">{selectedNode.primary_ip}</div>}
                {selectedNode.cabinet_name && <div>Armadio: {selectedNode.cabinet_name}</div>}
                {selectedNode.site_name && <div>Sede: {selectedNode.site_name}</div>}
              </div>
              <Link
                to={`/dispositivi/${selectedNode.device_id}`}
                className="mt-2 block text-center text-xs text-primary-600 hover:text-primary-800 font-medium hover:underline"
              >
                Vai al dispositivo →
              </Link>
            </div>
          )}
        </div>

        {/* ── Canvas ── */}
        <ReactFlowProvider>
          <DiagramCanvas
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStop={onNodeDragStop}
            onDrop={onSidebarDrop}
            isDraggable={isAdmin}
          />
        </ReactFlowProvider>
      </div>
    </div>
  )
}

export default SiteNetworkMapPage
