import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { X, ExternalLink } from 'lucide-react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { useQuery } from '@tanstack/react-query'
import { useDevice, useDeviceInterfaces, useDeviceIpAddresses } from '../../hooks/useDevices'
import { checkmkApi } from '../../api/checkmk'
import { DeviceTypeBadge, DeviceStatusBadge } from '../common/Badge'
import CheckMKBadge from '../common/CheckMKBadge'
import Table, { type Column } from '../common/Table'
import type { NetworkInterface, IpAddress } from '../../types'

type TabKey = 'info' | 'interfacce' | 'ip'

interface Props {
  deviceId: number
  onClose: () => void
}

const DeviceDetailModal: React.FC<Props> = ({ deviceId, onClose }) => {
  const [activeTab, setActiveTab] = useState<TabKey>('info')

  const { data: device } = useDevice(deviceId)
  const { data: interfaces } = useDeviceInterfaces(deviceId)
  const { data: ipAddresses } = useDeviceIpAddresses(deviceId)
  const { data: checkmkStatus } = useQuery({
    queryKey: ['checkmk', 'status'],
    queryFn: checkmkApi.getStatus,
    staleTime: 60_000,
    retry: false,
  })

  const cmk = (checkmkStatus as Record<number, { state_label: string; host_name: string; address: string }> | undefined)?.[deviceId]

  const interfaceColumns: Column<NetworkInterface>[] = [
    { key: 'name', header: 'Nome', render: (i) => <span className="font-mono text-sm font-medium">{i.name}</span> },
    { key: 'interface_type', header: 'Tipo', render: (i) => <span className="text-xs text-gray-600">{i.interface_type}</span> },
    { key: 'mac_address', header: 'MAC', render: (i) => <span className="font-mono text-xs text-gray-600">{i.mac_address ?? '—'}</span> },
    {
      key: 'is_enabled', header: 'Stato',
      render: (i) => <span className={`text-xs font-medium ${i.is_enabled ? 'text-green-600' : 'text-gray-400'}`}>{i.is_enabled ? 'Attiva' : 'Disattiva'}</span>,
    },
  ]

  const ipColumns: Column<IpAddress>[] = [
    { key: 'address', header: 'Indirizzo', render: (ip) => <span className="font-mono text-sm font-medium">{ip.address}</span> },
    { key: 'dns_name', header: 'DNS', render: (ip) => <span className="text-gray-500">{ip.dns_name ?? '—'}</span> },
    { key: 'status', header: 'Stato', render: (ip) => <span className="text-xs text-gray-600">{ip.status}</span> },
  ]

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'info', label: 'Informazioni' },
    { key: 'interfacce', label: `Interfacce (${interfaces?.length ?? '…'})` },
    { key: 'ip', label: `IP (${ipAddresses?.length ?? '…'})` },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-white w-full max-w-2xl flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-200 bg-gray-50 flex-shrink-0">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <h2 className="font-semibold text-gray-900 truncate text-base">{device?.name ?? '…'}</h2>
            {device && <DeviceTypeBadge type={device.device_type} />}
            {device && <DeviceStatusBadge status={device.status} />}
            {cmk && <CheckMKBadge status={cmk.state_label as any} />}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link
              to={`/dispositivi/${deviceId}`}
              target="_blank"
              rel="noopener"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <ExternalLink size={12} />
              Pagina completa
            </Link>
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 flex-shrink-0 bg-white">
          <div className="flex px-5">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-primary-600 text-primary-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'info' && device && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">IP primario</p>
                  <p className="font-mono text-sm font-medium">{device.primary_ip ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">IP gestione</p>
                  <p className="font-mono text-sm">{device.management_ip ?? device.primary_ip ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">MAC Address</p>
                  <p className="font-mono text-sm">{device.mac_address ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Armadio</p>
                  <p className="text-sm">{(device as any).cabinet_name ?? (device as any).cabinet?.name ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Vendor / Modello</p>
                  <p className="text-sm">
                    {[(device as any).vendor_name ?? (device as any).vendor?.name, device.model].filter(Boolean).join(' ') || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">N° seriale</p>
                  <p className="text-sm font-mono">{(device as any).serial_number ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Ultimo scan</p>
                  <p className="text-sm">
                    {(device as any).last_seen
                      ? format(new Date((device as any).last_seen), 'dd/MM/yyyy HH:mm', { locale: it })
                      : '—'}
                  </p>
                </div>
              </div>
              {(device as any).notes && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Note</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3 border border-gray-100">
                    {(device as any).notes}
                  </p>
                </div>
              )}
              {cmk && (
                <div className="bg-blue-50 rounded-lg border border-blue-100 p-3">
                  <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">CheckMK</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <CheckMKBadge status={cmk.state_label as any} />
                    <span className="text-sm font-medium text-gray-700">{cmk.host_name}</span>
                    {cmk.address && <span className="text-xs text-gray-400 font-mono">{cmk.address}</span>}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'interfacce' && (
            <Table
              columns={interfaceColumns}
              data={interfaces ?? []}
              keyExtractor={(i) => i.id}
              isLoading={!interfaces}
              emptyTitle="Nessuna interfaccia"
              emptyDescription="Non sono state trovate interfacce per questo dispositivo."
            />
          )}

          {activeTab === 'ip' && (
            <Table
              columns={ipColumns}
              data={ipAddresses ?? []}
              keyExtractor={(ip) => ip.id}
              isLoading={!ipAddresses}
              emptyTitle="Nessun indirizzo IP"
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default DeviceDetailModal
