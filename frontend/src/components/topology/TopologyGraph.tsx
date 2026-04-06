import React, { forwardRef, memo, useCallback, useEffect, useImperativeHandle } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Handle,
  Position,
  BaseEdge,
  EdgeLabelRenderer,
  getStraightPath,
  getNodesBounds,
  getViewportForBounds,
  useInternalNode,
  useReactFlow,
  type Node,
  type Edge,
  type EdgeProps,
  type NodeTypes,
  type EdgeTypes,
  type OnNodesChange,
  type OnEdgesChange,
} from '@xyflow/react'
import { toPng, toSvg } from 'html-to-image'
import '@xyflow/react/dist/style.css'
import { LayoutDashboard } from 'lucide-react'
import CheckMKBadge from '../common/CheckMKBadge'
import type { CheckMKStatus, DeviceType } from '../../types'

// ─── Device colors (same palette as SiteNetworkMapPage) ───────────────────────

export const DEVICE_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
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

// ─── Custom device node ────────────────────────────────────────────────────────

export interface TopologyDeviceNodeData extends Record<string, unknown> {
  label: string
  device_type: DeviceType
  primary_ip: string | null
  mac_address: string | null
  status: string
  cabinet_name: string | null
  checkmk_status: CheckMKStatus | null
  device_id: number
  highlighted: boolean
  dimmed: boolean
  onSelect: (id: number) => void
}

const DEVICE_TYPE_LABELS: Partial<Record<DeviceType, string>> = {
  switch: 'Switch', router: 'Router', access_point: 'AP', server: 'Server',
  patch_panel: 'Patch Panel', pdu: 'PDU', firewall: 'Firewall', ups: 'UPS',
  unmanaged_switch: 'Switch NG', workstation: 'WS', printer: 'Stampante',
  camera: 'Telecamera', phone: 'Telefono', other: 'Altro',
}

export const TopologyDeviceNode = memo(({ data, selected }: { data: TopologyDeviceNodeData; selected: boolean }) => {
  const c = DEVICE_COLORS[data.device_type] ?? DEVICE_COLORS.other
  const typeLabel = DEVICE_TYPE_LABELS[data.device_type] ?? data.device_type
  const tooltipParts = [
    `[${typeLabel}] ${data.label}`,
    data.primary_ip ? `IP: ${data.primary_ip}` : null,
    data.cabinet_name ? `Armadio: ${data.cabinet_name}` : null,
    data.status !== 'active' ? `Stato: ${data.status}` : null,
  ].filter(Boolean).join('\n')
  return (
    <>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <div
        title={tooltipParts}
        className={[
          'rounded-lg border-2 px-2.5 py-1.5 text-xs shadow-sm cursor-pointer transition-all',
          c.bg, c.border, c.text,
          selected ? 'ring-2 ring-primary-500 ring-offset-1' : '',
          data.highlighted ? 'ring-4 ring-yellow-400 ring-offset-1' : '',
          data.dimmed ? 'opacity-20' : '',
        ].filter(Boolean).join(' ')}
        style={{ minWidth: 130, maxWidth: 200 }}
        onClick={() => data.onSelect(data.device_id)}
      >
        {/* Name row + type badge */}
        <div className="flex items-start justify-between gap-1">
          <div className="font-semibold truncate leading-tight">{data.label}</div>
          <div className="text-[9px] opacity-50 flex-shrink-0 mt-px capitalize leading-tight">
            {typeLabel}
          </div>
        </div>
        {/* IP */}
        {data.primary_ip && (
          <div className="text-[10px] opacity-70 font-mono truncate mt-0.5">{data.primary_ip}</div>
        )}
        {/* Cabinet badge */}
        {data.cabinet_name && (
          <div className="text-[9px] opacity-55 truncate mt-0.5 flex items-center gap-0.5">
            <span>🗄</span>{data.cabinet_name}
          </div>
        )}
        {/* CheckMK */}
        {data.checkmk_status && (
          <div className="mt-0.5">
            <CheckMKBadge status={data.checkmk_status} />
          </div>
        )}
      </div>
    </>
  )
})

