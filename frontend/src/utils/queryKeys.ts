/**
 * Centralizzazione di tutti i query key di React Query.
 * Usare sempre questi invece di stringhe inline per evitare
 * inconsistenze tra invalidazioni e fetch.
 */

import type { DeviceFilters } from '../types'

export const QK = {
  // ─── Auth ────────────────────────────────────────────────────────────────
  auth: {
    me: () => ['auth', 'me'] as const,
  },

  // ─── Devices ─────────────────────────────────────────────────────────────
  devices: {
    list:               (filters?: DeviceFilters)         => ['devices', filters] as const,
    one:                (id: number | string)              => ['devices', id] as const,
    interfaces:         (id: number | string)              => ['devices', id, 'interfaces'] as const,
    ports:              (id: number | string)              => ['devices', id, 'ports'] as const,
    ipAddresses:        (id: number | string)              => ['devices', id, 'ip-addresses'] as const,
    macEntries:         (id: number | string, params: unknown) => ['devices', id, 'mac-entries', params] as const,
    connectionsPreview: (id: number | string)              => ['devices', id, 'connections-preview'] as const,
    noCablesCount:      ()                                 => ['devices', 'no-cables-count'] as const,
    allForScan:         ()                                 => ['devices', 'all-for-scan'] as const,
    allBySite:          (siteId: number | string)          => ['devices', 'all', siteId] as const,
    forPpLink:          (typeFilter: string, onlyAvailable: boolean) =>
                                                             ['devices', 'for-pp-link', typeFilter, onlyAvailable] as const,
    // Legacy flat keys (usati in SwitchesPage / ConnectionsPage / PatchPanelsPage)
    // TODO: uniformare a devices.list() con filtri tipizzati
    forLink:     () => ['devices-for-link'] as const,
    allForLink:  () => ['devices-all-for-link'] as const,
    switches:    () => ['devices-switches'] as const,
    endDevices:  () => ['devices-end'] as const,
    ppForPp:     () => ['devices', 'pp-for-pp'] as const,
    switchForPp: () => ['devices', 'switch-for-pp'] as const,
  },

  // ─── Switch ports ─────────────────────────────────────────────────────────
  switchPorts: {
    byDevice: (deviceId: number | string) => ['switch-ports', deviceId] as const,
    root:     ()                           => ['switch-ports'] as const,
  },

  // ─── Patch panel ports ────────────────────────────────────────────────────
  patchPanelPorts: {
    byDevice: (deviceId: number | string) => ['patch-panel-ports', deviceId] as const,
    root:     ()                           => ['patch-panel-ports'] as const,
    all:      ()                           => ['patch-panels-all'] as const,
  },

  ppPorts: {
    byPp: (ppId: number | string) => ['pp-ports', ppId] as const,
    root: ()                       => ['pp-ports'] as const,
  },

  // ─── Cabinets ─────────────────────────────────────────────────────────────
  cabinets: {
    list:       (params?: unknown)           => ['cabinets', params] as const,
    one:        (id: number | string)        => ['cabinets', id] as const,
    bySite:     (siteId: number | string)    => ['cabinets', 'site', siteId] as const,
    rackDiagram:(id: number | string)        => ['cabinets', id, 'rack-diagram'] as const,
    all:        ()                           => ['cabinets', 'all'] as const,
    root:       ()                           => ['cabinets'] as const,
  },

  // ─── Sites ────────────────────────────────────────────────────────────────
  sites: {
    list:      (page?: number)           => ['sites', page] as const,
    one:       (id: number | string)     => ['sites', id] as const,
    cabinets:  (id: number | string)     => ['sites', id, 'cabinets'] as const,
    floorPlan: (id: number | string)     => ['sites', id, 'floor-plan'] as const,
    all:       ()                        => ['sites', 'all'] as const,
    root:      ()                        => ['sites'] as const,
  },

  // ─── VLANs ────────────────────────────────────────────────────────────────
  vlans: {
    list:       (page?: number)          => ['vlans', page] as const,
    all:        ()                       => ['vlans', 'all'] as const,
    allLegacy:  ()                       => ['vlans-all'] as const,   // alias per compatibilità
    interfaces: (id: number | string)    => ['vlans', id, 'interfaces'] as const,
    prefixes:   (id: number | string)    => ['vlans', id, 'prefixes'] as const,
    root:       ()                       => ['vlans'] as const,
  },

  // ─── Connections ──────────────────────────────────────────────────────────
  connections: {
    list: (params: unknown) => ['connections', params] as const,
    root: ()                => ['connections'] as const,
  },

  // ─── Vendors ──────────────────────────────────────────────────────────────
  vendors: {
    list: (page?: number)        => ['vendors', page] as const,
    all:  ()                     => ['vendors', 'all'] as const,
    root: ()                     => ['vendors'] as const,
  },

  // ─── Prefixes ─────────────────────────────────────────────────────────────
  prefixes: {
    list:         (filters: unknown, page: number) => ['prefixes', filters, page] as const,
    one:          (id: number | string)            => ['prefixes', id] as const,
    availableIps: (id: number | string)            => ['prefixes', id, 'available-ips'] as const,
    ipAddresses:  (id: number | string, page: number) => ['prefixes', id, 'ip-addresses', page] as const,
    root:         ()                               => ['prefixes'] as const,
  },

  // ─── Scan jobs ────────────────────────────────────────────────────────────
  scanJobs: {
    list:   (filters: unknown) => ['scan-jobs', filters] as const,
    one:    (id: number | string) => ['scan-jobs', id] as const,
    poll:   (id: number | string) => ['scan-jobs', id, 'poll'] as const,
    active: ()                    => ['scan-jobs-active'] as const,
    root:   ()                    => ['scan-jobs'] as const,
  },

  scheduledScans: {
    root: () => ['scheduled-scans'] as const,
  },

  // ─── Topology ─────────────────────────────────────────────────────────────
  topology: {
    graph:     (filters: unknown) => ['topology', filters] as const,
    neighbors: (deviceId: number | string) => ['topology', 'neighbors', deviceId] as const,
    maps:      (params?: unknown) => ['topology-maps', params] as const,
    map:       (id: number | string) => ['topology-maps', id] as const,
  },

  // ─── CheckMK ──────────────────────────────────────────────────────────────
  checkmk: {
    status:   () => ['checkmk', 'status'] as const,
    hosts:    () => ['checkmk', 'hosts'] as const,
    settings: () => ['checkmk', 'settings'] as const,
    info:     () => ['checkmk', 'info'] as const,
  },

  // ─── Conflicts ────────────────────────────────────────────────────────────
  conflicts: {
    list:         (filters: unknown) => ['conflicts', filters] as const,
    pendingCount: ()                  => ['conflicts', 'pending-count'] as const,
    root:         ()                  => ['conflicts'] as const,
  },

  // ─── Dashboard ────────────────────────────────────────────────────────────
  dashboard: {
    stats:   ()            => ['dashboard', 'stats'] as const,
    history: (days: number) => ['dashboard', 'history', days] as const,
    root:    ()            => ['dashboard'] as const,
  },

  // ─── Misc ─────────────────────────────────────────────────────────────────
  auditLog:    (filters: unknown, page: number) => ['audit-log', filters, page] as const,
  globalSearch:(q: string)                      => ['global-search', q] as const,
  systemInfo:  ()                               => ['system-info'] as const,
  users:       (page?: number)                  => ['users', page] as const,
}
