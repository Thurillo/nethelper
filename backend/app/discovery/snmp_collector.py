from __future__ import annotations

from typing import Any

from app.discovery.snmp_client import SNMPClient, _normalize_mac

# -----------------------------------------------------------------------
# Standard OIDs
# -----------------------------------------------------------------------

# System
OID_SYS_DESCR = "1.3.6.1.2.1.1.1.0"
OID_SYS_NAME = "1.3.6.1.2.1.1.5.0"
OID_SYS_LOCATION = "1.3.6.1.2.1.1.6.0"

# ifTable
OID_IF_TABLE = "1.3.6.1.2.1.2.2"
OID_IF_INDEX = "1.3.6.1.2.1.2.2.1.1"
OID_IF_DESCR = "1.3.6.1.2.1.2.2.1.2"
OID_IF_TYPE = "1.3.6.1.2.1.2.2.1.3"
OID_IF_SPEED = "1.3.6.1.2.1.2.2.1.5"
OID_IF_PHYS_ADDR = "1.3.6.1.2.1.2.2.1.6"
OID_IF_ADMIN_STATUS = "1.3.6.1.2.1.2.2.1.7"
OID_IF_OPER_STATUS = "1.3.6.1.2.1.2.2.1.8"
OID_IF_MTU = "1.3.6.1.2.1.2.2.1.4"

# ifXTable (64-bit counters)
OID_IF_X_TABLE = "1.3.6.1.2.1.31.1.1"
OID_IF_NAME = "1.3.6.1.2.1.31.1.1.1.1"
OID_IF_HIGH_SPEED = "1.3.6.1.2.1.31.1.1.1.15"

# ARP (ipNetToMediaTable)
OID_ARP_TABLE = "1.3.6.1.2.1.4.22"
OID_ARP_IF_INDEX = "1.3.6.1.2.1.4.22.1.1"
OID_ARP_PHYS_ADDR = "1.3.6.1.2.1.4.22.1.2"
OID_ARP_NET_ADDR = "1.3.6.1.2.1.4.22.1.3"
OID_ARP_TYPE = "1.3.6.1.2.1.4.22.1.4"

# BRIDGE-MIB MAC address table
OID_DOT1D_TP_FDB_ADDRESS = "1.3.6.1.2.1.17.4.3.1.1"
OID_DOT1D_TP_FDB_PORT = "1.3.6.1.2.1.17.4.3.1.2"

# LLDP
OID_LLDP_REM_TABLE = "1.0.8802.1.1.2.1.4.1"
OID_LLDP_REM_PORT_ID = "1.0.8802.1.1.2.1.4.1.1.7"
OID_LLDP_REM_SYS_NAME = "1.0.8802.1.1.2.1.4.1.1.9"
OID_LLDP_REM_SYS_DESC = "1.0.8802.1.1.2.1.4.1.1.10"
OID_LLDP_REM_MAN_ADDR = "1.0.8802.1.1.2.1.4.2"

# Cisco CDP
OID_CDP_CACHE_TABLE = "1.3.6.1.4.1.9.9.23.1.2.1.1"
OID_CDP_CACHE_ADDRESS = "1.3.6.1.4.1.9.9.23.1.2.1.1.4"
OID_CDP_CACHE_DEVICE_ID = "1.3.6.1.4.1.9.9.23.1.2.1.1.6"
OID_CDP_CACHE_DEVICE_PORT = "1.3.6.1.4.1.9.9.23.1.2.1.1.7"
OID_CDP_CACHE_PLATFORM = "1.3.6.1.4.1.9.9.23.1.2.1.1.8"

# Cisco VLAN (vtpVlanTable)
OID_VTP_VLAN_STATE = "1.3.6.1.4.1.9.9.46.1.3.1.1.2"


def _oid_last_n(oid_str: str, n: int = 1) -> str:
    """Extract last n components from an OID string."""
    parts = oid_str.rstrip(".").split(".")
    return ".".join(parts[-n:])


