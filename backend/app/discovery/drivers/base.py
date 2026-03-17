from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.models.device import Device


@dataclass
class CollectedData:
    """Container for all data collected from a device."""
    interfaces: list[dict] = field(default_factory=list)
    mac_entries: list[dict] = field(default_factory=list)
    arp_entries: list[dict] = field(default_factory=list)
    neighbors: list[dict] = field(default_factory=list)
    system_info: dict = field(default_factory=dict)
    vlans: list[int] = field(default_factory=list)


class BaseDriver(ABC):
    """Abstract base class for device drivers."""

    def __init__(self, device: "Device") -> None:
        self.device = device

    @abstractmethod
    async def collect(self) -> CollectedData:
        """Perform discovery and return collected data."""
        ...

    def _get_ssh_params(self) -> dict[str, Any]:
        """Return SSH connection parameters for netmiko."""
        from app.core.crypto import decrypt_value

        password = None
        if self.device.ssh_password_enc:
            try:
                password = decrypt_value(self.device.ssh_password_enc)
            except Exception:
                password = None

        # Fallback to vendor defaults
        if not password and self.device.vendor and self.device.vendor.ssh_default_password_enc:
            try:
                password = decrypt_value(self.device.vendor.ssh_default_password_enc)
            except Exception:
                password = None

        username = (
            self.device.ssh_username
            or (self.device.vendor.ssh_default_username if self.device.vendor else None)
            or "admin"
        )
        port = (
            self.device.ssh_port
            or (self.device.vendor.ssh_default_port if self.device.vendor else None)
            or 22
        )
        host = (self.device.primary_ip or "").split("/")[0]

        return {
            "host": host,
            "username": username,
            "password": password or "",
            "port": port,
            "key_file": self.device.ssh_key_path or None,
            "timeout": 30,
            "session_timeout": 60,
        }

    def _get_snmp_params(self) -> dict[str, Any]:
        """Return SNMP connection parameters."""
        from app.core.crypto import decrypt_value

        community = (
            self.device.snmp_community
            or (self.device.vendor.snmp_default_community if self.device.vendor else None)
            or "public"
        )
        version = self.device.snmp_version or 2
        host = (self.device.primary_ip or "").split("/")[0]

        params: dict[str, Any] = {
            "host": host,
            "community": community,
            "version": version,
        }

        if version == 3:
            auth_password = None
            priv_password = None
            if self.device.snmp_v3_auth_password_enc:
                try:
                    auth_password = decrypt_value(self.device.snmp_v3_auth_password_enc)
                except Exception:
                    pass
            if self.device.snmp_v3_priv_password_enc:
                try:
                    priv_password = decrypt_value(self.device.snmp_v3_priv_password_enc)
                except Exception:
                    pass
            params.update({
                "username": self.device.snmp_v3_username,
                "auth_protocol": self.device.snmp_v3_auth_protocol,
                "auth_password": auth_password,
                "priv_protocol": self.device.snmp_v3_priv_protocol,
                "priv_password": priv_password,
            })

        return params
