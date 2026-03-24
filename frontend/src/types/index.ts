// ============================================================
// AUTH & USERS
// ============================================================

export type UserRole = 'admin' | 'operator' | 'viewer'

export interface User {
  id: number
  username: string
  email: string
  role: UserRole
  is_active: boolean
  last_login: string | null
  created_at: string
}

export interface LoginRequest {
  username: string
  password: string
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
}

export interface UserCreate {
  username: string
  email: string
  password: string
  role: UserRole
}

export interface UserUpdate {
  email?: string
  role?: UserRole
  is_active?: boolean
  password?: string
}

// ============================================================
// VENDORS
// ============================================================

export interface Vendor {
  id: number
  name: string
  slug: string
  driver_class: string | null
  snmp_default_community: string | null
  snmp_default_version: number
  ssh_default_username: string | null
  has_password: boolean
  ssh_default_port: number
  notes: string | null
  created_at: string
}

export interface VendorCreate {
  name: string
  slug: string
  driver_class?: string | null
  snmp_default_community?: string | null
  snmp_default_version?: number
  ssh_default_username?: string | null
  ssh_default_password?: string | null
  ssh_default_port?: number
  notes?: string | null
}

// ============================================================
// SITES & CABINETS
// ============================================================

export interface Site {
  id: number
  name: string
  description: string | null
  address: string | null
  cabinets_count?: number
  created_at: string
}

export interface SiteCreate {
  name: string
  description?: string | null
  address?: string | null
}

export interface Cabinet {
  id: number
  name: string
  site_id: number
  site?: { id: number; name: string }
  u_count: number
  description: string | null
  devices_count?: number
  used_u?: number
  devices_summary?: Record<string, number>
}

export interface CabinetCreate {
  name: string
  site_id: number
  u_count?: number
  description?: string | null
}

export interface RackDiagramDevice {
  id: number
  name: string
  device_type: DeviceType
  status: DeviceStatus
  u_height: number
  u_position: number | null
  primary_ip: string | null
  model: string | null
  serial_number: string | null
  notes: string | null
}

export interface RackDiagramSlot {
  u_position: number
  u_height: number
  is_free: boolean
  device: RackDiagramDevice | null
}

export interface RackDiagram {
  cabinet: Cabinet
  slots: RackDiagramSlot[]
  free_slots: number[]
  used_u: number
  free_u: number
}

// ============================================================
// DEVICES
// ============================================================

export type DeviceType =
  | 'switch'
  | 'router'
  | 'access_point'
  | 'server'
  | 'patch_panel'
  | 'pdu'
  | 'firewall'
  | 'ups'
  | 'unmanaged_switch'
  | 'workstation'
  | 'printer'
  | 'camera'
  | 'phone'
  | 'other'

export type DeviceStatus = 'active' | 'inactive' | 'planned' | 'decommissioned'

export interface Device {
  id: number
  name: string
  device_type: DeviceType
  status: DeviceStatus
  primary_ip: string | null
  management_ip: string | null
  mac_address: string | null        // XX:XX:XX:XX:XX:XX
  mac_address_cisco: string | null  // XXXX.XXXX.XXXX (computed by backend)
  serial_number: string | null
  asset_tag: string | null
  cabinet_id: number | null
  cabinet?: Cabinet
  cabinet_name?: string | null
  vendor_name?: string | null
  u_position: number | null
  u_height: number
  vendor_id: number | null
  vendor?: Vendor
  model: string | null
  os_version: string | null
  snmp_community: string | null
  snmp_version: number
  snmp_v3_username: string | null
  snmp_v3_auth_protocol: string | null
  snmp_v3_priv_protocol: string | null
  ssh_username: string | null
  ssh_port: number | null
  ssh_key_path: string | null
  notes: string | null
  last_seen: string | null
  interfaces_count?: number
  created_at: string
  updated_at: string
}

export interface DeviceCreate {
  name: string
  device_type: DeviceType
  status?: DeviceStatus
  primary_ip?: string | null
  management_ip?: string | null
  mac_address?: string | null
  serial_number?: string | null
  asset_tag?: string | null
  cabinet_id?: number | null
  u_position?: number | null
  u_height?: number
  vendor_id?: number | null
  model?: string | null
  os_version?: string | null
  snmp_community?: string | null
  snmp_version?: number
  snmp_v3_username?: string | null
  snmp_v3_auth_protocol?: string | null
  snmp_v3_priv_protocol?: string | null
  ssh_username?: string | null
  ssh_password?: string | null
  ssh_port?: number
  ssh_key_path?: string | null
  notes?: string | null
}

export interface DeviceBulkCreateItem {
  name: string
  primary_ip?: string | null
  device_type?: DeviceType
  status?: DeviceStatus
  cabinet_id?: number | null
  vendor_id?: number | null
  model?: string | null
  mac_address?: string | null
}

export interface DeviceBulkCreateRequest {
  devices: DeviceBulkCreateItem[]
  skip_duplicates?: boolean
}

export interface DeviceBulkCreateResponse {
  created: number
  skipped: number
  errors: string[]
}

