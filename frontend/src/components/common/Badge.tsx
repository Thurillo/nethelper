import React from 'react'
import { clsx } from 'clsx'
import type { DeviceType, DeviceStatus, ConflictStatus, ConflictType } from '../../types'

type BadgeVariant =
  | 'green'
  | 'red'
  | 'blue'
  | 'yellow'
  | 'gray'
  | 'purple'
  | 'orange'
  | 'indigo'
  | 'teal'
  | 'pink'

const variantClasses: Record<BadgeVariant, string> = {
  green: 'bg-green-100 text-green-800',
  red: 'bg-red-100 text-red-800',
  blue: 'bg-blue-100 text-blue-800',
  yellow: 'bg-yellow-100 text-yellow-800',
  gray: 'bg-gray-100 text-gray-700',
  purple: 'bg-purple-100 text-purple-800',
  orange: 'bg-orange-100 text-orange-800',
  indigo: 'bg-indigo-100 text-indigo-800',
  teal: 'bg-teal-100 text-teal-800',
  pink: 'bg-pink-100 text-pink-800',
}

interface BadgeProps {
  children: React.ReactNode
  variant: BadgeVariant
  className?: string
  size?: 'sm' | 'md'
}

export const Badge: React.FC<BadgeProps> = ({ children, variant, className, size = 'md' }) => {
  return (
    <span
      className={clsx(
        'inline-flex items-center font-medium rounded-full',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-0.5 text-xs',
        variantClasses[variant],
        className
      )}
    >
      {children}
    </span>
  )
}

// Device status badge
export const DeviceStatusBadge: React.FC<{ status: DeviceStatus }> = ({ status }) => {
  const config: Record<DeviceStatus, { label: string; variant: BadgeVariant }> = {
    active: { label: 'Attivo', variant: 'green' },
    inactive: { label: 'Inattivo', variant: 'gray' },
    planned: { label: 'Pianificato', variant: 'blue' },
    decommissioned: { label: 'Dismesso', variant: 'red' },
  }
  const { label, variant } = config[status]
  return <Badge variant={variant}>{label}</Badge>
}

// Device type badge
export const DeviceTypeBadge: React.FC<{ type: DeviceType }> = ({ type }) => {
  const config: Record<DeviceType, { label: string; variant: BadgeVariant }> = {
    switch: { label: 'Switch', variant: 'blue' },
    router: { label: 'Router', variant: 'green' },
    ap: { label: 'Access Point', variant: 'purple' },
    server: { label: 'Server', variant: 'orange' },
    patch_panel: { label: 'Patch Panel', variant: 'gray' },
    firewall: { label: 'Firewall', variant: 'red' },
    ups: { label: 'UPS', variant: 'yellow' },
    workstation: { label: 'Workstation', variant: 'teal' },
    printer: { label: 'Stampante', variant: 'pink' },
    camera: { label: 'Telecamera', variant: 'indigo' },
    phone: { label: 'Telefono', variant: 'teal' },
    other: { label: 'Altro', variant: 'gray' },
  }
  const { label, variant } = config[type]
  return <Badge variant={variant}>{label}</Badge>
}

// Conflict status badge
export const ConflictStatusBadge: React.FC<{ status: ConflictStatus }> = ({ status }) => {
  const config: Record<ConflictStatus, { label: string; variant: BadgeVariant }> = {
    pending: { label: 'In attesa', variant: 'yellow' },
    accepted: { label: 'Accettato', variant: 'green' },
    rejected: { label: 'Rifiutato', variant: 'red' },
    ignored: { label: 'Ignorato', variant: 'gray' },
  }
  const { label, variant } = config[status]
  return <Badge variant={variant}>{label}</Badge>
}

// Conflict type badge
export const ConflictTypeBadge: React.FC<{ type: ConflictType }> = ({ type }) => {
  const config: Record<ConflictType, { label: string; variant: BadgeVariant }> = {
    ip_change: { label: 'Cambio IP', variant: 'blue' },
    mac_change: { label: 'Cambio MAC', variant: 'indigo' },
    interface_added: { label: 'Interfaccia aggiunta', variant: 'green' },
    interface_removed: { label: 'Interfaccia rimossa', variant: 'red' },
    vlan_change: { label: 'Cambio VLAN', variant: 'purple' },
    hostname_change: { label: 'Cambio hostname', variant: 'teal' },
    speed_change: { label: 'Cambio velocità', variant: 'orange' },
    suspected_unmanaged_switch: { label: 'Switch non gestito', variant: 'orange' },
  }
  const { label, variant } = config[type]
  return <Badge variant={variant}>{label}</Badge>
}

// User role badge
export const UserRoleBadge: React.FC<{ role: string }> = ({ role }) => {
  const config: Record<string, { label: string; variant: BadgeVariant }> = {
    admin: { label: 'Admin', variant: 'red' },
    operator: { label: 'Operatore', variant: 'blue' },
    viewer: { label: 'Visualizzatore', variant: 'gray' },
  }
  const c = config[role] ?? { label: role, variant: 'gray' as BadgeVariant }
  return <Badge variant={c.variant}>{c.label}</Badge>
}

export default Badge