TopologyDeviceNode.displayName = 'TopologyDeviceNode'

// ─── Custom cabinet node ───────────────────────────────────────────────────────

export interface TopologyCabinetNodeData extends Record<string, unknown> {
  label: string
  cabinet_id: number
  u_count: number
  site_name: string | null
  highlighted: boolean
  dimmed: boolean
  onSelect: (id: number) => void
}

export const TopologyCabinetNode = memo(({ data, selected }: { data: TopologyCabinetNodeData; selected: boolean }) => {
  return (
    <>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <div
        className={[
          'rounded-lg border-2 px-3 py-2 text-xs shadow-sm cursor-pointer transition-all',
          'bg-slate-100 border-slate-500 text-slate-800',
          selected ? 'ring-2 ring-primary-500 ring-offset-1' : '',
          data.highlighted ? 'ring-4 ring-yellow-400 ring-offset-1' : '',
          data.dimmed ? 'opacity-20' : '',
        ].filter(Boolean).join(' ')}
        style={{ minWidth: 140, maxWidth: 200 }}
        onClick={() => data.onSelect(data.cabinet_id)}
      >
        <div className="flex items-center gap-1.5 mb-0.5">
          <LayoutDashboard size={12} className="flex-shrink-0 text-slate-500" />
          <div className="font-bold truncate">{data.label}</div>
        </div>
        <div className="text-[10px] text-slate-500 truncate">
          {data.u_count}U{data.site_name ? ` — ${data.site_name}` : ''}
        </div>
      </div>
    </>
  )
})

TopologyCabinetNode.displayName = 'TopologyCabinetNode'

// ─── Background image node ─────────────────────────────────────────────────────

interface BgImageNodeData extends Record<string, unknown> {
  url: string
  width: number
  height: number
}

const BgImageNode = memo(({ data }: { data: BgImageNodeData }) => (
  <img
    src={data.url}
    draggable={false}
    style={{
      display: 'block',
      width: data.width,
      height: data.height,
      borderRadius: 8,
      opacity: 0.55,
      userSelect: 'none',
      pointerEvents: 'none',
    }}
    alt="floor plan"
  />
))
BgImageNode.displayName = 'BgImageNode'

// ─── Floating edge: exits from the nearest point on each node's border ────────

function getNodeBorderPoint(
  cx: number, cy: number, w: number, h: number,
  tx: number, ty: number,
) {
  const dx = tx - cx, dy = ty - cy
  if (dx === 0 && dy === 0) return { x: cx, y: cy }
  const scaleX = dx !== 0 ? (w / 2) / Math.abs(dx) : Infinity
  const scaleY = dy !== 0 ? (h / 2) / Math.abs(dy) : Infinity
  const scale = Math.min(scaleX, scaleY)
  return { x: cx + dx * scale, y: cy + dy * scale }
}

const FloatingEdge = memo(({
  id, source, target, style, markerEnd, markerStart, label, labelStyle, labelBgStyle, labelBgPadding,
}: EdgeProps) => {
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)
  if (!sourceNode || !targetNode) return null

  const sw = sourceNode.measured?.width ?? 140
  const sh = sourceNode.measured?.height ?? 40
  const tw = targetNode.measured?.width ?? 140
  const th = targetNode.measured?.height ?? 40

  const scx = sourceNode.internals.positionAbsolute.x + sw / 2
  const scy = sourceNode.internals.positionAbsolute.y + sh / 2
  const tcx = targetNode.internals.positionAbsolute.x + tw / 2
  const tcy = targetNode.internals.positionAbsolute.y + th / 2

  const src = getNodeBorderPoint(scx, scy, sw, sh, tcx, tcy)
  const tgt = getNodeBorderPoint(tcx, tcy, tw, th, scx, scy)

  const [edgePath, labelX, labelY] = getStraightPath({
    sourceX: src.x, sourceY: src.y,
    targetX: tgt.x, targetY: tgt.y,
  })

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} markerStart={markerStart} />
      {label && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
              background: (labelBgStyle as any)?.fill ?? 'white',
              opacity: (labelBgStyle as any)?.fillOpacity ?? 0.85,
              padding: labelBgPadding ? `${(labelBgPadding as number[])[1]}px ${(labelBgPadding as number[])[0]}px` : '2px 4px',
              borderRadius: 3,
              fontSize: (labelStyle as any)?.fontSize ?? 9,
              color: (labelStyle as any)?.fill ?? '#6b7280',
            }}
          >
            {label as string}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
})
FloatingEdge.displayName = 'FloatingEdge'

