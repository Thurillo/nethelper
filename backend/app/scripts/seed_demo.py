"""Crea i dati demo: 4 rack con dispositivi, interfacce e cavi preconfigurati.

Idempotente: controlla se il Site "Sede Demo" esiste già prima di creare.

Uso:
    cd backend
    python -m app.scripts.seed_demo
"""
from __future__ import annotations

import asyncio

import sqlalchemy as sa

from app.database import get_async_session
from app.models.device import Device, DeviceType, DeviceStatus
from app.models.interface import Interface, InterfaceType
from app.models.cabinet import Cabinet
from app.models.site import Site
from app.models.cable import Cable


async def main() -> None:
    async with get_async_session() as db:
        # ── Controllo idempotenza ──────────────────────────────────────────────
        result = await db.execute(sa.select(Site).where(Site.name == "Sede Demo"))
        if result.scalar_one_or_none() is not None:
            print("Dati demo già presenti (Site 'Sede Demo' esiste). Nulla da fare.")
            return

        print("Creazione dati demo...")

        # ── Sito ──────────────────────────────────────────────────────────────
        site = Site(name="Sede Demo", description="Sede demo con 4 rack preconfigurati")
        db.add(site)
        await db.flush()
        sid = site.id
        print(f"  Sito creato: {site.name} (id={sid})")

        # ── Armadi ────────────────────────────────────────────────────────────
        cab_r1 = Cabinet(site_id=sid, name="Rack 1", u_count=21, description="Rack 1 — sala server")
        cab_r2 = Cabinet(site_id=sid, name="Rack 2", u_count=21, description="Rack 2 — sala server")
        cab_r3 = Cabinet(site_id=sid, name="Rack 3", u_count=21, description="Rack 3 — piano 1")
        cab_r4 = Cabinet(site_id=sid, name="Rack 4", u_count=21, description="Rack 4 — piano 2")
        for c in [cab_r1, cab_r2, cab_r3, cab_r4]:
            db.add(c)
        await db.flush()
        print(f"  4 armadi creati (ids: {cab_r1.id}, {cab_r2.id}, {cab_r3.id}, {cab_r4.id})")

        # ──────────────────────────────────────────────────────────────────────
        # RACK 1
        # ──────────────────────────────────────────────────────────────────────
        pp_r1 = Device(
            site_id=sid, cabinet_id=cab_r1.id,
            name="PP-R1", device_type=DeviceType.patch_panel,
            model="Patch Panel 24P Cat6", u_position=1, u_height=1,
            status=DeviceStatus.active,
        )
        sw_r1 = Device(
            site_id=sid, cabinet_id=cab_r1.id,
            name="SW-R1", device_type=DeviceType.switch,
            model="Cisco Catalyst 2960-24TC-L", u_position=2, u_height=2,
            status=DeviceStatus.active,
        )
        pf_r1 = Device(
            site_id=sid, cabinet_id=cab_r1.id,
            name="PF-R1", device_type=DeviceType.patch_panel,
            model="Patch Panel Fibra 8 Coppie LC", u_position=4, u_height=1,
            status=DeviceStatus.active,
            notes="Pannello fibra ottica — 8 coppie LC duplex",
        )
        for d in [pp_r1, sw_r1, pf_r1]:
            db.add(d)
        await db.flush()

        # Interfacce PP-R1 (24 porte patch panel)
        pp_r1_ports: list[Interface] = []
        for i in range(1, 25):
            iface = Interface(device_id=pp_r1.id, name=f"port-{i}",
                              if_type=InterfaceType.patch_panel_port,
                              label=f"Porta {i}", if_index=i)
            db.add(iface)
            pp_r1_ports.append(iface)
        await db.flush()

        # Interfacce SW-R1 (24 eth + 4 sfp)
        sw_r1_eth: list[Interface] = []
        for i in range(1, 25):
            iface = Interface(device_id=sw_r1.id, name=f"eth{i}",
                              if_type=InterfaceType.ethernet,
                              speed_mbps=1000, admin_up=True, oper_up=True, if_index=i)
            db.add(iface)
            sw_r1_eth.append(iface)
        sw_r1_sfp: list[Interface] = []
        for i in range(1, 5):
            iface = Interface(device_id=sw_r1.id, name=f"sfp{i}",
                              if_type=InterfaceType.sfp,
                              speed_mbps=1000, admin_up=True, oper_up=False, if_index=24 + i)
            db.add(iface)
            sw_r1_sfp.append(iface)
        await db.flush()

        # Interfacce PF-R1 (8 coppie fibra)
        pf_r1_ports: list[Interface] = []
        for i in range(1, 9):
            iface = Interface(device_id=pf_r1.id, name=f"pair-{i}",
                              if_type=InterfaceType.fiber,
                              label=f"Coppia {i}", if_index=i)
            db.add(iface)
            pf_r1_ports.append(iface)
        await db.flush()

        # ──────────────────────────────────────────────────────────────────────
        # RACK 2
        # ──────────────────────────────────────────────────────────────────────
        pp_r2_1 = Device(
            site_id=sid, cabinet_id=cab_r2.id,
            name="PP-R2-1", device_type=DeviceType.patch_panel,
            model="Patch Panel 24P Cat6", u_position=1, u_height=1,
            status=DeviceStatus.active,
        )
        pp_r2_2 = Device(
            site_id=sid, cabinet_id=cab_r2.id,
            name="PP-R2-2", device_type=DeviceType.patch_panel,
            model="Patch Panel 24P Cat6", u_position=2, u_height=1,
            status=DeviceStatus.active,
        )
        pf_r2 = Device(
            site_id=sid, cabinet_id=cab_r2.id,
            name="PF-R2", device_type=DeviceType.patch_panel,
            model="Patch Panel Fibra 8 Coppie LC", u_position=3, u_height=1,
            status=DeviceStatus.active,
            notes="Pannello fibra ottica — 8 coppie LC duplex",
        )
        sw_r2 = Device(
            site_id=sid, cabinet_id=cab_r2.id,
            name="SW-R2", device_type=DeviceType.switch,
            model="Cisco Catalyst 2960-24TC-L", u_position=5, u_height=1,
            status=DeviceStatus.active,
        )
        for d in [pp_r2_1, pp_r2_2, pf_r2, sw_r2]:
            db.add(d)
        await db.flush()

        pp_r2_1_ports: list[Interface] = []
        for i in range(1, 25):
            iface = Interface(device_id=pp_r2_1.id, name=f"port-{i}",
                              if_type=InterfaceType.patch_panel_port, if_index=i)
            db.add(iface)
            pp_r2_1_ports.append(iface)

        pp_r2_2_ports: list[Interface] = []
        for i in range(1, 25):
            iface = Interface(device_id=pp_r2_2.id, name=f"port-{i}",
                              if_type=InterfaceType.patch_panel_port, if_index=i)
            db.add(iface)
            pp_r2_2_ports.append(iface)

        pf_r2_ports: list[Interface] = []
        for i in range(1, 9):
            iface = Interface(device_id=pf_r2.id, name=f"pair-{i}",
                              if_type=InterfaceType.fiber, label=f"Coppia {i}", if_index=i)
            db.add(iface)
            pf_r2_ports.append(iface)

        sw_r2_eth: list[Interface] = []
        for i in range(1, 25):
            iface = Interface(device_id=sw_r2.id, name=f"eth{i}",
                              if_type=InterfaceType.ethernet,
                              speed_mbps=1000, admin_up=True, oper_up=True, if_index=i)
            db.add(iface)
            sw_r2_eth.append(iface)
        sw_r2_sfp: list[Interface] = []
        for i in range(1, 5):
            iface = Interface(device_id=sw_r2.id, name=f"sfp{i}",
                              if_type=InterfaceType.sfp,
                              speed_mbps=1000, admin_up=True, oper_up=False, if_index=24 + i)
            db.add(iface)
            sw_r2_sfp.append(iface)
        await db.flush()

        # ──────────────────────────────────────────────────────────────────────
        # RACK 3
        # ──────────────────────────────────────────────────────────────────────
        pp_r3 = Device(
            site_id=sid, cabinet_id=cab_r3.id,
            name="PP-R3", device_type=DeviceType.patch_panel,
            model="Patch Panel 24P Cat6", u_position=1, u_height=1,
            status=DeviceStatus.active,
        )
        sw_r3 = Device(
            site_id=sid, cabinet_id=cab_r3.id,
            name="SW-R3", device_type=DeviceType.switch,
            model="Ubiquiti UniFi USW-48-POE", u_position=3, u_height=1,
            status=DeviceStatus.active,
        )
        pp_r3_2 = Device(
            site_id=sid, cabinet_id=cab_r3.id,
            name="PP-R3-2", device_type=DeviceType.patch_panel,
            model="Patch Panel 24P Cat6", u_position=5, u_height=1,
            status=DeviceStatus.active,
        )
        for d in [pp_r3, sw_r3, pp_r3_2]:
            db.add(d)
        await db.flush()

        pp_r3_ports: list[Interface] = []
        for i in range(1, 25):
            iface = Interface(device_id=pp_r3.id, name=f"port-{i}",
                              if_type=InterfaceType.patch_panel_port, if_index=i)
            db.add(iface)
            pp_r3_ports.append(iface)

        pp_r3_2_ports: list[Interface] = []
        for i in range(1, 25):
            iface = Interface(device_id=pp_r3_2.id, name=f"port-{i}",
                              if_type=InterfaceType.patch_panel_port, if_index=i)
            db.add(iface)
            pp_r3_2_ports.append(iface)

        sw_r3_eth: list[Interface] = []
        for i in range(1, 49):
            iface = Interface(device_id=sw_r3.id, name=f"eth{i}",
                              if_type=InterfaceType.ethernet,
                              speed_mbps=1000, admin_up=True, oper_up=True, if_index=i)
            db.add(iface)
            sw_r3_eth.append(iface)
        sw_r3_sfp: list[Interface] = []
        for i in range(1, 3):
            iface = Interface(device_id=sw_r3.id, name=f"sfp{i}",
                              if_type=InterfaceType.sfp,
                              speed_mbps=10000, admin_up=True, oper_up=False, if_index=48 + i)
            db.add(iface)
            sw_r3_sfp.append(iface)
        await db.flush()

        # ──────────────────────────────────────────────────────────────────────
        # RACK 4
        # ──────────────────────────────────────────────────────────────────────
        pp_r4_1 = Device(
            site_id=sid, cabinet_id=cab_r4.id,
            name="PP-R4-1", device_type=DeviceType.patch_panel,
            model="Patch Panel 24P Cat6", u_position=1, u_height=1,
            status=DeviceStatus.active,
        )
        pp_r4_2 = Device(
            site_id=sid, cabinet_id=cab_r4.id,
            name="PP-R4-2", device_type=DeviceType.patch_panel,
            model="Patch Panel 24P Cat6", u_position=2, u_height=1,
            status=DeviceStatus.active,
        )
        sw_r4 = Device(
            site_id=sid, cabinet_id=cab_r4.id,
            name="SW-R4", device_type=DeviceType.switch,
            model="Cisco Catalyst 2960-24TC-L", u_position=5, u_height=1,
            status=DeviceStatus.active,
        )
        for d in [pp_r4_1, pp_r4_2, sw_r4]:
            db.add(d)
        await db.flush()

        pp_r4_1_ports: list[Interface] = []
        for i in range(1, 25):
            iface = Interface(device_id=pp_r4_1.id, name=f"port-{i}",
                              if_type=InterfaceType.patch_panel_port, if_index=i)
            db.add(iface)
            pp_r4_1_ports.append(iface)

        pp_r4_2_ports: list[Interface] = []
        for i in range(1, 25):
            iface = Interface(device_id=pp_r4_2.id, name=f"port-{i}",
                              if_type=InterfaceType.patch_panel_port, if_index=i)
            db.add(iface)
            pp_r4_2_ports.append(iface)

        sw_r4_eth: list[Interface] = []
        for i in range(1, 25):
            iface = Interface(device_id=sw_r4.id, name=f"eth{i}",
                              if_type=InterfaceType.ethernet,
                              speed_mbps=1000, admin_up=True, oper_up=True, if_index=i)
            db.add(iface)
            sw_r4_eth.append(iface)
        sw_r4_sfp: list[Interface] = []
        for i in range(1, 5):
            iface = Interface(device_id=sw_r4.id, name=f"sfp{i}",
                              if_type=InterfaceType.sfp,
                              speed_mbps=1000, admin_up=True, oper_up=False, if_index=24 + i)
            db.add(iface)
            sw_r4_sfp.append(iface)
        await db.flush()

        # ──────────────────────────────────────────────────────────────────────
        # CAVI
        # Cable constraint: interface_a_id < interface_b_id (normalizzato auto)
        # ──────────────────────────────────────────────────────────────────────
        def make_cable(iface_x: Interface, iface_y: Interface,
                       cable_type: str = "cat6", label: str | None = None) -> Cable:
            a_id = min(iface_x.id, iface_y.id)
            b_id = max(iface_x.id, iface_y.id)
            return Cable(interface_a_id=a_id, interface_b_id=b_id,
                         cable_type=cable_type, label=label)

        cables = [
            # ── Rack 1 ──────────────────────────────────────────────────────
            # SW-R1 eth1  ←→  PP-R1 port-5
            make_cable(sw_r1_eth[0], pp_r1_ports[4], "cat6", "R1: SW eth1 → PP port-5"),
            # SW-R1 sfp1  ←→  PF-R1 pair-1
            make_cable(sw_r1_sfp[0], pf_r1_ports[0], "fiber_sm", "R1: SW sfp1 → PF pair-1"),
            # SW-R1 sfp2  ←→  PF-R1 pair-2
            make_cable(sw_r1_sfp[1], pf_r1_ports[1], "fiber_sm", "R1: SW sfp2 → PF pair-2"),

            # ── Rack 2 ──────────────────────────────────────────────────────
            # SW-R2 eth1  ←→  PP-R2-1 port-5
            make_cable(sw_r2_eth[0], pp_r2_1_ports[4], "cat6", "R2: SW eth1 → PP-1 port-5"),
            # SW-R2 eth2  ←→  PP-R2-2 port-8
            make_cable(sw_r2_eth[1], pp_r2_2_ports[7], "cat6", "R2: SW eth2 → PP-2 port-8"),
            # SW-R2 sfp3  ←→  PF-R2 pair-3
            make_cable(sw_r2_sfp[2], pf_r2_ports[2], "fiber_sm", "R2: SW sfp3 → PF pair-3"),

            # ── Rack 3 ──────────────────────────────────────────────────────
            # SW-R3 eth10–15  ←→  PP-R3 port-10–15
            make_cable(sw_r3_eth[9],  pp_r3_ports[9],  "cat6", "R3: SW eth10 → PP port-10"),
            make_cable(sw_r3_eth[10], pp_r3_ports[10], "cat6", "R3: SW eth11 → PP port-11"),
            make_cable(sw_r3_eth[11], pp_r3_ports[11], "cat6", "R3: SW eth12 → PP port-12"),
            make_cable(sw_r3_eth[12], pp_r3_ports[12], "cat6", "R3: SW eth13 → PP port-13"),
            make_cable(sw_r3_eth[13], pp_r3_ports[13], "cat6", "R3: SW eth14 → PP port-14"),
            make_cable(sw_r3_eth[14], pp_r3_ports[14], "cat6", "R3: SW eth15 → PP port-15"),

            # ── Rack 4 ──────────────────────────────────────────────────────
            # SW-R4 eth1–3  ←→  PP-R4-1 port-1–3
            make_cable(sw_r4_eth[0], pp_r4_1_ports[0], "cat6", "R4: SW eth1 → PP-1 port-1"),
            make_cable(sw_r4_eth[1], pp_r4_1_ports[1], "cat6", "R4: SW eth2 → PP-1 port-2"),
            make_cable(sw_r4_eth[2], pp_r4_1_ports[2], "cat6", "R4: SW eth3 → PP-1 port-3"),
            # SW-R4 eth4–6  ←→  PP-R4-2 port-4–6
            make_cable(sw_r4_eth[3], pp_r4_2_ports[3], "cat6", "R4: SW eth4 → PP-2 port-4"),
            make_cable(sw_r4_eth[4], pp_r4_2_ports[4], "cat6", "R4: SW eth5 → PP-2 port-5"),
            make_cable(sw_r4_eth[5], pp_r4_2_ports[5], "cat6", "R4: SW eth6 → PP-2 port-6"),
        ]

        for cable in cables:
            db.add(cable)
        await db.flush()

        await db.commit()
        print(f"  Dati demo creati con successo:")
        print(f"    - 4 armadi (Rack 1–4) con 21U ciascuno")
        print(f"    - 11 dispositivi (4 switch, 7 patch panel)")
        print(f"    - Interfacce: PP 24 porte, SW eth+sfp, PF fibra 8 coppie")
        print(f"    - {len(cables)} cavi cablati (ethernet cat6 + fibra SM)")


if __name__ == "__main__":
    asyncio.run(main())
