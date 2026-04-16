from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Any

from app.discovery.drivers.base import BaseDriver, CollectedData
from app.discovery.lldp_cdp import (
    parse_cdp_neighbors_from_ssh,
    parse_lldp_neighbors_from_ssh,
)

if TYPE_CHECKING:
    from app.models.device import Device


class CiscoIosDriver(BaseDriver):
    """Driver for Cisco IOS/IOS-XE devices using SSH + netmiko + NTC-Templates."""

    DEVICE_TYPE = "cisco_ios"

    def __init__(self, device: "Device") -> None:
        super().__init__(device)

    def _send_command(self, net_connect, command: str, use_textfsm: bool = True, log_lines: list | None = None) -> Any:
        """Send a command and optionally parse with TextFSM/NTC-Templates.
        Errors are logged to log_lines (if provided) and an empty result is returned."""
        try:
            output = net_connect.send_command(command, use_textfsm=use_textfsm)
            return output
        except Exception as exc:
            msg = f"[WARN] '{command}' failed: {exc}"
            if log_lines is not None:
                log_lines.append(msg)
            return [] if use_textfsm else ""

    async def collect(self) -> CollectedData:
        """Collect data from a Cisco IOS device via SSH."""
        ssh_params = self._get_ssh_params()
        device_type = self.DEVICE_TYPE

        try:
            import netmiko
        except ImportError as exc:
            raise RuntimeError("netmiko is required for CiscoIosDriver") from exc

        collected = CollectedData()
        log_lines: list[str] = []

        def _ssh_collect():
            """Run blocking netmiko operations in a thread."""
            conn_params = {
                "device_type": device_type,
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
                # ── system info ──────────────────────────────────────────────
                version_raw = self._send_command(net_connect, "show version", log_lines=log_lines)
                if isinstance(version_raw, list) and version_raw:
                    ver = version_raw[0]
                    hw = ver.get("hardware")
                    serial = ver.get("serial")
                    collected.system_info = {
                        "model": (hw[0] if isinstance(hw, list) else hw) or None,
                        "serial": (serial[0] if isinstance(serial, list) else serial) or None,
                        "ios_version": ver.get("version"),
                        "hostname": ver.get("hostname"),
                    }
                    log_lines.append(f"show version OK: model={collected.system_info.get('model')}, "
                                     f"ios={collected.system_info.get('ios_version')}")
                elif isinstance(version_raw, str) and version_raw:
                    # TextFSM failed — try to extract hostname from raw output
                    import re
                    m = re.search(r'^(\S+)\s+uptime', version_raw, re.MULTILINE)
                    if m:
                        collected.system_info = {"hostname": m.group(1)}
                    log_lines.append("show version: TextFSM parse failed, raw output used")

                # ── Interfaces ───────────────────────────────────────────────
                ifaces_raw = self._send_command(net_connect, "show interfaces status", log_lines=log_lines)
                if isinstance(ifaces_raw, list):
                    for row in ifaces_raw:
                        collected.interfaces.append({
                            "name": row.get("port", ""),
                            "description": row.get("name", ""),
                            "oper_up": row.get("status", "").lower() == "connected",
                            "admin_up": row.get("status", "").lower() != "disabled",
                            "speed_mbps": _parse_speed(row.get("speed", "")),
                            "mac_address": None,
                        })
                    log_lines.append(f"show interfaces status OK: {len(collected.interfaces)} interfaces")

                # ── MAC address table ────────────────────────────────────────
                mac_raw = self._send_command(net_connect, "show mac address-table", log_lines=log_lines)
                if isinstance(mac_raw, list):
                    for row in mac_raw:
                        mac = _normalize_cisco_mac(row.get("destination_address", ""))
                        if mac:
                            collected.mac_entries.append({
                                "mac_address": mac,
                                "interface_name": row.get("destination_port", ""),
                                "vlan_id": _safe_int(row.get("vlan")),
                            })
                    log_lines.append(f"show mac address-table OK: {len(collected.mac_entries)} entries")

                # ── ARP ───────────────────────────────────────────────────────
                arp_raw = self._send_command(net_connect, "show arp", log_lines=log_lines)
                if isinstance(arp_raw, list):
                    for row in arp_raw:
                        mac = _normalize_cisco_mac(row.get("hardware_addr", ""))
                        ip = row.get("address", "")
                        if mac and ip:
                            collected.arp_entries.append({
                                "ip_address": ip,
                                "mac_address": mac,
                                "interface_name": row.get("interface", ""),
                            })
                    log_lines.append(f"show arp OK: {len(collected.arp_entries)} entries")

                # ── LLDP ──────────────────────────────────────────────────────
                lldp_raw = self._send_command(net_connect, "show lldp neighbors detail", log_lines=log_lines)
                if isinstance(lldp_raw, list):
                    for n in parse_lldp_neighbors_from_ssh(lldp_raw):
                        collected.neighbors.append({
                            "protocol": "lldp",
                            "local_port": n.local_port,
                            "remote_hostname": n.remote_hostname,
                            "remote_port": n.remote_port,
                            "remote_ip": n.remote_ip,
                            "platform": n.platform,
                        })
                    log_lines.append(f"show lldp neighbors detail OK: {len(collected.neighbors)} neighbors")

                # ── CDP ───────────────────────────────────────────────────────
                cdp_raw = self._send_command(net_connect, "show cdp neighbors detail", log_lines=log_lines)
                if isinstance(cdp_raw, list):
                    n_before = len(collected.neighbors)
                    for n in parse_cdp_neighbors_from_ssh(cdp_raw):
                        collected.neighbors.append({
                            "protocol": "cdp",
                            "local_port": n.local_port,
                            "remote_hostname": n.remote_hostname,
                            "remote_port": n.remote_port,
                            "remote_ip": n.remote_ip,
                            "platform": n.platform,
                        })
                    log_lines.append(f"show cdp neighbors detail OK: {len(collected.neighbors) - n_before} cdp neighbors")

                # ── VLANs ─────────────────────────────────────────────────────
                vlan_raw = self._send_command(net_connect, "show vlan brief", log_lines=log_lines)
                if isinstance(vlan_raw, list):
                    for row in vlan_raw:
                        if row.get("status", "").lower() == "active":
                            try:
                                collected.vlans.append(int(row["vlan_id"]))
                            except (KeyError, ValueError):
                                pass
                    log_lines.append(f"show vlan brief OK: {len(collected.vlans)} active VLANs")

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _ssh_collect)
        # Attach collected log lines to system_info for caller to forward to job log
        collected.ssh_log_lines = log_lines
        return collected


def _normalize_cisco_mac(mac: str) -> str | None:
    """Normalize Cisco MAC format xxxx.xxxx.xxxx to xx:xx:xx:xx:xx:xx."""
    if not mac:
        return None
    cleaned = mac.replace(".", "").replace(":", "").replace("-", "").lower()
    if len(cleaned) != 12:
        return None
    return ":".join(cleaned[i:i+2] for i in range(0, 12, 2))


def _parse_speed(speed_str: str) -> int | None:
    """Parse speed string like '1000' or 'a-100M' into Mbps."""
    if not speed_str:
        return None
    cleaned = speed_str.lower().replace("a-", "").replace("m", "")
    try:
        return int(cleaned)
    except ValueError:
        return None


def _safe_int(value) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
