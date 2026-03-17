from __future__ import annotations

import asyncio
import json
from typing import TYPE_CHECKING

from app.discovery.drivers.base import BaseDriver, CollectedData

if TYPE_CHECKING:
    from app.models.device import Device


class UnifiDriver(BaseDriver):
    """Driver for Ubiquiti UniFi switches using SSH (mca-dump)."""

    DEVICE_TYPE = "linux"

    def __init__(self, device: "Device") -> None:
        super().__init__(device)

    async def collect(self) -> CollectedData:
        """Collect data from a UniFi device via SSH."""
        ssh_params = self._get_ssh_params()

        try:
            import netmiko
        except ImportError as exc:
            raise RuntimeError("netmiko is required for UnifiDriver") from exc

        collected = CollectedData()

        def _ssh_collect():
            conn_params = {
                "device_type": self.DEVICE_TYPE,
                "host": ssh_params["host"],
                "username": ssh_params["username"],
                "password": ssh_params["password"],
                "port": ssh_params["port"],
                "timeout": ssh_params["timeout"],
                "session_timeout": ssh_params["session_timeout"],
            }
            if ssh_params.get("key_file"):
                conn_params["use_keys"] = True
                conn_params["key_file"] = ssh_params["key_file"]

            with netmiko.ConnectHandler(**conn_params) as net_connect:
                # mca-dump provides full device status as JSON
                mca_output = net_connect.send_command("mca-dump")

                try:
                    data = json.loads(mca_output)
                except (json.JSONDecodeError, TypeError):
                    return

                # System info
                collected.system_info = {
                    "model": data.get("board_rev"),
                    "hostname": data.get("hostname"),
                    "serial": data.get("serial"),
                    "firmware": data.get("version"),
                }

                # Interfaces from port_table
                port_table = data.get("port_table", [])
                for port in port_table:
                    port_idx = port.get("port_idx", 0)
                    name = port.get("name") or f"Port{port_idx}"
                    speed_raw = port.get("speed", 0)
                    speed_mbps = int(speed_raw) if speed_raw else None

                    collected.interfaces.append({
                        "name": name,
                        "description": port.get("op_mode", ""),
                        "mac_address": _normalize_mac(port.get("mac")),
                        "speed_mbps": speed_mbps,
                        "admin_up": port.get("enable", True),
                        "oper_up": port.get("up", False),
                        "if_index": port_idx,
                    })

                    # MAC entries on this port
                    for mac in port.get("mac_table", []):
                        collected.mac_entries.append({
                            "mac_address": _normalize_mac(mac.get("mac", "")),
                            "interface_name": name,
                            "vlan_id": mac.get("vlan"),
                            "ip_address": None,
                        })

                # Neighbor table (LLDP)
                neighbor_table = data.get("neighbor_table", [])
                for n in neighbor_table:
                    collected.neighbors.append({
                        "protocol": "lldp",
                        "local_port": str(n.get("local_port_idx", "")),
                        "remote_hostname": n.get("system_name", ""),
                        "remote_port": n.get("remote_port", ""),
                        "remote_ip": n.get("ip"),
                        "platform": n.get("system_description"),
                    })

                # IP info for ARP
                ip_info = data.get("ip_info", {})
                for ip, info in ip_info.items():
                    if isinstance(info, dict) and info.get("mac"):
                        collected.arp_entries.append({
                            "ip_address": ip,
                            "mac_address": _normalize_mac(info["mac"]),
                            "interface_name": info.get("interface", ""),
                        })

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _ssh_collect)
        return collected


def _normalize_mac(mac: str | None) -> str | None:
    """Normalize MAC address to xx:xx:xx:xx:xx:xx."""
    if not mac:
        return None
    cleaned = mac.replace(":", "").replace("-", "").replace(".", "").lower()
    if len(cleaned) != 12:
        return None
    return ":".join(cleaned[i:i+2] for i in range(0, 12, 2))
