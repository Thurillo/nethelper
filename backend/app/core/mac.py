"""MAC address normalization utilities."""
from __future__ import annotations
import re


def normalize_mac(mac: str) -> str | None:
    """
    Accept any common MAC format and return XX:XX:XX:XX:XX:XX (lowercase).

    Supported input formats:
      - XX:XX:XX:XX:XX:XX  (standard, colons)
      - XX-XX-XX-XX-XX-XX  (dashes)
      - XXXXXXXXXXXX       (bare hex, 12 chars)
      - XXXX.XXXX.XXXX     (Cisco dot notation)

    Returns None if the input cannot be parsed as a valid MAC.
    """
    if not mac:
        return None
    # Strip whitespace
    mac = mac.strip()
    # Remove separators and normalise to bare 12-char hex
    bare = re.sub(r'[:\-\.]', '', mac).lower()
    if not re.fullmatch(r'[0-9a-f]{12}', bare):
        return None
    # Reformat as XX:XX:XX:XX:XX:XX
    return ':'.join(bare[i:i+2] for i in range(0, 12, 2))


def mac_to_cisco(mac: str) -> str | None:
    """
    Convert a MAC (any format) to Cisco dot notation XXXX.XXXX.XXXX.
    Returns None if input is not a valid MAC.
    """
    norm = normalize_mac(mac)
    if norm is None:
        return None
    bare = norm.replace(':', '')
    return f"{bare[0:4]}.{bare[4:8]}.{bare[8:12]}"


def mac_to_colons(mac: str) -> str | None:
    """Alias for normalize_mac — returns XX:XX:XX:XX:XX:XX."""
    return normalize_mac(mac)