// ============================================================
// INTERFACES
// ============================================================

export type InterfaceType =
  | 'ethernet'
  | 'fiber'
  | 'sfp'
  | 'qsfp'
  | 'wifi'
  | 'loopback'
  | 'vlan'
  | 'lag'
  | 'other'

export interface NetworkInterface {
  id: number
  device_id: number
  device?: Device
  name: string
  label: string | null
  interface_type: InterfaceType
  mac_address: string | null
  speed_mbps: number | null
  is_enabled: boolean
  is_uplink: boolean
  vlan_id: number | null
  vlan?: Vlan
  description: string | null
  room_destination: string | null
  port_number: number | null
  created_at: string
}

export interface InterfaceCreate {
  device_id: number
  name: string
  label?: string | null
  interface_type?: InterfaceType
  mac_address?: string | null
  speed_mbps?: number | null
  is_enabled?: boolean
  is_uplink?: boolean
  vlan_id?: number | null
  description?: string | null
  room_destination?: string | null
  port_number?: number | null
}

// ============================================================
// CABLES
// ============================================================

export type CableType = 'copper' | 'fiber' | 'dac' | 'aoc' | 'other'

export interface Cable {
  id: number
  cable_type: CableType
  label: string | null
  color: string | null
  length_m: number | null
  interface_a_id: number
  interface_a?: NetworkInterface
  interface_b_id: number
  interface_b?: NetworkInterface
  notes: string | null
  created_at: string
}

export interface CableCreate {
  cable_type?: CableType
  label?: string | null
  color?: string | null
  length_m?: number | null
  interface_a_id: number
  interface_b_id: number
  notes?: string | null
}

// ============================================================
// VLANs
// ============================================================

export interface Vlan {
  id: number
  vid: number
  name: string
  site_id: number | null
  site?: Site
  status: 'active' | 'reserved' | 'deprecated'
  description: string | null
  interfaces_count?: number
  prefixes_count?: number
  created_at: string
}

export interface VlanCreate {
  vid: number
  name: string
  site_id?: number | null
  status?: 'active' | 'reserved' | 'deprecated'
  description?: string | null
}

// ============================================================
// IP PREFIXES & ADDRESSES
// ============================================================

export interface IpPrefix {
  id: number
  prefix: string
  site_id: number | null
  site?: Site
  vlan_id: number | null
  vlan?: Vlan
  status: 'active' | 'reserved' | 'deprecated' | 'container'
  is_pool: boolean
  description: string | null
  total_ips: number
  used_ips: number
  utilization_percent: number
  created_at: string
}

export interface IpPrefixCreate {
  prefix: string
  site_id?: number | null
  vlan_id?: number | null
  status?: 'active' | 'reserved' | 'deprecated' | 'container'
  is_pool?: boolean
  description?: string | null
}

export interface PrefixUtilization {
  prefix: string
  total: number
  used: number
  available: number
  utilization_percent: number
}

export interface IpAddressDevice {
  id: number
  name: string
  vendor_name: string | null
  site_name: string | null
}

export interface IpAddress {
  id: number
  address: string
  prefix_id: number | null
  prefix?: IpPrefix
  device_id: number | null
  device?: IpAddressDevice
  interface_id: number | null
  interface?: NetworkInterface
  dns_name: string | null
  status: 'active' | 'reserved' | 'deprecated' | 'dhcp' | 'slaac'
  source: string | null
  notes: string | null
  last_seen: string | null
  created_at: string
  updated_at: string
}

export interface IpAddressCreate {
  address: string
  prefix_id?: number | null
  device_id?: number | null
  interface_id?: number | null
  dns_name?: string | null
  status?: 'active' | 'reserved' | 'deprecated' | 'dhcp' | 'slaac'
  notes?: string | null
}

// ============================================================
// MAC ENTRIES
// ============================================================

export interface MacEntry {
  id: number
  mac_address: string
  device_id: number
  device?: Device
  interface_id: number | null
  interface?: NetworkInterface
  vlan_id: number | null
  vlan?: Vlan
  ip_address: string | null
  source: 'snmp' | 'manual'
  first_seen: string
  last_seen: string
}

export interface MacEntryCreate {
  mac_address: string
  device_id: number
  interface_id?: number | null
  vlan_id?: number | null
  ip_address?: string | null
}

// ============================================================
// SCAN JOBS
// ============================================================

export type ScanType = 'snmp_full' | 'snmp_arp' | 'snmp_mac' | 'snmp_lldp' | 'ssh_full' | 'ip_range'

export type ScanStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface ScanJob {
  id: number
  device_id: number | null
  device?: Device
  scan_type: ScanType
  status: ScanStatus
  range_start_ip: string | null
  range_end_ip: string | null
  range_ports: number[] | null
  started_at: string | null
  completed_at: string | null
  result_summary: Record<string, unknown> | null
  error_message: string | null
  log_output: string | null
  is_scheduled: boolean
  triggered_by_user_id: number | null
  created_at: string
}

