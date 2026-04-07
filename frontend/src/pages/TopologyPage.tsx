import React, { useCallback, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  MarkerType,
  type Node,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  GitBranch, Save, Search, X, Trash2, Plus, Eye, EyeOff, LayoutDashboard,
  ChevronDown, ChevronRight, Undo2, Redo2, Download,
} from 'lucide-react'
import { topologyApi, topologyMapsApi } from '../api/topology'
import { cabinetsApi } from '../api/cabinets'
import { checkmkApi } from '../api/checkmk'
import { useAuthStore } from '../store/authStore'
import { useTopologyMaps, useTopologyMap } from '../hooks/useTopology'
import TopologyGraph, { DEVICE_COLORS, type TopologyGraphHandle } from '../components/topology/TopologyGraph'
import { DeviceTypeBadge, DeviceStatusBadge } from '../components/common/Badge'
import CheckMKBadge from '../components/common/CheckMKBadge'
import DeviceDetailModal from '../components/topology/DeviceDetailModal'
import CabinetDetailModal from '../components/topology/CabinetDetailModal'
import type {
  TopologyNode,
  TopologyMapNodeLayout,
  DeviceType,
  CheckMKStatus,
  Cabinet,
} from '../types'

// ─── Type order for auto-layout ───────────────────────────────────────────────

const TYPE_ORDER: DeviceType[] = [
  'switch', 'router', 'firewall', 'server', 'access_point',
  'patch_panel', 'pdu', 'ups', 'unmanaged_switch',
  'workstation', 'printer', 'camera', 'phone', 'other',
]

// ─── Sidebar groups for device list ──────────────────────────────────────────

const DEVICE_TYPE_GROUPS: Array<{ type: string; label: string }> = [
  { type: 'router',           label: 'Router' },
  { type: 'firewall',         label: 'Firewall' },
  { type: 'switch',           label: 'Switch' },
  { type: 'unmanaged_switch', label: 'Switch non gestiti' },
  { type: 'patch_panel',      label: 'Patch Panel' },
  { type: 'access_point',     label: 'Access Point' },
  { type: 'server',           label: 'Server' },
  { type: 'workstation',      label: 'Workstation' },
  { type: 'pdu',              label: 'PDU' },
  { type: 'ups',              label: 'UPS' },
  { type: 'printer',          label: 'Stampanti' },
  { type: 'camera',           label: 'Telecamere' },
  { type: 'phone',            label: 'Telefoni' },
  { type: 'other',            label: 'Altro' },
]

// ─── Edge transitivity: collapse hidden nodes ─────────────────────────────────

type CollapsedEdge = {
  src: string
  tgt: string
  isVirtual: boolean
  realEdgeId?: number
  label?: string
}

type TopologyAdjacency = {
  adj: Map<string, string[]>
  realPairKeys: Map<string, { id: number; label: string }>
  allKeys: Set<string>
  topoEdges: Array<{ id: number; source_device_id: number; target_device_id: number; source_interface: string; target_interface: string }>
}

/** Phase 1 — topology-stable: builds adjacency structures from topology data only.
 *  This is cheap to memoize separately so it only rebuilds when topology changes. */
function buildAdjacency(
  topoEdges: Array<{ id: number; source_device_id: number; target_device_id: number; source_interface: string; target_interface: string }>,
  topoNodes: TopologyNode[],
): TopologyAdjacency {
  const adj = new Map<string, string[]>()
  const push = (a: string, b: string) => {
    adj.set(a, [...(adj.get(a) ?? []), b])
    adj.set(b, [...(adj.get(b) ?? []), a])
  }
  for (const e of topoEdges) {
    push(`device:${e.source_device_id}`, `device:${e.target_device_id}`)
  }
  for (const n of topoNodes) {
    if (n.cabinet_id != null) {
      push(`device:${n.id}`, `cabinet:${n.cabinet_id}`)
    }
  }
  const realPairKeys = new Map<string, { id: number; label: string }>()
  for (const e of topoEdges) {
    const key = [`device:${e.source_device_id}`, `device:${e.target_device_id}`].sort().join('|')
    realPairKeys.set(key, { id: e.id, label: `${e.source_interface} ↔ ${e.target_interface}` })
  }
  return { adj, realPairKeys, allKeys: new Set(adj.keys()), topoEdges }
}

/** Phase 2 — visibility-dependent: BFS through hidden nodes to find virtual edges.
 *  Receives the pre-built adjacency so it avoids re-iterating topology data.
 *
 *  Key behaviour: cabinet nodes are ALWAYS treated as BFS terminii. When a device
 *  is hidden (e.g. a switch), devices connected to it "scale up" their connection
 *  to the cabinet that contains the hidden switch. */