const nodeTypesWithBg: NodeTypes = {
  topologyDevice: TopologyDeviceNode as unknown as NodeTypes['topologyDevice'],
  topologyCabinet: TopologyCabinetNode as unknown as NodeTypes['topologyCabinet'],
  bgImage: BgImageNode as unknown as NodeTypes['bgImage'],
}

const edgeTypesMap: EdgeTypes = {
  floating: FloatingEdge as unknown as EdgeTypes['floating'],
}

// ─── AutoFitView: re-fit viewport when container resizes ──────────────────────
// Suppressed when a node is selected. Double-checked both at callback and
// inside the debounced timeout to handle React batching race conditions.

const AutoFitView: React.FC<{ suppress: boolean }> = ({ suppress }) => {
  const { fitView } = useReactFlow()
  const suppressRef = React.useRef(suppress)
  suppressRef.current = suppress

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const observer = new ResizeObserver(() => {
      if (suppressRef.current) return
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (!suppressRef.current) fitView({ padding: 0.15, duration: 200 })
      }, 150)
    })
    const el = document.querySelector('.react-flow')
    if (el) observer.observe(el)
    return () => { observer.disconnect(); clearTimeout(timer) }
  }, [fitView])

  return null
}


// ─── Export handle ────────────────────────────────────────────────────────────

export interface TopologyGraphHandle {
  exportPng: (filename?: string) => Promise<void>
  exportSvg: (filename?: string) => Promise<void>
}

/** Placed inside <ReactFlow> so useReactFlow() has access to nodes + viewport. */
const ExportHelper = forwardRef<TopologyGraphHandle>((_, ref) => {
  const { getNodes } = useReactFlow()

  useImperativeHandle(ref, () => ({
    async exportPng(filename = 'topology') {
      const visibleNodes = getNodes().filter((n) => !n.hidden && n.id !== '__bg__')
      if (visibleNodes.length === 0) return
      const bounds = getNodesBounds(visibleNodes)
      const pad = 60
      const imgW = Math.max(Math.round(bounds.width) + pad * 2, 800)
      const imgH = Math.max(Math.round(bounds.height) + pad * 2, 600)
      const vp = getViewportForBounds(bounds, imgW, imgH, 0.05, 2, pad)
      const el = document.querySelector<HTMLElement>('.react-flow__viewport')
      if (!el) return
      const dataUrl = await toPng(el, {
        backgroundColor: '#ffffff',
        width: imgW,
        height: imgH,
        style: {
          width: `${imgW}px`,
          height: `${imgH}px`,
          transform: `translate(${vp.x}px,${vp.y}px) scale(${vp.zoom})`,
          transformOrigin: '0 0',
        },
      })
      const a = document.createElement('a')
      a.download = `${filename}.png`
      a.href = dataUrl
      a.click()
    },

    async exportSvg(filename = 'topology') {
      const visibleNodes = getNodes().filter((n) => !n.hidden && n.id !== '__bg__')
      if (visibleNodes.length === 0) return
      const bounds = getNodesBounds(visibleNodes)
      const pad = 60
      const imgW = Math.max(Math.round(bounds.width) + pad * 2, 800)
      const imgH = Math.max(Math.round(bounds.height) + pad * 2, 600)
      const vp = getViewportForBounds(bounds, imgW, imgH, 0.05, 2, pad)
      const el = document.querySelector<HTMLElement>('.react-flow__viewport')
      if (!el) return
      const dataUrl = await toSvg(el, {
        backgroundColor: '#ffffff',
        width: imgW,
        height: imgH,
        style: {
          width: `${imgW}px`,
          height: `${imgH}px`,
          transform: `translate(${vp.x}px,${vp.y}px) scale(${vp.zoom})`,
          transformOrigin: '0 0',
        },
      })
      const a = document.createElement('a')
      a.download = `${filename}.svg`
      a.href = dataUrl
      a.click()
    },
  }))

  return null
})
ExportHelper.displayName = 'ExportHelper'