export interface IpRangeScanRequest {
  start_ip: string
  end_ip: string
  ports?: number[]
  timeout_ms?: number
}

// ============================================================
// CONFLICTS
// ============================================================

export type ConflictType =
  | 'ip_change'
  | 'mac_change'
  | 'interface_added'
  | 'interface_removed'
  | 'vlan_change'
  | 'hostname_change'
  | 'speed_change'
  | 'suspected_unmanaged_switch'

export type ConflictStatus = 'pending' | 'accepted' | 'rejected' | 'ignored'

export interface ScanConflict {
  id: number
  scan_job_id: number
  scan_job?: ScanJob
  device_id: number | null
  device?: Device
  conflict_type: ConflictType
  status: ConflictStatus
  field_name: string | null
  current_value: string | null
  detected_value: string | null
  description: string | null
  notes: string | null
  resolved_by_id: number | null
  resolved_by?: User
  resolved_at: string | null
  created_at: string
}

export interface ConflictResolveRequest {
  notes?: string | null
}

export interface BulkResolveRequest {
  conflict_ids: number[]
  notes?: string | null
}

// ============================================================
// AUDIT LOG
// ============================================================

export type AuditAction = 'create' | 'update' | 'delete' | 'login' | 'logout' | 'scan_start' | 'conflict_resolve'

export interface AuditLog {
  id: number
  user_id: number | null
  username: string | null
  action: AuditAction
  entity_table: string | null
  entity_id: number | null
  field_name: string | null
  old_value: string | null
  new_value: string | null
  client_ip: string | null
  description: string | null
  timestamp: string
}

// ============================================================
// TOPOLOGY
// ============================================================

export interface TopologyNode {
  id: string
  label: string
  device_type: DeviceType
  device_id: number
  primary_ip: string | null
  cabinet_name: string | null
  site_name: string | null
  status: DeviceStatus
}

export interface TopologyEdge {
  id: string
  source: string
  target: string
  cable_type: CableType | null
  label: string | null
  interface_a: string
  interface_b: string
}

export interface TopologyGraph {
  nodes: TopologyNode[]
  edges: TopologyEdge[]
}

// ============================================================
// DASHBOARD
// ============================================================

export interface DashboardStats {
  devices_total: number
  devices_active: number
  sites_count: number
  cabinets_count: number
  interfaces_count: number
  cables_count: number
  vlans_count: number
  prefixes_count: number
  ip_addresses_count: number
  pending_conflicts: number
  suspected_unmanaged_switches: number
  recent_scans: ScanJob[]
  devices_by_type: Record<string, number>
  devices_by_status: Record<string, number>
}

// ============================================================
// PATCH PANELS
// ============================================================

export interface PatchPanelPort {
  id: number
  device_id: number
  port_number: number
  label: string | null
  room_destination: string | null
  linked_interface_id: number | null
  linked_interface?: NetworkInterface
  notes: string | null
}

export interface PatchPanelPortUpdate {
  label?: string | null
  room_destination?: string | null
  linked_interface_id?: number | null
  notes?: string | null
}

// Corrisponde a InterfaceMinimal del backend (schemas/cable.py)
export interface InterfaceMinimal {
  id: number
  name: string
  label: string | null
  device_id: number
  device_name: string | null
}

// Corrisponde a PatchPortDetail del backend (routers/patch_panels.py)
export interface PatchPortDetail {
  interface: {
    id: number
    name: string
    label: string | null
    room_destination: string | null
    notes: string | null
    device_id: number
  }
  linked_interface: InterfaceMinimal | null
  cable_id: number | null
}

// Corrisponde a SwitchPortDetail del backend (routers/switches.py)
export interface SwitchPortDetail {
  interface: NetworkInterface
  linked_interface: InterfaceMinimal | null
  cable_id: number | null
}

// ============================================================
// SCHEDULED SCANS
// ============================================================

export interface ScheduledScan {
  id: number
  device_id: number
  device?: Device
  scan_type: ScanType
  cron_expression: string
  is_enabled: boolean
  last_run_at: string | null
  next_run_at: string | null
  created_at: string
}

export interface ScheduledScanCreate {
  device_id: number
  scan_type: ScanType
  cron_expression: string
  is_enabled?: boolean
}

// ============================================================
// PAGINATION & FILTERS
// ============================================================

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  size: number
  pages: number
}

export interface DeviceFilters {
  site_id?: number
  cabinet_id?: number
  device_type?: DeviceType
  exclude_device_type?: DeviceType
  status?: DeviceStatus
  q?: string
  search?: string
  not_connected_to_pp?: boolean
  page?: number
  size?: number
}

export interface ScanJobFilters {
  device_id?: number
  scan_type?: ScanType
  status?: ScanStatus
  page?: number
  size?: number
}

export interface ConflictFilters {
  device_id?: number
  conflict_type?: ConflictType
  status?: ConflictStatus
  page?: number
  size?: number
}

export interface AuditLogFilters {
  user_id?: number
  entity_table?: string
  action?: AuditAction
  from_dt?: string
  to_dt?: string
  page?: number
  size?: number
}