function computeCollapsedEdges(
  adjacency: TopologyAdjacency,
  visibilityMap: Record<number, boolean>,
  cabinetVisibilityMap: Record<number, boolean>,
): CollapsedEdge[] {
  const { adj, realPairKeys, allKeys, topoEdges } = adjacency

  // Actual visibility — used to decide BFS start nodes.
  const isActuallyVisible = (key: string): boolean => {
    if (key.startsWith('device:')) return visibilityMap[parseInt(key.slice(7), 10)] ?? true
    if (key.startsWith('cabinet:')) return cabinetVisibilityMap[parseInt(key.slice(8), 10)] ?? true
    return true
  }

  // BFS terminus check — cabinets are ALWAYS terminii so that devices connected to
  // a hidden switch always stop at the cabinet node rather than traversing through.
  const isBfsTerminus = (key: string): boolean => {
    if (key.startsWith('device:')) return visibilityMap[parseInt(key.slice(7), 10)] ?? true
    if (key.startsWith('cabinet:')) return true  // cabinets are always a stopping point
    return true
  }

  const result: CollapsedEdge[] = []

  // Real edges (both endpoints visible)
  for (const e of topoEdges) {
    const s = `device:${e.source_device_id}`, t = `device:${e.target_device_id}`
    if (isActuallyVisible(s) && isActuallyVisible(t)) {
      result.push({ src: s, tgt: t, isVirtual: false, realEdgeId: e.id, label: `${e.source_interface} ↔ ${e.target_interface}` })
    }
  }

  // Virtual edges: BFS from each visible node through hidden nodes.
  // When the BFS reaches a cabinet node (always a terminus), a virtual dashed edge
  // is created so the user sees "Device A → Cabinet of hidden switch".
  const seenVirtual = new Set<string>()

  for (const startKey of allKeys) {
    if (!isActuallyVisible(startKey)) continue

    const visited = new Set<string>([startKey])
    const queue: string[] = []

    for (const nb of adj.get(startKey) ?? []) {
      if (!visited.has(nb) && !isBfsTerminus(nb)) {
        visited.add(nb)
        queue.push(nb)
      }
    }

    let head = 0
    while (head < queue.length) {
      const cur = queue[head++]
      for (const nb of adj.get(cur) ?? []) {
        if (visited.has(nb)) continue
        visited.add(nb)
        if (isBfsTerminus(nb)) {
          const pairKey = [startKey, nb].sort().join('|')
          if (!seenVirtual.has(pairKey) && !realPairKeys.has(pairKey)) {
            seenVirtual.add(pairKey)
            result.push({ src: startKey, tgt: nb, isVirtual: true })
          }
        } else {
          queue.push(nb)
        }
      }
    }
  }

  return result
}

// ─── Auto-layout: grid grouped by device type + cabinets at bottom ────────────

function computeAutoLayout(
  nodes: TopologyNode[],
  cabinets: Cabinet[] = [],
): Record<string, TopologyMapNodeLayout> {
  const groups: Record<string, TopologyNode[]> = {}
  nodes.forEach((n) => {
    const k = n.device_type
    if (!groups[k]) groups[k] = []
    groups[k].push(n)
  })

  const COLS = 6
  const NODE_W = 170
  const NODE_H = 80
  const COL_GAP = 16
  const ROW_GAP = 16
  const GROUP_GAP = 48
  const PADDING = 50

  const layout: Record<string, TopologyMapNodeLayout> = {}
  let groupY = PADDING

  TYPE_ORDER.forEach((type) => {
    const group = groups[type]
    if (!group || group.length === 0) return
    group.forEach((node, idx) => {
      const col = idx % COLS
      const row = Math.floor(idx / COLS)
      layout[String(node.id)] = {
        x: PADDING + col * (NODE_W + COL_GAP),
        y: groupY + row * (NODE_H + ROW_GAP),
        visible: true,
      }
    })
    const rows = Math.ceil(group.length / COLS)
    groupY += rows * (NODE_H + ROW_GAP) + GROUP_GAP
  })

  // Any remaining device types not in TYPE_ORDER
  Object.entries(groups).forEach(([type, group]) => {
    if (TYPE_ORDER.includes(type as DeviceType)) return
    group.forEach((node, idx) => {
      const col = idx % COLS
      const row = Math.floor(idx / COLS)
      layout[String(node.id)] = {
        x: PADDING + col * (NODE_W + COL_GAP),
        y: groupY + row * (NODE_H + ROW_GAP),
        visible: true,
      }
    })
    const rows = Math.ceil(group.length / COLS)
    groupY += rows * (NODE_H + ROW_GAP) + GROUP_GAP
  })

  // Cabinets placed in a row below devices
  if (cabinets.length > 0) {
    groupY += GROUP_GAP
    const CAB_W = 160
    const CAB_H = 65
    const CAB_COLS = 5
    cabinets.forEach((cab, idx) => {
      const col = idx % CAB_COLS
      const row = Math.floor(idx / CAB_COLS)
      layout[`cab:${cab.id}`] = {
        x: PADDING + col * (CAB_W + COL_GAP),
        y: groupY + row * (CAB_H + ROW_GAP),
        visible: true,
      }
    })
  }

  return layout
}

// ─── TopologyPage ─────────────────────────────────────────────────────────────

