from __future__ import annotations

import asyncio
from typing import Any

import puresnmp
from puresnmp import PyWrapper


def _normalize_mac(value: Any) -> str:
    """Convert bytes or string MAC to lowercase colon-separated format."""
    if isinstance(value, (bytes, bytearray)):
        return ":".join(f"{b:02x}" for b in value)
    if isinstance(value, str):
        # Clean up various formats: aa:bb:cc, aabbcc, aa-bb-cc
        cleaned = value.replace("-", "").replace(":", "").replace(".", "").lower()
        if len(cleaned) == 12:
            return ":".join(cleaned[i:i+2] for i in range(0, 12, 2))
    return str(value)


class SNMPClient:
    """Async wrapper around puresnmp."""

    def __init__(
        self,
        host: str,
        community: str = "public",
        version: int = 2,
        port: int = 161,
        timeout: int = 5,
        # SNMPv3 params
        username: str | None = None,
        auth_protocol: str | None = None,
        auth_password: str | None = None,
        priv_protocol: str | None = None,
        priv_password: str | None = None,
    ) -> None:
        self.host = host
        self.community = community
        self.version = version
        self.port = port
        self.timeout = timeout
        # SNMPv3
        self.username = username
        self.auth_protocol = auth_protocol
        self.auth_password = auth_password
        self.priv_protocol = priv_protocol
        self.priv_password = priv_password

    def _get_credentials(self):
        """Return puresnmp credentials object based on version."""
        if self.version == 3:
            from puresnmp.credentials import V3
            # Build auth and priv objects
            auth = None
            priv = None

            if self.auth_protocol and self.auth_password:
                proto = self.auth_protocol.upper()
                if "SHA" in proto:
                    from puresnmp.credentials import SHA
                    auth = SHA(self.auth_password)
                else:
                    from puresnmp.credentials import MD5
                    auth = MD5(self.auth_password)

            if self.priv_protocol and self.priv_password:
                proto = self.priv_protocol.upper()
                if "AES" in proto:
                    from puresnmp.credentials import AES
                    priv = AES(self.priv_password)
                else:
                    from puresnmp.credentials import DES
                    priv = DES(self.priv_password)

            return V3(self.username or "", auth=auth, priv=priv)
        else:
            from puresnmp.credentials import V2C
            return V2C(self.community)

    async def get(self, oid: str) -> Any:
        """Get a single OID value."""
        credentials = self._get_credentials()
        try:
            result = await puresnmp.aio.get(
                self.host,
                credentials,
                oid,
                port=self.port,
                timeout=self.timeout,
            )
            return result
        except Exception as exc:
            raise RuntimeError(f"SNMP GET {oid} from {self.host} failed: {exc}") from exc

    async def walk(self, oid: str) -> dict[str, Any]:
        """Walk an OID subtree. Returns {oid: value} dict."""
        credentials = self._get_credentials()
        try:
            result = {}
            async for varbind in puresnmp.aio.walk(
                self.host,
                credentials,
                oid,
                port=self.port,
                timeout=self.timeout,
            ):
                result[str(varbind.oid)] = varbind.value
            return result
        except Exception as exc:
            raise RuntimeError(f"SNMP WALK {oid} from {self.host} failed: {exc}") from exc

    async def bulk_walk(self, oid: str, max_repetitions: int = 25) -> dict[str, Any]:
        """Bulk walk an OID subtree. Falls back to walk for v1."""
        credentials = self._get_credentials()
        try:
            result = {}
            async for varbind in puresnmp.aio.bulkwalk(
                self.host,
                credentials,
                oid,
                bulk_size=max_repetitions,
                port=self.port,
                timeout=self.timeout,
            ):
                result[str(varbind.oid)] = varbind.value
            return result
        except AttributeError:
            # Fallback to regular walk
            return await self.walk(oid)
        except Exception as exc:
            raise RuntimeError(f"SNMP BULK_WALK {oid} from {self.host} failed: {exc}") from exc
