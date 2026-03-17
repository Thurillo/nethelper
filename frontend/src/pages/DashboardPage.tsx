import React from 'react'
import { Link } from 'react-router-dom'
import {
  Network, Server, Layers, Globe, AlertTriangle,
  MapPin, Cable, Activity, ArrowRight, TrendingUp
} from 'lucide-react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { useStats } from '../hooks/useDashboard'
import LoadingSpinner from '../components/common/LoadingSpinner'
import StatusDot from '../components/common/StatusDot'
import { clsx } from 'clsx'

/* ── Stat card ── */
interface StatCardProps {
  label: string
  value: number | string
  sublabel?: string
  subvalue?: number | string
  icon: React.ReactNode
  iconBg: string
  to?: string
  warning?: boolean
}

const StatCard: React.FC<StatCardProps> = ({
  label, value, sublabel, subvalue, icon, iconBg, to, warning,
}) => {
  const inner = (
    <div className={clsx(
      'card p-5 flex flex-col gap-3 transition-shadow',
      to && 'hover:shadow-card-md cursor-pointer',
      warning && 'border-orange-200 ring-1 ring-orange-200',
    )}>
      <div className="flex items-start justify-between">
        <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', iconBg)}>
          {icon}
        </div>
        {warning && (
          <span className="text-[11px] font-semibold text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full leading-5">
            Attenzione
          </span>
        )}
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 leading-none">{value}</p>
        <p className="text-sm text-gray-500 mt-1">{label}</p>
        {sublabel && subvalue !== undefined && (
          <p className="text-xs text-gray-400 mt-0.5">
            <span className="font-medium text-gray-600">{subvalue}</span> {sublabel}
          </p>
        )}
      </div>
    </div>
  )
  return to ? <Link to={to}>{inner}</Link> : inner
}

/* ── Scan type labels ── */
const SCAN_TYPE_LABELS: Record<string, string> = {
  snmp_full: 'SNMP Completo',
  snmp_arp: 'SNMP ARP',
  snmp_mac: 'SNMP MAC',
  snmp_lldp: 'SNMP LLDP',
  ssh_full: 'SSH Completo',
  ip_range: 'Range IP',
}

/* ── Page ── */
const DashboardPage: React.FC = () => {
  const { data: stats, isLoading } = useStats()

  if (isLoading) return <LoadingSpinner centered />
  if (!stats) return null

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Header */}
      <div className="section-header">
        <div>
          <h1 className="section-title">Pannello di controllo</h1>
          <p className="section-subtitle">Panoramica dell'infrastruttura di rete</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <TrendingUp size={14} />
          <span>Aggiornato ora</span>
        </div>
      </div>

      {/* Conflict banner */}
      {stats.pending_conflicts > 0 && (
        <Link to="/conflitti">
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-center gap-3 hover:bg-orange-100/80 transition-colors group">
            <div className="w-9 h-9 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="text-orange-500" size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-orange-800 text-sm">
                {stats.pending_conflicts} conflitt{stats.pending_conflicts === 1 ? 'o' : 'i'} da revisionare
              </p>
              <p className="text-xs text-orange-600 mt-0.5">Clicca per visualizzare e risolvere i conflitti in attesa</p>
            </div>
            <ArrowRight size={16} className="text-orange-400 group-hover:translate-x-1 transition-transform flex-shrink-0" />
          </div>
        </Link>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        <StatCard
          label="Dispositivi totali"
          value={stats.devices_total}
          sublabel="attivi"
          subvalue={stats.devices_active}
          icon={<Network size={19} className="text-blue-600" />}
          iconBg="bg-blue-50"
          to="/dispositivi"
        />
        <StatCard
          label="Sedi"
          value={stats.sites_count}
          sublabel="armadi"
          subvalue={stats.cabinets_count}
          icon={<MapPin size={19} className="text-emerald-600" />}
          iconBg="bg-emerald-50"
          to="/sedi"
        />
        <StatCard
          label="Interfacce"
          value={stats.interfaces_count}
          sublabel="cavi"
          subvalue={stats.cables_count}
          icon={<Cable size={19} className="text-purple-600" />}
          iconBg="bg-purple-50"
        />
        <StatCard
          label="VLAN"
          value={stats.vlans_count}
          sublabel="prefissi"
          subvalue={stats.prefixes_count}
          icon={<Layers size={19} className="text-teal-600" />}
          iconBg="bg-teal-50"
          to="/vlan"
        />
        <StatCard
          label="Indirizzi IP"
          value={stats.ip_addresses_count}
          icon={<Globe size={19} className="text-indigo-600" />}
          iconBg="bg-indigo-50"
          to="/prefissi"
        />
        <StatCard
          label="Armadi rack"
          value={stats.cabinets_count}
          icon={<Server size={19} className="text-gray-600" />}
          iconBg="bg-gray-100"
          to="/armadi"
        />
        <StatCard
          label="Conflitti in attesa"
          value={stats.pending_conflicts}
          icon={<AlertTriangle size={19} className={stats.pending_conflicts > 0 ? 'text-orange-500' : 'text-gray-400'} />}
          iconBg={stats.pending_conflicts > 0 ? 'bg-orange-50' : 'bg-gray-100'}
          to="/conflitti"
          warning={stats.pending_conflicts > 0}
        />
        <StatCard
          label="Switch non gestiti"
          value={stats.suspected_unmanaged_switches}
          icon={<Network size={19} className={stats.suspected_unmanaged_switches > 0 ? 'text-orange-500' : 'text-gray-400'} />}
          iconBg={stats.suspected_unmanaged_switches > 0 ? 'bg-orange-50' : 'bg-gray-100'}
          to="/conflitti"
          warning={stats.suspected_unmanaged_switches > 0}
        />
      </div>

      {/* Recent scans */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <Activity size={16} className="text-gray-400" />
            <h2 className="font-semibold text-gray-900 text-sm">Scansioni recenti</h2>
          </div>
          <Link
            to="/scansione"
            className="text-xs font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1 transition-colors"
          >
            Vedi tutte
            <ArrowRight size={12} />
          </Link>
        </div>

        {stats.recent_scans.length === 0 ? (
          <div className="empty-state py-12">
            <Activity size={32} className="empty-state-icon" />
            <p className="empty-state-text">Nessuna scansione eseguita</p>
            <p className="empty-state-hint">Vai alla sezione Scansione per avviare la prima</p>
          </div>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Stato</th>
                <th>Tipo</th>
                <th>Dispositivo</th>
                <th>Data</th>
                <th>Risultati</th>
              </tr>
            </thead>
            <tbody>
              {stats.recent_scans.map((job) => (
                <tr key={job.id}>
                  <td><StatusDot status={job.status} showLabel /></td>
                  <td className="font-medium">{SCAN_TYPE_LABELS[job.scan_type] ?? job.scan_type}</td>
                  <td>
                    {job.device?.name ?? (
                      <span className="text-gray-400 italic text-xs">Range IP</span>
                    )}
                  </td>
                  <td className="text-gray-500 text-xs">
                    {job.started_at
                      ? format(new Date(job.started_at), 'dd MMM HH:mm', { locale: it })
                      : format(new Date(job.created_at), 'dd MMM HH:mm', { locale: it })}
                  </td>
                  <td className="text-xs">
                    {job.status === 'completed' && (
                      <span className="text-gray-500">
                        {job.devices_found} disp.
                        {job.conflicts_created > 0 && (
                          <span className="text-orange-600 ml-1.5 font-medium">
                            · {job.conflicts_created} conf.
                          </span>
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