const TopologyPage: React.FC = () => {
  const queryClient = useQueryClient()
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin')

  // ── State ──────────────────────────────────────────────────────────────────
  const [selectedMapId, setSelectedMapId] = useState<number | null>(null)
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null)
  const [selectedCabinetId, setSelectedCabinetId] = useState<number | null>(null)
  const [deviceDetailOpen, setDeviceDetailOpen] = useState(false)
  const [cabinetDetailOpen, setCabinetDetailOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [hasDirty, setHasDirty] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newMapName, setNewMapName] = useState('')
  const [newMapBgUrl, setNewMapBgUrl] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const toggleGroup = useCallback((type: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }, [])

  const dirtyLayoutRef = useRef<Record<string, { x: number; y: number; visible: boolean }>>({})
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoLayoutRef = useRef<Record<string, TopologyMapNodeLayout> | null>(null)
  // Ref che rispecchia sempre effectiveLayout per uso nei callback (evita closure stale)
  const effectiveLayoutRef = useRef<Record<string, TopologyMapNodeLayout>>({})
  const topologyGraphRef = useRef<TopologyGraphHandle>(null)
  const historyPastRef = useRef<Array<Record<string, { x: number; y: number; visible: boolean }>>>([])
  const historyFutureRef = useRef<Array<Record<string, { x: number; y: number; visible: boolean }>>>([])
  const [historySize, setHistorySize] = useState({ past: 0, future: 0 })

  // ── Data fetching ──────────────────────────────────────────────────────────
  const { data: mapList } = useTopologyMaps()
  const { data: activeMap } = useTopologyMap(selectedMapId)

  const { data: topology } = useQuery({
    queryKey: ['topology', {}],
    queryFn: () => topologyApi.getTopology(),
    staleTime: 60_000,
  })

  const { data: cabinetsData } = useQuery({
    queryKey: ['cabinets', { size: 200 }],
    queryFn: () => cabinetsApi.list({ size: 200 }),
    staleTime: 60_000,
  })
  const cabinets: Cabinet[] = cabinetsData?.items ?? []

  const { data: checkmkStatus } = useQuery({
    queryKey: ['checkmk', 'status'],
    queryFn: checkmkApi.getStatus,
    staleTime: 60_000,
    retry: false,
  })

  // ── Save layout ────────────────────────────────────────────────────────────
  const saveLayout = useCallback(async () => {
    if (!selectedMapId || Object.keys(dirtyLayoutRef.current).length === 0) return
    // Se activeMap.layout è vuoto (primo salvataggio / solo auto-layout),
    // usiamo effectiveLayout come base per preservare le posizioni di TUTTI i nodi.
    // Senza questo, un toggle di visibilità su un singolo nodo salverebbe solo
    // quell'entry, e al refetch tutti gli altri nodi tornerebbero a {x:0,y:0}.
    const savedLayout = activeMap?.layout ?? {}
    const baseLayout = Object.keys(savedLayout).length > 0 ? savedLayout : effectiveLayoutRef.current
    const merged: Record<string, TopologyMapNodeLayout> = { ...baseLayout }
    Object.entries(dirtyLayoutRef.current).forEach(([k, v]) => { merged[k] = v })
    dirtyLayoutRef.current = {}
    setHasDirty(false)
    await topologyMapsApi.patchLayout(selectedMapId, { layout: merged })
    queryClient.invalidateQueries({ queryKey: ['topology-maps', selectedMapId] })
  }, [selectedMapId, activeMap, queryClient])

  const scheduleSave = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(saveLayout, 1500)
  }, [saveLayout])

  const pushHistory = useCallback((snapshot: Record<string, { x: number; y: number; visible: boolean }>) => {
    historyPastRef.current = [...historyPastRef.current.slice(-49), snapshot]
    historyFutureRef.current = []
    setHistorySize({ past: historyPastRef.current.length, future: 0 })
  }, [])

  // ── Effective layout (persisted or auto) ───────────────────────────────────
  const effectiveLayout = useMemo((): Record<string, TopologyMapNodeLayout> => {
    if (!topology) return {}
    if (activeMap && activeMap.layout && Object.keys(activeMap.layout).length > 0) {
      autoLayoutRef.current = null
      return activeMap.layout
    }
    if (!autoLayoutRef.current) {
      autoLayoutRef.current = computeAutoLayout(topology.nodes, cabinets)
    }
    return autoLayoutRef.current
  }, [topology, activeMap, cabinets])
  // Mantieni il ref sincronizzato per uso in saveLayout (che è dichiarato prima del useMemo)
  effectiveLayoutRef.current = effectiveLayout

  // When map changes, reset auto-layout cache + history
  React.useEffect(() => {
    autoLayoutRef.current = null
    historyPastRef.current = []
    historyFutureRef.current = []
    setHistorySize({ past: 0, future: 0 })
  }, [selectedMapId])

  // ── Search matching ────────────────────────────────────────────────────────
  const { matchSet, cabMatchSet } = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    if (!q || !topology) return { matchSet: new Set<number>(), cabMatchSet: new Set<number>() }
    const matchSet = new Set<number>()
    const cabMatchSet = new Set<number>()
    const qNorm = q.replace(/[:.]/g, '')
    topology.nodes.forEach((n) => {
      const macNorm = (n.mac_address ?? '').toLowerCase().replace(/[:.]/g, '')
      if (
        n.name.toLowerCase().includes(q) ||
        (n.primary_ip ?? '').toLowerCase().includes(q) ||
        macNorm.includes(qNorm)
      ) {
        matchSet.add(n.id)
      }
    })
    cabinets.forEach((c) => {
      if (
        c.name.toLowerCase().includes(q) ||
        ((c as any).site?.name ?? '').toLowerCase().includes(q)
      ) {
        cabMatchSet.add(c.id)
      }
    })
    return { matchSet, cabMatchSet }
  }, [searchQuery, topology, cabinets])

  const hasSearch = searchQuery.trim().length > 0
  const totalMatches = matchSet.size + cabMatchSet.size

  // ── Build ReactFlow nodes ──────────────────────────────────────────────────
  const rfNodes = useMemo((): Node[] => {
    if (!topology || !selectedMapId) return []

    // Device nodes
    const deviceNodes = topology.nodes.map((n) => {
      const pos = effectiveLayout[String(n.id)]
      const layoutEntry = activeMap?.layout?.[String(n.id)]
      const visible = layoutEntry?.visible ?? (effectiveLayout[String(n.id)]?.visible ?? true)
      const checkmkEntry = (checkmkStatus as Record<number, { state_label: CheckMKStatus }> | undefined)?.[n.id]
      return {
        id: `device:${n.id}`,
        type: 'topologyDevice',
        position: pos ? { x: pos.x, y: pos.y } : { x: 0, y: 0 },
        hidden: !visible,
        draggable: isAdmin && !!selectedMapId,
        data: {
          label: n.name,
          device_type: n.device_type,
          primary_ip: n.primary_ip,
          mac_address: n.mac_address,
          status: n.status,
          cabinet_name: n.cabinet_name ?? null,
          device_id: n.id,
          checkmk_status: checkmkEntry?.state_label ?? null,
          highlighted: hasSearch && matchSet.has(n.id),
          dimmed: hasSearch && !matchSet.has(n.id),
          onSelect: (id: number) => {
            setSelectedDeviceId(id)
            setSelectedCabinetId(null)
          },
        },
      }
    })

    // Cabinet nodes
    const cabinetNodes = cabinets.map((cab) => {
      const key = `cab:${cab.id}`
      const pos = effectiveLayout[key]
      const layoutEntry = activeMap?.layout?.[key]
      const visible = layoutEntry?.visible ?? (effectiveLayout[key]?.visible ?? true)

      // Auto-position: place cabinet at the centroid of its devices (+ right offset)
      // so virtual "scale-up" edges don't all converge at {0,0}.
      let position: { x: number; y: number }
      if (pos) {
        position = { x: pos.x, y: pos.y }
      } else {
        const devPositions = topology!.nodes
          .filter((n) => n.cabinet_id === cab.id)
          .map((n) => effectiveLayout[String(n.id)])
          .filter(Boolean)
        if (devPositions.length > 0) {
          const avgX = devPositions.reduce((s, p) => s + p.x, 0) / devPositions.length
          const avgY = devPositions.reduce((s, p) => s + p.y, 0) / devPositions.length
          position = { x: avgX + 240, y: avgY }
        } else {
          position = { x: 0, y: 0 }
        }
      }

      return {
        id: `cabinet:${cab.id}`,
        type: 'topologyCabinet',
        position,
        hidden: !visible,
        draggable: isAdmin && !!selectedMapId,
        data: {
          label: cab.name,
          cabinet_id: cab.id,
          u_count: cab.u_count,
          site_name: (cab as any).site?.name ?? null,
          highlighted: hasSearch && cabMatchSet.has(cab.id),
          dimmed: hasSearch && !cabMatchSet.has(cab.id),
          onSelect: (id: number) => {
            setSelectedCabinetId(id)
            setSelectedDeviceId(null)
          },
        },
      }
    })

    return [...deviceNodes, ...cabinetNodes]
  }, [topology, cabinets, selectedMapId, effectiveLayout, activeMap, checkmkStatus, hasSearch, matchSet, cabMatchSet, isAdmin])

  const [nodes, setNodes, onNodesChange] = useNodesState(rfNodes)

  // ── Undo/Redo (placed after useNodesState so setNodes + effectiveLayout are in scope) ──
  const captureSnapshot = useCallback(
    (): Record<string, { x: number; y: number; visible: boolean }> => {
      const snap = { ...effectiveLayout } as Record<string, { x: number; y: number; visible: boolean }>
      Object.entries(dirtyLayoutRef.current).forEach(([k, v]) => { snap[k] = v })
      return snap
    },
    [effectiveLayout]
  )

  const applySnapshot = useCallback(
    (snapshot: Record<string, { x: number; y: number; visible: boolean }>) => {
      dirtyLayoutRef.current = { ...snapshot }
      setHasDirty(true)
      setNodes((prev) =>
        prev.map((n) => {
          const key = n.id.startsWith('cabinet:')
            ? `cab:${n.id.replace('cabinet:', '')}`
            : n.id.replace('device:', '')
          const entry = snapshot[key]
          if (!entry) return n
          return { ...n, position: { x: entry.x, y: entry.y }, hidden: !entry.visible }
        })
      )
      scheduleSave()
    },
    [setNodes, scheduleSave]
  )

  const undoLayout = useCallback(() => {
    if (historyPastRef.current.length === 0) return
    const current = captureSnapshot()
    const prev = historyPastRef.current[historyPastRef.current.length - 1]
    historyPastRef.current = historyPastRef.current.slice(0, -1)
    historyFutureRef.current = [current, ...historyFutureRef.current.slice(0, 49)]
    setHistorySize({ past: historyPastRef.current.length, future: historyFutureRef.current.length })
    applySnapshot(prev)
  }, [captureSnapshot, applySnapshot])

  const redoLayout = useCallback(() => {
    if (historyFutureRef.current.length === 0) return
    const current = captureSnapshot()
    const next = historyFutureRef.current[0]
    historyFutureRef.current = historyFutureRef.current.slice(1)
    historyPastRef.current = [...historyPastRef.current.slice(-49), current]
    setHistorySize({ past: historyPastRef.current.length, future: historyFutureRef.current.length })
    applySnapshot(next)
  }, [captureSnapshot, applySnapshot])

  // Keyboard shortcut: Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!isAdmin || !selectedMapId) return
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undoLayout()
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        redoLayout()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isAdmin, selectedMapId, undoLayout, redoLayout])

  // ── Drag stop handler ──────────────────────────────────────────────────────
  const onNodeDragStop = useCallback(
    (_e: React.MouseEvent, node: Node) => {
      if (!isAdmin || !selectedMapId) return
      pushHistory(captureSnapshot())
      let key: string
      if (node.id.startsWith('cabinet:')) {
        key = `cab:${node.id.replace('cabinet:', '')}`
      } else {
        key = node.id.replace('device:', '')
      }
      const existing = effectiveLayout[key]
      dirtyLayoutRef.current[key] = {
        x: node.position.x,
        y: node.position.y,
        visible: existing?.visible ?? true,
      }
      setHasDirty(true)
      scheduleSave()
    },
    [isAdmin, selectedMapId, effectiveLayout, scheduleSave, pushHistory, captureSnapshot]
  )

  // ── Toggle device visibility ───────────────────────────────────────────────
  const toggleDeviceVisibility = useCallback(
    (deviceId: number) => {
      if (!isAdmin || !selectedMapId) return
      pushHistory(captureSnapshot())
      const key = String(deviceId)
      const currentPos = effectiveLayout[key] ?? { x: 0, y: 0 }
      const currentVisible = currentPos.visible ?? true
      dirtyLayoutRef.current[key] = { x: currentPos.x, y: currentPos.y, visible: !currentVisible }
      setHasDirty(true)
      setNodes((prev) =>
        prev.map((n) =>
          n.id === `device:${deviceId}` ? { ...n, hidden: currentVisible } : n
        )
      )
      scheduleSave()
    },
    [isAdmin, selectedMapId, effectiveLayout, setNodes, scheduleSave, pushHistory, captureSnapshot]
  )

  // ── Toggle cabinet visibility ──────────────────────────────────────────────
  const toggleCabinetVisibility = useCallback(
    (cabinetId: number) => {
      if (!isAdmin || !selectedMapId) return
      pushHistory(captureSnapshot())
      const key = `cab:${cabinetId}`
      const currentPos = effectiveLayout[key] ?? { x: 0, y: 0 }
      const currentVisible = currentPos.visible ?? true
      dirtyLayoutRef.current[key] = { x: currentPos.x, y: currentPos.y, visible: !currentVisible }
      setHasDirty(true)
      setNodes((prev) =>
        prev.map((n) =>
          n.id === `cabinet:${cabinetId}` ? { ...n, hidden: currentVisible } : n
        )
      )
      scheduleSave()
    },
    [isAdmin, selectedMapId, effectiveLayout, setNodes, scheduleSave, pushHistory, captureSnapshot]
  )

  // ── Create map ─────────────────────────────────────────────────────────────
  const handleCreateMap = useCallback(async () => {
    if (!newMapName.trim()) return
    setIsCreating(true)
    try {
      const created = await topologyMapsApi.create({
        name: newMapName.trim(),
        site_id: null,
        background_image_url: newMapBgUrl.trim() || null,
      })
      queryClient.invalidateQueries({ queryKey: ['topology-maps'] })
      setSelectedMapId(created.id)
      setShowCreateModal(false)
      setNewMapName('')
      setNewMapBgUrl('')
    } finally {
      setIsCreating(false)
    }
  }, [newMapName, newMapBgUrl, queryClient])

  // ── Delete map ─────────────────────────────────────────────────────────────
  const handleDeleteMap = useCallback(async () => {
    if (!selectedMapId) return
    if (!window.confirm("Eliminare questa mappa? L'operazione non può essere annullata.")) return
    setIsDeleting(true)
    try {
      await topologyMapsApi.delete(selectedMapId)
      queryClient.invalidateQueries({ queryKey: ['topology-maps'] })
      setSelectedMapId(null)
      dirtyLayoutRef.current = {}
      setHasDirty(false)
    } finally {
      setIsDeleting(false)
    }
  }, [selectedMapId, queryClient])

  // ── Selected node info ─────────────────────────────────────────────────────
  const selectedNode = useMemo(
    () => topology?.nodes.find((n) => n.id === selectedDeviceId) ?? null,
    [topology, selectedDeviceId]
  )
  const checkmkEntry = selectedDeviceId
    ? (checkmkStatus as Record<number, { state_label: CheckMKStatus; host_name: string; address: string }> | undefined)?.[selectedDeviceId]
    : null

  const selectedCabinet = useMemo(
    () => cabinets.find((c) => c.id === selectedCabinetId) ?? null,
    [cabinets, selectedCabinetId]
  )

  // ── Visibility maps for sidebar ────────────────────────────────────────────
  const visibilityMap = useMemo(() => {
    const map: Record<number, boolean> = {}
    topology?.nodes.forEach((n) => {
      const node = nodes.find((nd) => nd.id === `device:${n.id}`)
      map[n.id] = node ? !(node.hidden ?? false) : (effectiveLayout[String(n.id)]?.visible ?? true)
    })
    return map
  }, [topology, nodes, effectiveLayout])

  const cabinetVisibilityMap = useMemo(() => {
    const map: Record<number, boolean> = {}
    cabinets.forEach((c) => {
      const node = nodes.find((nd) => nd.id === `cabinet:${c.id}`)
      map[c.id] = node ? !(node.hidden ?? false) : (effectiveLayout[`cab:${c.id}`]?.visible ?? true)
    })
    return map
  }, [cabinets, nodes, effectiveLayout])

  // ── Adjacency (stable — only rebuilds when topology data changes) ────────────
  const adjacencyData = useMemo(
    () => topology ? buildAdjacency(topology.edges, topology.nodes) : null,
    [topology]
  )

  // ── Build ReactFlow edges (with transitivity through hidden nodes) ────────────
  const rfEdges = useMemo((): Edge[] => {
    if (!topology || !adjacencyData) return []
    const collapsed = computeCollapsedEdges(
      adjacencyData,
      visibilityMap,
      cabinetVisibilityMap,
    )
    const selKey = selectedDeviceId ? `device:${selectedDeviceId}` : null
    const selCabKey = selectedCabinetId ? `cabinet:${selectedCabinetId}` : null
    const activeKey = selKey ?? selCabKey
    const hasSelection = activeKey !== null

    return collapsed.map((ce) => {
      const isActive = hasSelection && (ce.src === activeKey || ce.tgt === activeKey)
      const isDimmed = hasSelection && !isActive

      if (!ce.isVirtual) {
        const stroke = isActive ? '#2563eb' : '#6b7280'
        const width  = isActive ? 2.5 : 1.5
        const opacity = isDimmed ? 0.15 : 1
        return {
          id: `edge:${ce.realEdgeId}`,
          source: ce.src,
          target: ce.tgt,
          label: isActive ? ce.label : undefined,
          type: 'floating',
          style: { stroke, strokeWidth: width, opacity },
          markerEnd:   { type: MarkerType.ArrowClosed, color: stroke, width: 10, height: 10 },
          markerStart: { type: MarkerType.ArrowClosed, color: stroke, width: 10, height: 10 },
          labelStyle:    { fontSize: 9, fill: stroke },
          labelBgStyle:  { fill: 'white', fillOpacity: 0.9 },
          labelBgPadding: [3, 3] as [number, number],
          zIndex: isActive ? 10 : 0,
        }
      }
      const pairKey = [ce.src, ce.tgt].sort().join('|')
      const opacity = isDimmed ? 0.1 : 1
      return {
        id: `virt:${pairKey}`,
        source: ce.src,
        target: ce.tgt,
        type: 'floating',
        style: { stroke: '#9ca3af', strokeWidth: isActive ? 1.5 : 1, strokeDasharray: '5,4', opacity },
      }
    })
  }, [adjacencyData, visibilityMap, cabinetVisibilityMap, selectedDeviceId, selectedCabinetId])

  const [edges, setEdges, onEdgesChange] = useEdgesState(rfEdges)

  // Sincronizza rfNodes → ReactFlow in modo selettivo:
  // - Reset completo (con posizioni) solo se la struttura della topologia cambia
  //   (nodi aggiunti/rimossi, mappa selezionata diversa).
  // - Aggiornamento in-place (solo data + hidden, preservando le posizioni draggabili)
  //   per tutti gli altri aggiornamenti (checkmk, search highlight, visibilità toggle
  //   post-salvataggio).
  const structureKeyRef = React.useRef<string>('')
  React.useEffect(() => {
    const nodeIds = (topology?.nodes ?? []).map(n => n.id).sort().join(',')
    const cabIds = (cabinets ?? []).map(c => c.id).sort().join(',')
    const newKey = `${selectedMapId}|${nodeIds}|${cabIds}`
    const structureChanged = newKey !== structureKeyRef.current
    structureKeyRef.current = newKey

    if (structureChanged) {
      // Struttura cambiata: reset completo con le posizioni di rfNodes
      setNodes(rfNodes)
    } else {
      // Solo dati/visibilità cambiati: aggiorna in-place senza toccare le posizioni
      setNodes((prev) =>
        prev.map((n) => {
          const fresh = rfNodes.find((r) => r.id === n.id)
          if (!fresh) return n
          return { ...n, data: fresh.data, hidden: fresh.hidden }
        })
      )
    }
  }, [rfNodes, setNodes]) // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => { setEdges(rfEdges) }, [rfEdges, setEdges])

  // ── Neighbor map for quick-toggle sidebar expansion ──────────────────────────
  const neighborMap = useMemo(() => {
    const map = new Map<string, string[]>()
    const push = (key: string, nb: string) => { map.set(key, [...(map.get(key) ?? []), nb]) }
    for (const e of topology?.edges ?? []) {
      const s = `device:${e.source_device_id}`, t = `device:${e.target_device_id}`
      push(s, t); push(t, s)
    }
    for (const n of topology?.nodes ?? []) {
      if (n.cabinet_id != null) {
        const s = `device:${n.id}`, t = `cabinet:${n.cabinet_id}`
        push(s, t); push(t, s)
      }
    }
    return map
  }, [topology])

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 4rem)' }}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 bg-white flex-shrink-0 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <GitBranch size={18} className="text-primary-500 flex-shrink-0" />
          <span className="text-sm font-semibold text-gray-700 flex-shrink-0">Topologia</span>
          <span className="text-gray-300">/</span>

          {/* Map selector */}
          <select
            value={selectedMapId ?? ''}
            onChange={(e) => {
              dirtyLayoutRef.current = {}
              setHasDirty(false)
              setSelectedDeviceId(null)
              setSelectedCabinetId(null)
              setSelectedMapId(e.target.value ? Number(e.target.value) : null)
            }}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 min-w-[180px] max-w-[240px]"
          >
            <option value="">— Seleziona mappa —</option>
            {mapList?.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>

          {isAdmin && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-dashed border-primary-400 text-primary-600 rounded-lg hover:bg-primary-50 transition-colors"
            >
              <Plus size={13} />
              Nuova mappa
            </button>
          )}

          {isAdmin && selectedMapId && (
            <button
              onClick={handleDeleteMap}
              disabled={isDeleting}
              className="flex items-center gap-1 px-2 py-1.5 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
              title="Elimina mappa"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>

        {isAdmin && selectedMapId && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={undoLayout}
              disabled={historySize.past === 0}
              title={`Annulla (Ctrl+Z) — ${historySize.past} passaggi`}
              className="flex items-center gap-1 px-2 py-1.5 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Undo2 size={14} />
            </button>
            <button
              onClick={redoLayout}
              disabled={historySize.future === 0}
              title={`Ripeti (Ctrl+Y) — ${historySize.future} passaggi`}
              className="flex items-center gap-1 px-2 py-1.5 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Redo2 size={14} />
            </button>
          </div>
        )}
        {selectedMapId && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => topologyGraphRef.current?.exportPng(activeMap?.name ?? 'topology')}
              title="Esporta come PNG"
              className="flex items-center gap-1 px-2 py-1.5 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Download size={14} />
              PNG
            </button>
            <button
              onClick={() => topologyGraphRef.current?.exportSvg(activeMap?.name ?? 'topology')}
              title="Esporta come SVG"
              className="flex items-center gap-1 px-2 py-1.5 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Download size={14} />
              SVG
            </button>
          </div>
        )}
        {hasDirty && isAdmin && (
          <button
            onClick={saveLayout}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition-colors flex-shrink-0"
          >
            <Save size={14} />
            Salva
          </button>
        )}
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left sidebar */}
        <div className="w-60 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-hidden">

          {/* Search */}
          <div className="p-3 border-b border-gray-100">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Nome, IP, MAC, armadio…"
                className="w-full pl-7 pr-7 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={12} />
                </button>
              )}
            </div>
            {hasSearch && (
              <p className="text-[10px] text-gray-500 mt-1">
                {totalMatches} trovati ({matchSet.size} dispositivi, {cabMatchSet.size} armadi)
              </p>
            )}
          </div>

          {/* Lists */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {!topology ? (
              <p className="text-xs text-gray-400 text-center py-4">Caricamento…</p>
            ) : (
              <>
                {/* Devices section — grouped by type */}
                {DEVICE_TYPE_GROUPS.map(({ type, label }) => {
                  const groupNodes = topology.nodes.filter((n) => n.device_type === type)
                  if (groupNodes.length === 0) return null
                  const collapsed = collapsedGroups.has(type)
                  const groupColors = DEVICE_COLORS[type] ?? DEVICE_COLORS.other
                  return (
                    <div key={type} className="mb-1">
                      {/* Group header */}
                      <div
                        className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5 flex items-center gap-1 cursor-pointer select-none hover:text-gray-600 transition-colors"
                        onClick={() => toggleGroup(type)}
                      >
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${groupColors.dot}`} />
                        {label} ({groupNodes.length})
                        {collapsed
                          ? <ChevronRight size={10} className="ml-auto flex-shrink-0" />
                          : <ChevronDown  size={10} className="ml-auto flex-shrink-0" />
                        }
                      </div>

                      {/* Group items */}
                      {!collapsed && groupNodes.map((n) => {
                        const c = DEVICE_COLORS[n.device_type] ?? DEVICE_COLORS.other
                        const visible = visibilityMap[n.id] ?? true
                        const isMatch = hasSearch && matchSet.has(n.id)
                        const isSelected = selectedDeviceId === n.id
                        return (
                          <div key={n.id}>
                            <div
                              className={[
                                'flex items-center gap-1.5 px-1.5 py-1 rounded text-xs mb-0.5 transition-colors',
                                isMatch    ? 'bg-yellow-50 border border-yellow-200' : '',
                                isSelected ? 'bg-primary-50' : 'hover:bg-gray-50',
                                !visible   ? 'opacity-40' : '',
                              ].filter(Boolean).join(' ')}
                            >
                              {isAdmin && selectedMapId ? (
                                <button
                                  onClick={() => toggleDeviceVisibility(n.id)}
                                  className="flex-shrink-0 text-gray-400 hover:text-gray-700"
                                  title={visible ? 'Nascondi' : 'Mostra'}
                                >
                                  {visible ? <Eye size={12} /> : <EyeOff size={12} />}
                                </button>
                              ) : (
                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c.dot}`} />
                              )}
                              <span
                                className="truncate cursor-pointer hover:text-primary-600 flex-1"
                                onClick={() => { setSelectedDeviceId(isSelected ? null : n.id); setSelectedCabinetId(null) }}
                                title={n.name}
                              >
                                {n.name}
                              </span>
                            </div>

                            {/* Neighbor quick-toggle (admin only, when selected) */}
                            {isSelected && isAdmin && selectedMapId && (
                              <div className="ml-4 mb-1 space-y-0.5">
                                {(neighborMap.get(`device:${n.id}`) ?? []).map((nbKey) => {
                                  const isDeviceNb = nbKey.startsWith('device:')
                                  const nid = parseInt(nbKey.split(':')[1], 10)
                                  const nbNode = isDeviceNb
                                    ? topology.nodes.find((d) => d.id === nid)
                                    : cabinets.find((cab) => cab.id === nid)
                                  const nbVisible = isDeviceNb
                                    ? (visibilityMap[nid] ?? true)
                                    : (cabinetVisibilityMap[nid] ?? true)
                                  const nbColors = isDeviceNb
                                    ? (DEVICE_COLORS[(nbNode as TopologyNode)?.device_type] ?? DEVICE_COLORS.other)
                                    : null
                                  return (
                                    <div key={nbKey} className="flex items-center gap-1 px-1 py-0.5 rounded text-[10px] text-gray-500 hover:bg-gray-50">
                                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${nbColors?.dot ?? 'bg-slate-400'}`} />
                                      <span className="flex-1 truncate">{(nbNode as any)?.name ?? nbKey}</span>
                                      <button
                                        onClick={() => isDeviceNb ? toggleDeviceVisibility(nid) : toggleCabinetVisibility(nid)}
                                        className="text-gray-400 hover:text-gray-700 flex-shrink-0"
                                        title={nbVisible ? 'Nascondi' : 'Mostra'}
                                      >
                                        {nbVisible ? <Eye size={10} /> : <EyeOff size={10} />}
                                      </button>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}

                {/* Cabinets section */}
                {cabinets.length > 0 && (
                  <div>
                    <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                      <LayoutDashboard size={10} />
                      Armadi ({cabinets.length})
                    </div>
                    {cabinets.map((cab) => {
                      const visible = cabinetVisibilityMap[cab.id] ?? true
                      const isMatch = hasSearch && cabMatchSet.has(cab.id)
                      const isSelected = selectedCabinetId === cab.id
                      return (
                        <div key={cab.id}>
                          <div
                            className={[
                              'flex items-center gap-1.5 px-1.5 py-1 rounded text-xs mb-0.5 transition-colors',
                              isMatch ? 'bg-yellow-50 border border-yellow-200' : '',
                              isSelected ? 'bg-slate-100' : 'hover:bg-gray-50',
                              !visible ? 'opacity-40' : '',
                            ].filter(Boolean).join(' ')}
                          >
                            {isAdmin && selectedMapId ? (
                              <button
                                onClick={() => toggleCabinetVisibility(cab.id)}
                                className="flex-shrink-0 text-gray-400 hover:text-gray-700"
                                title={visible ? 'Nascondi' : 'Mostra'}
                              >
                                {visible ? <Eye size={12} /> : <EyeOff size={12} />}
                              </button>
                            ) : (
                              <span className="w-2 h-2 rounded flex-shrink-0 bg-slate-400" />
                            )}
                            <span
                              className="truncate cursor-pointer hover:text-slate-700 flex-1"
                              onClick={() => { setSelectedCabinetId(isSelected ? null : cab.id); setSelectedDeviceId(null) }}
                              title={cab.name}
                            >
                              {cab.name}
                            </span>
                          </div>

                          {/* Neighbor quick-toggle for cabinet (admin only, when selected) */}
                          {isSelected && isAdmin && selectedMapId && (
                            <div className="ml-4 mb-1 space-y-0.5">
                              {(neighborMap.get(`cabinet:${cab.id}`) ?? []).map((nbKey) => {
                                const nid = parseInt(nbKey.split(':')[1], 10)
                                const nbNode = topology.nodes.find((d) => d.id === nid)
                                const nbVisible = visibilityMap[nid] ?? true
                                const nbColors = DEVICE_COLORS[nbNode?.device_type ?? 'other'] ?? DEVICE_COLORS.other
                                return (
                                  <div key={nbKey} className="flex items-center gap-1 px-1 py-0.5 rounded text-[10px] text-gray-500 hover:bg-gray-50">
                                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${nbColors.dot}`} />
                                    <span className="flex-1 truncate">{nbNode?.name ?? nbKey}</span>
                                    <button
                                      onClick={() => toggleDeviceVisibility(nid)}
                                      className="text-gray-400 hover:text-gray-700 flex-shrink-0"
                                      title={nbVisible ? 'Nascondi' : 'Mostra'}
                                    >
                                      {nbVisible ? <Eye size={10} /> : <EyeOff size={10} />}
                                    </button>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Canvas + floating detail panels */}
        <div className="flex-1 relative overflow-hidden min-w-0">

        {/* Canvas */}
        <ReactFlowProvider>
          {!selectedMapId ? (
            <div className="flex-1 flex items-center justify-center flex-col gap-3 text-gray-400 bg-gray-50">
              <GitBranch size={48} className="opacity-20" />
              <p className="text-sm">Seleziona una mappa dal menu in alto</p>
              {isAdmin && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                >
                  <Plus size={14} />
                  Crea prima mappa
                </button>
              )}
            </div>
          ) : (
            <TopologyGraph
              ref={topologyGraphRef}
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeDragStop={onNodeDragStop}
              isDraggable={isAdmin && !!selectedMapId}
              backgroundImageUrl={activeMap?.background_image_url}
              selectedNodeId={
                selectedDeviceId ? `device:${selectedDeviceId}`
                : selectedCabinetId ? `cabinet:${selectedCabinetId}`
                : null
              }
            />
          )}
        </ReactFlowProvider>

        {/* Right detail panel — Device (floating overlay, canvas never resizes) */}
        {selectedNode && !selectedCabinetId && (
          <div className="absolute right-0 top-0 h-full w-72 bg-white border-l border-gray-200 shadow-xl overflow-y-auto z-10">
            <div className="p-4">
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-semibold text-gray-900 text-sm leading-tight pr-2">{selectedNode.name}</h3>
                <button
                  onClick={() => setSelectedDeviceId(null)}
                  className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Badges */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                <DeviceTypeBadge type={selectedNode.device_type} />
                <DeviceStatusBadge status={selectedNode.status as 'active' | 'planned' | 'inactive' | 'decommissioned'} />
                {checkmkEntry && <CheckMKBadge status={checkmkEntry.state_label} />}
              </div>

              {/* Details */}
              <div className="space-y-2 text-sm">
                {selectedNode.primary_ip && (
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">IP primario</p>
                    <p className="font-mono text-gray-800">{selectedNode.primary_ip}</p>
                  </div>
                )}
                {selectedNode.mac_address && (
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">MAC</p>
                    <p className="font-mono text-gray-800 text-xs">{selectedNode.mac_address}</p>
                  </div>
                )}
                {selectedNode.cabinet_name && (
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Armadio</p>
                    <p className="text-gray-800">{selectedNode.cabinet_name}</p>
                  </div>
                )}
                {selectedNode.site_name && (
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Locazione</p>
                    <p className="text-gray-800">{selectedNode.site_name}</p>
                  </div>
                )}
              </div>

              {/* CheckMK detail */}
              {checkmkEntry && (
                <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">CheckMK</p>
                  <div className="flex items-center gap-2 mb-1">
                    <CheckMKBadge status={checkmkEntry.state_label} />
                    <span className="text-xs text-gray-700 font-medium">{checkmkEntry.host_name}</span>
                  </div>
                  {checkmkEntry.address && (
                    <p className="text-xs text-gray-500 font-mono">{checkmkEntry.address}</p>
                  )}
                </div>
              )}

              {/* Open detail button — opens slide-over, does NOT navigate */}
              <button
                onClick={() => setDeviceDetailOpen(true)}
                className="mt-4 w-full text-center px-3 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
              >
                Vai al dispositivo →
              </button>
            </div>
          </div>
        )}

        {/* Right detail panel — Cabinet (floating overlay) */}
        {selectedCabinet && !selectedDeviceId && (
          <div className="absolute right-0 top-0 h-full w-72 bg-white border-l border-gray-200 shadow-xl overflow-y-auto z-10">
            <div className="p-4">
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <LayoutDashboard size={14} className="text-slate-500 flex-shrink-0" />
                  <h3 className="font-semibold text-gray-900 text-sm leading-tight truncate">{selectedCabinet.name}</h3>
                </div>
                <button
                  onClick={() => setSelectedCabinetId(null)}
                  className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-2 text-sm">
                {(selectedCabinet as any).site?.name && (
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Locazione</p>
                    <p className="text-gray-800">{(selectedCabinet as any).site.name}</p>
                  </div>
                )}
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide">Unità rack</p>
                  <p className="text-gray-800">{selectedCabinet.u_count}U</p>
                </div>
                {(selectedCabinet as any).location && (
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Posizione</p>
                    <p className="text-gray-800">{(selectedCabinet as any).location}</p>
                  </div>
                )}
              </div>

              {/* Open cabinet detail */}
              <button
                onClick={() => setCabinetDetailOpen(true)}
                className="mt-4 w-full text-center px-3 py-2 bg-slate-600 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-colors"
              >
                Visualizza armadio →
              </button>
            </div>
          </div>
        )}

        </div>{/* end canvas + floating panels wrapper */}
      </div>

      {/* Create map modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900">Nuova mappa topologica</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nome mappa *</label>
                <input
                  autoFocus
                  type="text"
                  value={newMapName}
                  onChange={(e) => setNewMapName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateMap()}
                  placeholder="Es. Locazione Principale, Piano 1°…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">URL immagine di sfondo (opzionale)</label>
                <input
                  type="url"
                  value={newMapBgUrl}
                  onChange={(e) => setNewMapBgUrl(e.target.value)}
                  placeholder="https://esempio.com/planimetria.jpg"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Annulla
              </button>
              <button
                onClick={handleCreateMap}
                disabled={!newMapName.trim() || isCreating}
                className="flex-1 px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreating ? 'Creazione…' : 'Crea'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Device detail slide-over */}
      {deviceDetailOpen && selectedDeviceId && (
        <DeviceDetailModal
          deviceId={selectedDeviceId}
          onClose={() => setDeviceDetailOpen(false)}
        />
      )}

      {/* Cabinet detail slide-over */}
      {cabinetDetailOpen && selectedCabinetId && (
        <CabinetDetailModal
          cabinetId={selectedCabinetId}
          onClose={() => setCabinetDetailOpen(false)}
          onSelectDevice={(deviceId) => {
            setSelectedDeviceId(deviceId)
            setSelectedCabinetId(null)
          }}
        />
      )}
    </div>
  )
}

export default TopologyPage