// ─── Main component ────────────────────────────────────────────────────────────

interface TopologyGraphProps {
  nodes: Node[]
  edges: Edge[]
  onNodesChange: OnNodesChange
  onEdgesChange: OnEdgesChange
  onNodeDragStop?: (e: React.MouseEvent, node: Node) => void
  isDraggable?: boolean
  backgroundImageUrl?: string | null
  selectedNodeId?: string | null
}

const BG_W = 1600
const BG_H = 1000

const TopologyGraph = forwardRef<TopologyGraphHandle, TopologyGraphProps>(({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onNodeDragStop,
  isDraggable = false,
  backgroundImageUrl,
  selectedNodeId = null,
}, ref) => {
  const handleNodeDragStop = useCallback(
    (e: React.MouseEvent, node: Node) => {
      onNodeDragStop?.(e, node)
    },
    [onNodeDragStop]
  )

  const allNodes = backgroundImageUrl
    ? [
        {
          id: '__bg__',
          type: 'bgImage',
          position: { x: 0, y: 0 },
          draggable: false,
          selectable: false,
          focusable: false,
          zIndex: -1,
          data: { url: backgroundImageUrl, width: BG_W, height: BG_H } as BgImageNodeData,
        } as Node,
        ...nodes,
      ]
    : nodes

  return (
    <div className="flex-1 min-w-0 h-full">
      <ReactFlow
        nodes={allNodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={handleNodeDragStop}
        nodeTypes={nodeTypesWithBg}
        edgeTypes={edgeTypesMap}
        nodesDraggable={isDraggable}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.05}
        maxZoom={2}
        deleteKeyCode={null}
      >
        <ExportHelper ref={ref} />
        <AutoFitView suppress={selectedNodeId !== null} />
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e5e7eb" />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={(n) => {
            if (n.type === 'topologyCabinet') return '#64748b'
            const dt = (n.data as TopologyDeviceNodeData | undefined)?.device_type
            const dot = DEVICE_COLORS[dt ?? 'other']?.dot ?? 'bg-gray-400'
            const colorMap: Record<string, string> = {
              'bg-blue-400': '#60a5fa', 'bg-green-400': '#4ade80', 'bg-purple-400': '#c084fc',
              'bg-orange-400': '#fb923c', 'bg-gray-400': '#9ca3af', 'bg-yellow-400': '#facc15',
              'bg-red-400': '#f87171', 'bg-yellow-300': '#fde047', 'bg-indigo-400': '#818cf8',
              'bg-teal-400': '#2dd4bf', 'bg-pink-400': '#f472b6', 'bg-lime-400': '#a3e635',
              'bg-teal-300': '#5eead4',
            }
            return colorMap[dot] ?? '#9ca3af'
          }}
          pannable
          zoomable
          style={{ background: '#f9fafb', border: '1px solid #e5e7eb' }}
        />
      </ReactFlow>
    </div>
  )
})

TopologyGraph.displayName = 'TopologyGraph'

export default TopologyGraph