def _oid_index(oid_str: str, base_oid: str) -> str:
    """Return the index portion after the base OID."""
    if oid_str.startswith(base_oid + "."):
        return oid_str[len(base_oid) + 1:]
    return oid_str


class SNMPCollector:
    """High-level SNMP data collector."""

    async def collect_system_info(self, client: SNMPClient) -> dict:
        results = {}
        for oid, key in [
            (OID_SYS_NAME, "sys_name"),
            (OID_SYS_DESCR, "sys_descr"),
            (OID_SYS_LOCATION, "sys_location"),
        ]:
            try:
                val = await client.get(oid)
                results[key] = str(val) if val else None
            except Exception:
                results[key] = None
        return results

    async def collect_interfaces(self, client: SNMPClient) -> list[dict]:
        """Collect ifTable data. Returns list of interface dicts."""
        try:
            descr_data = await client.bulk_walk(OID_IF_DESCR)
            speed_data = await client.bulk_walk(OID_IF_SPEED)
            mac_data = await client.bulk_walk(OID_IF_PHYS_ADDR)
            admin_data = await client.bulk_walk(OID_IF_ADMIN_STATUS)
            oper_data = await client.bulk_walk(OID_IF_OPER_STATUS)
            mtu_data = await client.bulk_walk(OID_IF_MTU)
        except Exception:
            return []

        # Try to get high-speed names from ifXTable
        try:
            name_data = await client.bulk_walk(OID_IF_NAME)
            high_speed_data = await client.bulk_walk(OID_IF_HIGH_SPEED)
        except Exception:
            name_data = {}
            high_speed_data = {}

        interfaces = []
        for oid, descr in descr_data.items():
            idx = _oid_index(oid, OID_IF_DESCR)
            if not idx:
                continue
            # Try ifXTable name first
            name_oid = f"{OID_IF_NAME}.{idx}"
            name = str(name_data.get(name_oid, "") or descr or "").strip()
            if not name:
                continue

            mac_oid = f"{OID_IF_PHYS_ADDR}.{idx}"
            raw_mac = mac_data.get(mac_oid)
            mac = _normalize_mac(raw_mac) if raw_mac else None
            if mac and mac == "00:00:00:00:00:00":
                mac = None

            speed_oid = f"{OID_IF_HIGH_SPEED}.{idx}"
            hs = high_speed_data.get(speed_oid)
            if hs:
                speed_mbps = int(hs)
            else:
                raw_speed = speed_data.get(f"{OID_IF_SPEED}.{idx}")
                speed_mbps = int(raw_speed) // 1_000_000 if raw_speed else None

            admin_val = admin_data.get(f"{OID_IF_ADMIN_STATUS}.{idx}")
            oper_val = oper_data.get(f"{OID_IF_OPER_STATUS}.{idx}")
            mtu_val = mtu_data.get(f"{OID_IF_MTU}.{idx}")

            interfaces.append({
                "if_index": int(idx),
                "name": name,
                "description": str(descr or ""),
                "mac_address": mac,
                "speed_mbps": speed_mbps,
                "mtu": int(mtu_val) if mtu_val else None,
                "admin_up": int(admin_val) == 1 if admin_val is not None else None,
                "oper_up": int(oper_val) == 1 if oper_val is not None else None,
            })

        return interfaces

    async def collect_arp(self, client: SNMPClient) -> list[dict]:
        """Collect ARP table from ipNetToMediaTable."""
        try:
            mac_data = await client.bulk_walk(OID_ARP_PHYS_ADDR)
        except Exception:
            return []

        entries = []
        for oid, mac_raw in mac_data.items():
            # OID index format: if_index.ip_address
            idx = _oid_index(oid, OID_ARP_PHYS_ADDR)
            parts = idx.split(".")
            if len(parts) < 5:
                continue
            ip = ".".join(parts[1:5])
            mac = _normalize_mac(mac_raw) if mac_raw else None
            if mac and mac != "00:00:00:00:00:00":
                entries.append({
                    "ip_address": ip,
                    "mac_address": mac,
                    "if_index": int(parts[0]),
                })
        return entries

    async def collect_mac_table(self, client: SNMPClient) -> list[dict]:
        """Collect BRIDGE-MIB MAC address table."""
        try:
            mac_data = await client.bulk_walk(OID_DOT1D_TP_FDB_ADDRESS)
            port_data = await client.bulk_walk(OID_DOT1D_TP_FDB_PORT)
        except Exception:
            return []

        entries = []
        for oid, mac_raw in mac_data.items():
            idx = _oid_index(oid, OID_DOT1D_TP_FDB_ADDRESS)
            mac = _normalize_mac(mac_raw) if mac_raw else None
            if not mac or mac == "00:00:00:00:00:00":
                continue
            port_oid = f"{OID_DOT1D_TP_FDB_PORT}.{idx}"
            port = port_data.get(port_oid)
            entries.append({
                "mac_address": mac,
                "bridge_port": int(port) if port else None,
                "vlan_id": None,
            })
        return entries

    async def collect_mac_table_per_vlan(
        self, client: SNMPClient, vlan_id: int
    ) -> list[dict]:
        """Collect MAC table for a specific VLAN using community@vlan indexing."""
        vlan_client = SNMPClient(
            host=client.host,
            community=f"{client.community}@{vlan_id}",
            version=client.version,
            port=client.port,
            timeout=client.timeout,
        )
        entries = await self.collect_mac_table(vlan_client)
        for e in entries:
            e["vlan_id"] = vlan_id
        return entries

    async def collect_lldp(self, client: SNMPClient) -> list[dict]:
        """Collect LLDP neighbor table."""
        try:
            port_data = await client.bulk_walk(OID_LLDP_REM_PORT_ID)
            name_data = await client.bulk_walk(OID_LLDP_REM_SYS_NAME)
        except Exception:
            return []

        entries = []
        for oid, port_id in port_data.items():
            idx = _oid_index(oid, OID_LLDP_REM_PORT_ID)
            sys_name_oid = f"{OID_LLDP_REM_SYS_NAME}.{idx}"
            entries.append({
                "local_port_index": idx,
                "remote_port_id": str(port_id or ""),
                "remote_sys_name": str(name_data.get(sys_name_oid) or ""),
            })
        return entries

    async def collect_cdp(self, client: SNMPClient) -> list[dict]:
        """Collect Cisco CDP neighbor table."""
        try:
            device_data = await client.bulk_walk(OID_CDP_CACHE_DEVICE_ID)
            port_data = await client.bulk_walk(OID_CDP_CACHE_DEVICE_PORT)
            platform_data = await client.bulk_walk(OID_CDP_CACHE_PLATFORM)
            addr_data = await client.bulk_walk(OID_CDP_CACHE_ADDRESS)
        except Exception:
            return []

        entries = []
        for oid, device_id in device_data.items():
            idx = _oid_index(oid, OID_CDP_CACHE_DEVICE_ID)
            entries.append({
                "local_port_index": idx,
                "remote_device_id": str(device_id or ""),
                "remote_port": str(port_data.get(f"{OID_CDP_CACHE_DEVICE_PORT}.{idx}") or ""),
                "platform": str(platform_data.get(f"{OID_CDP_CACHE_PLATFORM}.{idx}") or ""),
                "remote_address": str(addr_data.get(f"{OID_CDP_CACHE_ADDRESS}.{idx}") or ""),
            })
        return entries

    async def collect_vlans(self, client: SNMPClient) -> list[int]:
        """Collect active VLAN IDs from Cisco vtpVlanTable."""
        try:
            vlan_data = await client.bulk_walk(OID_VTP_VLAN_STATE)
        except Exception:
            return []

        vlans = []
        for oid, state in vlan_data.items():
            # state=1 means active
            if int(state) == 1:
                vid_str = _oid_last_n(oid, 1)
                try:
                    vlans.append(int(vid_str))
                except ValueError:
                    pass
        return vlans
