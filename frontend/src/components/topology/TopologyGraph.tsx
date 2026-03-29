import React, { memo, useCallback, useEffect } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useReactFlow,
  type Node,
  type Edge,
  type NodeTypes,
  type OnNodesChange,
  type OnEdgesChange,
} from '@xyflow/react'
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
  checkmk_status: CheckMKStatus | null
  device_id: number
  highlighted: boolean
  dimmed: boolean
  onSelect: (id: number) => void
}

export const TopologyDeviceNode = memo(({ data, selected }: { data: TopologyDeviceNodeData; selected: boolean }) => {
  const c = DEVICE_COLORS[data.device_type] ?? DEVICE_COLORS.other
  return (
    <div
      className={[
        'rounded-lg border-2 px-2.5 py-1.5 text-xs shadow-sm cursor-pointer transition-all',
        c.bg, c.border, c.text,
        selected ? 'ring-2 ring-primary-500 ring-offset-1' : '',
        data.highlighted ? 'ring-4 ring-yellow-400 ring-offset-1' : '',
        data.dimmed ? 'opacity-20' : '',
      ].filter(Boolean).join(' ')}
      style={{ minWidth: 120, maxWidth: 180 }}
      onClick={() => data.onSelect(data.device_id)}
    >
      <div className="font-semibold truncate">{data.label}</div>
      {data.primary_ip && (
        <div className="text-[10px] opacity-70 font-mono truncate">{data.primary_ip}</div>
      )}
      {data.checkmk_status && (
        <div className="mt-0.5">
          <CheckMKBadge status={data.checkmk_status} />
        </div>
      )}
    </div>
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

const nodeTypesWithBg: NodeTypes = {
  topologyDevice: TopologyDeviceNode as unknown as NodeTypes['topologyDevice'],
  topologyCabinet: TopologyCabinetNode as unknown as NodeTypes['topologyCabinet'],
  bgImage: BgImageNode as unknown as NodeTypes['bgImage'],
}

// ─── AutoFitView: re-fit viewport when container resizes ──────────────────────

const AutoFitView: React.FC = () => {
  const { fitView } = useReactFlow()

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const observer = new ResizeObserver(() => {
      clearTimeout(timer)
      timer = setTimeout(() => fitView({ padding: 0.15, duration: 200 }), 150)
    })
    const el = document.querySelector('.react-flow')
    if (el) observer.observe(el)
    return () => { observer.disconnect(); clearTimeout(timer) }
  }, [fitView])

  return null
}

// ─── Main component ────────────────────────────────────────────────────────────

interface TopologyGraphProps {
  nodes: Node[]
  edges: Edge[]
  onNodesChange: OnNodesChange
  onEdgesChange: OnEdgesChange
  onNodeDragStop?: (e: React.MouseEvent, node: Node) => void
  isDraggable?: boolean
  backgroundImageUrl?: string | null
}

const BG_W = 1600
const BG_H = 1000

const TopologyGraph: React.FC<TopologyGraphProps> = ({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onNodeDragStop,
  isDraggable = false,
  backgroundImageUrl,
}) => {
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
        nodesDraggable={isDraggable}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.05}
        maxZoom={2}
        deleteKeyCode={null}
      >
        <AutoFitView />
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
}

export default TopologyGraph
