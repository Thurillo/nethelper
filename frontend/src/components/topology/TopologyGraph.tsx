import React, { useCallback, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import type { TopologyGraph as TopologyGraphType, TopologyNode, DeviceType } from '../../types'
import LoadingSpinner from '../common/LoadingSpinner'
import EmptyState from '../common/EmptyState'
import { GitBranch, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'

const deviceColors: Record<DeviceType, string> = {
  switch: '#3b82f6',
  router: '#22c55e',
  ap: '#a855f7',
  server: '#f97316',
  patch_panel: '#9ca3af',
  firewall: '#ef4444',
  ups: '#eab308',
  workstation: '#06b6d4',
  printer: '#ec4899',
  camera: '#84cc16',
  phone: '#14b8a6',
  other: '#6b7280',
}

interface TopologyGraphProps {
  data: TopologyGraphType | undefined
  isLoading: boolean
  onNodeClick?: (node: TopologyNode) => void
}

const TopologyGraph: React.FC<TopologyGraphProps> = ({ data, isLoading, onNodeClick }) => {
  const fgRef = useRef<{ zoomIn: () => void; zoomOut: () => void; zoomToFit: (ms?: number) => void } | null>(null)
  const [hoveredNode, setHoveredNode] = useState<TopologyNode | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })

  const graphData = React.useMemo(() => {
    if (!data) return { nodes: [], links: [] }
    return {
      nodes: data.nodes.map((n) => ({
        id: n.id,
        label: n.label,
        device_type: n.device_type,
        device_id: n.device_id,
        primary_ip: n.primary_ip,
        cabinet_name: n.cabinet_name,
        site_name: n.site_name,
        status: n.status,
        color: deviceColors[n.device_type] ?? '#6b7280',
      })),
      links: data.edges.map((e) => ({
        source: e.source,
        target: e.target,
        label: e.label ?? e.cable_type ?? '',
        id: e.id,
      })),
    }
  }, [data])

  const handleNodeClick = useCallback(
    (node: { id?: string | number; device_id?: number; label?: string; device_type?: DeviceType; primary_ip?: string; cabinet_name?: string; site_name?: string; status?: string }) => {
      if (onNodeClick && node.device_id) {
        onNodeClick(node as unknown as TopologyNode)
      }
    },
    [onNodeClick]
  )

  const nodeCanvasObject = useCallback(
    (node: { x?: number; y?: number; color?: string; label?: string }, ctx: CanvasRenderingContext2D, globalScale: number) => {
      if (node.x === undefined || node.y === undefined) return
      const label = node.label ?? ''
      const fontSize = Math.max(8, 12 / globalScale)
      const nodeR = 8

      // Circle
      ctx.beginPath()
      ctx.arc(node.x, node.y, nodeR, 0, 2 * Math.PI)
      ctx.fillStyle = node.color ?? '#6b7280'
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.stroke()

      // Label
      if (globalScale > 0.5) {
        ctx.font = `${fontSize}px Inter, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillStyle = '#1f2937'
        ctx.fillText(label, node.x, node.y + nodeR + 2)
      }
    },
    []
  )

  if (isLoading) return <LoadingSpinner centered />
  if (!data || data.nodes.length === 0) {
    return (
      <EmptyState
        icon={<GitBranch size={48} />}
        title="Nessun dato topologico"
        description="Non ci sono dispositivi collegati da visualizzare. Aggiungi cavi tra le interfacce."
      />
    )
  }

  return (
    <div className="relative w-full h-full bg-gray-50 rounded-lg overflow-hidden border border-gray-200">
      <ForceGraph2D
        ref={fgRef as React.MutableRefObject<{ zoomIn: () => void; zoomOut: () => void; zoomToFit: (ms?: number) => void } | null>}
        graphData={graphData}
        nodeCanvasObject={nodeCanvasObject}
        nodeCanvasObjectMode={() => 'replace'}
        linkLabel={(link) => (link as { label?: string }).label ?? ''}
        linkColor={() => '#d1d5db'}
        linkWidth={1.5}
        onNodeClick={handleNodeClick}
        onNodeHover={(node, prevNode, event) => {
          if (node && 'device_id' in node) {
            setHoveredNode(node as unknown as TopologyNode)
            if (event) {
              const rect = (event.target as HTMLCanvasElement).getBoundingClientRect()
              setTooltipPos({ x: (event as MouseEvent).clientX - rect.left + 12, y: (event as MouseEvent).clientY - rect.top })
            }
          } else {
            setHoveredNode(null)
          }
        }}
        backgroundColor="#f9fafb"
        width={undefined}
        height={undefined}
      />

      {/* Zoom controls */}
      <div className="absolute top-4 right-4 flex flex-col gap-1">
        <button
          onClick={() => fgRef.current?.zoomIn()}
          className="p-2 bg-white rounded-lg shadow border border-gray-200 hover:bg-gray-50 text-gray-600"
          title="Zoom in"
        >
          <ZoomIn size={16} />
        </button>
        <button
          onClick={() => fgRef.current?.zoomOut()}
          className="p-2 bg-white rounded-lg shadow border border-gray-200 hover:bg-gray-50 text-gray-600"
          title="Zoom out"
        >
          <ZoomOut size={16} />
        </button>
        <button
          onClick={() => fgRef.current?.zoomToFit(400)}
          className="p-2 bg-white rounded-lg shadow border border-gray-200 hover:bg-gray-50 text-gray-600"
          title="Adatta alla finestra"
        >
          <Maximize2 size={16} />
        </button>
      </div>

      {/* Legenda */}
      <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow border border-gray-200 p-3">
        <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Legenda</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          {(Object.entries(deviceColors) as [DeviceType, string][]).slice(0, 8).map(([type, color]) => (
            <div key={type} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
              <span className="text-xs text-gray-600 capitalize">{type.replace('_', ' ')}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Node tooltip */}
      {hoveredNode && (
        <div
          className="absolute z-10 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg pointer-events-none whitespace-nowrap"
          style={{ left: tooltipPos.x, top: tooltipPos.y }}
        >
          <p className="font-semibold">{hoveredNode.label}</p>
          {hoveredNode.primary_ip && <p className="opacity-80">IP: {hoveredNode.primary_ip}</p>}
          {hoveredNode.cabinet_name && <p className="opacity-80">Armadio: {hoveredNode.cabinet_name}</p>}
          {hoveredNode.site_name && <p className="opacity-80">Sede: {hoveredNode.site_name}</p>}
          <p className="opacity-70 capitalize mt-0.5">{hoveredNode.device_type.replace('_', ' ')}</p>
        </div>
      )}
    </div>
  )
}

export default TopologyGraph
