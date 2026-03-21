"""Popola la tabella vendor con i profili predefiniti per i principali brand di rete.

Idempotente: usa INSERT ... ON CONFLICT (slug) DO NOTHING.

Uso:
    cd backend
    python -m app.scripts.seed_vendors
"""
from __future__ import annotations

import asyncio

import sqlalchemy as sa

from app.database import get_async_session
from app.models.vendor import Vendor

# ─── Profili vendor predefiniti ───────────────────────────────────────────────
# driver_class: classe usata in discovery/vendor_registry.py
# generic_lldp → driver generico (IF-MIB + BRIDGE-MIB + LLDP-MIB + ARP); compatibile
#                con qualsiasi switch che supporta SNMP v2c + LLDP standard
VENDORS = [
    {
        "name": "Cisco IOS / IOS-XE",
        "slug": "cisco",
        "snmp_default_community": "public",
        "snmp_default_version": 2,
        "ssh_default_username": "admin",
        "ssh_default_port": 22,
        "driver_class": "cisco_ios",
        "notes": "Supporta CDP, per-VLAN MAC walk (community@vlan), LLDP.",
    },
    {
        "name": "Cisco NX-OS",
        "slug": "cisco_nxos",
        "snmp_default_community": "public",
        "snmp_default_version": 2,
        "ssh_default_username": "admin",
        "ssh_default_port": 22,
        "driver_class": "cisco_nxos",
        "notes": "Nexus datacenter switches. Usa SNMP standard + CDP.",
    },
    {
        "name": "Ubiquiti UniFi",
        "slug": "unifi",
        "snmp_default_community": "public",
        "snmp_default_version": 2,
        "ssh_default_username": "admin",
        "ssh_default_port": 22,
        "driver_class": "unifi",
        "notes": "Preferisce SSH mca-dump JSON per dati dettagliati su porte e vicini.",
    },
    {
        "name": "Fortinet FortiSwitch",
        "slug": "fortinet",
        "snmp_default_community": "public",
        "snmp_default_version": 2,
        "ssh_default_username": "admin",
        "ssh_default_port": 22,
        "driver_class": "generic_lldp",
        "notes": "SNMP standard + LLDP. Integrazione FortiGate via SNMP.",
    },
    {
        "name": "HPE Aruba",
        "slug": "hpe_aruba",
        "snmp_default_community": "public",
        "snmp_default_version": 2,
        "ssh_default_username": "admin",
        "ssh_default_port": 22,
        "driver_class": "generic_lldp",
        "notes": "Aruba CX / Aruba OS. SNMP standard + LLDP.",
    },
    {
        "name": "HP ProCurve / OfficeConnect",
        "slug": "hp_procurve",
        "snmp_default_community": "public",
        "snmp_default_version": 2,
        "ssh_default_username": "manager",
        "ssh_default_port": 22,
        "driver_class": "hp_procurve",
        "notes": "Switch HP legacy e OfficeConnect. SNMP standard.",
    },
    {
        "name": "Juniper",
        "slug": "juniper",
        "snmp_default_community": "public",
        "snmp_default_version": 2,
        "ssh_default_username": "admin",
        "ssh_default_port": 22,
        "driver_class": "generic_lldp",
        "notes": "EX Series / QFX. SNMP standard + LLDP.",
    },
    {
        "name": "Netgear",
        "slug": "netgear",
        "snmp_default_community": "public",
        "snmp_default_version": 2,
        "ssh_default_username": "admin",
        "ssh_default_port": 22,
        "driver_class": "generic_lldp",
        "notes": "Switch Netgear managed. SNMP standard + LLDP.",
    },
    {
        "name": "MikroTik",
        "slug": "mikrotik",
        "snmp_default_community": "public",
        "snmp_default_version": 2,
        "ssh_default_username": "admin",
        "ssh_default_port": 22,
        "driver_class": "generic_lldp",
        "notes": "RouterOS / SwOS. SNMP standard + LLDP/MNDP.",
    },
    {
        "name": "D-Link",
        "slug": "dlink",
        "snmp_default_community": "public",
        "snmp_default_version": 2,
        "ssh_default_username": "admin",
        "ssh_default_port": 22,
        "driver_class": "generic_lldp",
        "notes": "Switch D-Link managed. SNMP standard.",
    },
    {
        "name": "TP-Link / Omada",
        "slug": "tplink",
        "snmp_default_community": "public",
        "snmp_default_version": 2,
        "ssh_default_username": "admin",
        "ssh_default_port": 22,
        "driver_class": "generic_lldp",
        "notes": "Switch TP-Link managed e Omada. SNMP standard.",
    },
]


async def main() -> None:
    inserted = 0
    skipped = 0

    async with get_async_session() as db:
        for v in VENDORS:
            # Controlla se il vendor esiste già (slug unico)
            result = await db.execute(
                sa.select(Vendor.id).where(Vendor.slug == v["slug"])
            )
            if result.scalar_one_or_none() is not None:
                skipped += 1
                continue

            vendor = Vendor(
                name=v["name"],
                slug=v["slug"],
                snmp_default_community=v.get("snmp_default_community"),
                snmp_default_version=v.get("snmp_default_version", 2),
                ssh_default_username=v.get("ssh_default_username"),
                ssh_default_port=v.get("ssh_default_port", 22),
                driver_class=v.get("driver_class"),
                notes=v.get("notes"),
            )
            db.add(vendor)
            inserted += 1

        await db.commit()

    total = len(VENDORS)
    print(f"Vendor seed completato: {inserted} inseriti, {skipped} già presenti (totale {total}).")


if __name__ == "__main__":
    asyncio.run(main())
