from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class NeighborInfo:
    local_port: str
    remote_hostname: str
    remote_port: str
    remote_ip: str | None = None
    platform: str | None = None


def parse_lldp_neighbors(walk_result: list[dict]) -> list[NeighborInfo]:
    """Parse SNMP LLDP walk results into NeighborInfo list.

    walk_result items have keys: local_port_index, remote_port_id, remote_sys_name.
    """
    neighbors = []
    for entry in walk_result:
        local_port = str(entry.get("local_port_index", ""))
        remote_hostname = str(entry.get("remote_sys_name", "")).strip()
        remote_port = str(entry.get("remote_port_id", "")).strip()
        remote_ip = entry.get("remote_ip")

        if not remote_hostname and not remote_port:
            continue

        neighbors.append(
            NeighborInfo(
                local_port=local_port,
                remote_hostname=remote_hostname or "unknown",
                remote_port=remote_port,
                remote_ip=str(remote_ip) if remote_ip else None,
                platform=entry.get("remote_sys_desc"),
            )
        )
    return neighbors


def parse_cdp_neighbors(walk_result: list[dict]) -> list[NeighborInfo]:
    """Parse SNMP CDP walk results into NeighborInfo list.

    walk_result items have keys: local_port_index, remote_device_id,
    remote_port, platform, remote_address.
    """
    neighbors = []
    for entry in walk_result:
        local_port = str(entry.get("local_port_index", ""))
        remote_hostname = str(entry.get("remote_device_id", "")).strip()
        remote_port = str(entry.get("remote_port", "")).strip()
        platform = str(entry.get("platform", "")).strip() or None
        remote_address = entry.get("remote_address")

        if not remote_hostname:
            continue

        # Strip domain suffix from hostname (Cisco appends .domain.local)
        if "." in remote_hostname:
            remote_hostname = remote_hostname.split(".")[0]

        neighbors.append(
            NeighborInfo(
                local_port=local_port,
                remote_hostname=remote_hostname,
                remote_port=remote_port,
                remote_ip=str(remote_address) if remote_address else None,
                platform=platform,
            )
        )
    return neighbors


def parse_lldp_neighbors_from_ssh(parsed_output: list[dict]) -> list[NeighborInfo]:
    """Parse NTC-templates/TextFSM output for 'show lldp neighbors detail'."""
    neighbors = []
    for row in parsed_output:
        neighbors.append(
            NeighborInfo(
                local_port=row.get("LOCAL_INTERFACE", ""),
                remote_hostname=row.get("NEIGHBOR", ""),
                remote_port=row.get("NEIGHBOR_INTERFACE", ""),
                remote_ip=row.get("MANAGEMENT_IP") or None,
                platform=row.get("CAPABILITIES") or None,
            )
        )
    return neighbors


def parse_cdp_neighbors_from_ssh(parsed_output: list[dict]) -> list[NeighborInfo]:
    """Parse NTC-templates/TextFSM output for 'show cdp neighbors detail'."""
    neighbors = []
    for row in parsed_output:
        hostname = row.get("DESTINATION_HOST", "")
        if "." in hostname:
            hostname = hostname.split(".")[0]
        neighbors.append(
            NeighborInfo(
                local_port=row.get("LOCAL_INTERFACE", ""),
                remote_hostname=hostname,
                remote_port=row.get("REMOTE_PORT", ""),
                remote_ip=row.get("MANAGEMENT_IP") or None,
                platform=row.get("PLATFORM") or None,
            )
        )
    return neighbors
