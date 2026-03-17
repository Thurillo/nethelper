import React from 'react'
import { Link } from 'react-router-dom'
import {
  Network, Server, Layers, Globe, AlertTriangle,
  MapPin, Cable, GitBranch, Wifi, Activity
} from 'lucide-react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { useStats } from '../hooks/useDashboard'
import LoadingSpinner from '../components/common/LoadingSpinner'
import StatusDot from '../components/common/StatusDot'

const StatCard: React.FC<{
  label: string
  value: number | string
  sublabel?: string
  subvalue?: number | string
  icon: React.ReactNode
  color: string
  to?: string
  warning?: boolean
}> = ({ label, value, sublabel, subvalue, icon, color, to, warning }) => {
  const content = (
    <div className={`bg-white rounded-xl border ${warning ? 'border-orange-300 shadow-orange-50' : 'border-gray-200'} p-5 hover:shadow-md transition-shadow`}>
      <div className="flex items-start justify-between">
        <div className={`p-2.5 rounded-xl ${color}`}>
          {icon}
        </div>
        {warning && (
          <span className="text-xs font-semibold text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">Attenzione</span>
        )}
      </div>
      <div className="mt-3">
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500 mt-0.5">{label}</p>
        {sublabel && subvalue !== undefined && (
          <p className="text-xs text-gray-400 mt-1">{subvalue} {sublabel}</p>
        )}
      </div>
    </div>
  )
  if (to) return <Link to={to}>{content}</Link>
  return content
}

const DashboardPage: React.FC = () => {
  const { data: stats, isLoading } = useStats()

  if (isLoading) return <LoadingSpinner centered />

  if (!stats) return null

  const SCAN_TYPE_LABELS: Record<string, string> = {
    snmp_full: 'SNMP Completo',
    snmp_arp: 'SNMP ARP',
    snmp_mac: 'SNMP MAC',
    snmp_lldp: 'SNMP LLDP',
    ssh_full: 'SSH Completo',
    ip_range: 'Range IP',
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Pannello di controllo</h1>
        <p className="text-sm text-gray-500 mt-1">Panoramica dell'infrastruttura di rete</p>
      </div>

      {/* Conflict banner */}
      {stats.pending_conflicts > 0 && (
        <Link to="/conflitti">
          <div className="bg-orange-50 border border-orange-300 rounded-xl p-4 flex items-center gap-3 hover:bg-orange-100 transition-colors">
            <AlertTriangle className="text-orange-500 flex-shrink-0" size={20} />
            <div>
              <p className="font-semibold text-orange-800">
                Hai {stats.pending_conflicts} conflitt{stats.pending_conflicts === 1 ? 'o' : 'i'} da revisionare
              </p>
              <p className="text-sm text-orange-600">Clicca per visualizzare i conflitti in attesa</p>
            </div>
            <span className="ml-auto text-orange-500 text-sm font-medium">Vai ai conflitti →</span>
          </div>
        </Link>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <StatCard
          label="Dispositivi totali"
          value={stats.devices_total}
          sublabel="attivi"
          subvalue={stats.devices_active}
          icon={<Network size={20} className="text-blue-600" />}
          color="bg-blue-50"
          to="/dispositivi"
        />
        <StatCard
          label="Sedi"
          value={stats.sites_count}
          sublabel="armadi"
          subvalue={stats.cabinets_count}
          icon={<MapPin size={20} className="text-green-600" />}
          color="bg-green-50"
          to="/sedi"
        />
        <StatCard
          label="Interfacce"
          value={stats.interfaces_count}
          sublabel="cavi"
          subvalue={stats.cables_count}
          icon={<Cable size={20} className="text-purple-600" />}
          color="bg-purple-50"
        />
        <StatCard
          label="VLAN"
          value={stats.vlans_count}
          sublabel="prefissi"
          subvalue={stats.prefixes_count}
          icon={<Layers size={20} className="text-teal-600" />}
          color="bg-teal-50"
          to="/vlan"
        />
        <StatCard
          label="Indirizzi IP"
          value={stats.ip_addresses_count}
          icon={<Globe size={20} className="text-indigo-600" />}
          color="bg-indigo-50"
          to="/prefissi"
        />
        <StatCard
          label="Conflitti in attesa"
          value={stats.pending_conflicts}
          icon={<AlertTriangle size={20} className={stats.pending_conflicts > 0 ? 'text-orange-600' : 'text-gray-400'} />}
          color={stats.pending_conflicts > 0 ? 'bg-orange-50' : 'bg-gray-50'}
          to="/conflitti"
          warning={stats.pending_conflicts > 0}
        />
        <StatCard
          label="Switch non gestiti"
          value={stats.suspected_unmanaged_switches}
          icon={<Wifi size={20} className={stats.suspected_unmanaged_switches > 0 ? 'text-orange-600' : 'text-gray-400'} />}
          color={stats.suspected_unmanaged_switches > 0 ? 'bg-orange-50' : 'bg-gray-50'}
          to="/conflitti"
          warning={stats.suspected_unmanaged_switches > 0}
        />
        <StatCard
          label="Armadi rack"
          value={stats.cabinets_count}
          icon={<Server size={20} className="text-gray-600" />}
          color="bg-gray-50"
          to="/armadi"
        />
      </div>

      {/* Recent scans */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-gray-400" />
            <h2 className="font-semibold text-gray-900">Scansioni recenti</h2>
          </div>
          <Link to="/scansione" className="text-sm text-primary-600 hover:underline">Vedi tutte</Link>
        </div>
        {stats.recent_scans.length === 0 ? (
          <div className="px-5 py-8 text-center text-gray-500 text-sm">
            Nessuna scansione eseguita
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Stato</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Tipo</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Dispositivo</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Data</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Risultati</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {stats.recent_scans.map((job) => (
                <tr key={job.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <StatusDot status={job.status} showLabel />
                  </td>
                  <td className="px-5 py-3 text-gray-700">
                    {SCAN_TYPE_LABELS[job.scan_type] ?? job.scan_type}
                  </td>
                  <td className="px-5 py-3 text-gray-700">
                    {job.device?.name ?? <span className="text-gray-400 italic">Range IP</span>}
                  </td>
                  <td className="px-5 py-3 text-gray-500">
                    {job.started_at
                      ? format(new Date(job.started_at), 'dd MMM HH:mm', { locale: it })
                      : format(new Date(job.created_at), 'dd MMM HH:mm', { locale: it })}
                  </td>
                  <td className="px-5 py-3 text-gray-500 text-xs">
                    {job.status === 'completed' && (
                      <span>
                        {job.devices_found} disp. • {job.interfaces_found} int.
                        {job.conflicts_created > 0 && (
                          <span className="text-orange-600 ml-1">• {job.conflicts_created} confl.</span>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default DashboardPage
