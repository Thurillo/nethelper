from __future__ import annotations

import asyncio
import re
import socket
import subprocess
import sys
from datetime import datetime, timezone
from ipaddress import ip_address as parse_ip, summarize_address_range

from app.tasks.celery_app import celery_app

# Lazy-loaded vendor lookup (loaded once per worker process)
_mac_lookup = None

def _get_mac_lookup():
    global _mac_lookup
    if _mac_lookup is None:
        try:
            from mac_vendor_lookup import MacLookup
            _mac_lookup = MacLookup()
        except Exception:
            _mac_lookup = False
    return _mac_lookup if _mac_lookup is not False else None


def _arp_mac(ip: str) -> str | None:
    """Read MAC address from kernel ARP table for a given IP."""
    try:
        result = subprocess.run(
            ["ip", "neigh", "show", ip],
            capture_output=True, text=True, timeout=2
        )
        # Output: "192.168.1.1 dev eth0 lladdr 2c:91:ab:ff:35:96 STALE"
        m = re.search(r'lladdr\s+([0-9a-fA-F:]{17})', result.stdout)
        if m:
            return m.group(1).lower()
    except Exception:
        pass
    return None


def _vendor_from_mac(mac: str) -> str | None:
    """Look up vendor name from MAC OUI."""
    lookup = _get_mac_lookup()
    if lookup is None:
        return None
    try:
        from mac_vendor_lookup import VendorNotFoundError
        return lookup.lookup(mac)
    except Exception:
        return None


def _get_event_loop() -> asyncio.AbstractEventLoop:
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            raise RuntimeError("Loop is closed")
        return loop
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        return loop


@celery_app.task(bind=True, max_retries=3, default_retry_delay=30, time_limit=600, soft_time_limit=540)
def run_device_scan(self, device_id: int, scan_job_id: int, scan_type: str) -> dict:
    """Run a full or partial SNMP/SSH device scan."""

    async def _run():
        from app.database import get_async_session
        from app.crud.scan_job import crud_scan_job
        from app.models.scan_job import ScanStatus, ScanType
        from app.models.device import Device
        from sqlalchemy import select

        async with get_async_session() as db:
            await crud_scan_job.update_status(db, scan_job_id, ScanStatus.running)
            await crud_scan_job.append_log(db, scan_job_id, f"[{datetime.now(timezone.utc).isoformat()}] Starting {scan_type} scan for device {device_id}...")

            result = await db.execute(select(Device).where(Device.id == device_id))
            device = result.scalar_one_or_none()
            if device is None:
                await crud_scan_job.update_status(
                    db, scan_job_id, ScanStatus.failed,
                    error_message=f"Device {device_id} not found."
                )
                return {"status": "failed", "error": "Device not found"}

            try:
                scan_type_enum = ScanType(scan_type)

                if scan_type_enum in (ScanType.ssh_full,):
                    driver_class_str = None
                    if device.vendor and device.vendor.driver_class:
                        driver_class_str = device.vendor.driver_class
                    if driver_class_str:
                        from app.discovery.vendor_registry import get_driver
                        DriverClass = get_driver(driver_class_str)
                        driver_instance = DriverClass(device)
                    else:
                        raise ValueError(f"No SSH driver configured for device {device_id}")
                else:
                    from app.discovery.snmp_client import SNMPClient
                    from app.discovery.snmp_collector import SNMPCollector
                    from app.discovery.drivers.base import CollectedData

                    # Priority: device-specific → vendor default → global fallback
                    vendor = device.vendor
                    snmp_community = (
                        device.snmp_community
                        or (vendor.snmp_default_community if vendor else None)
                        or "public"
                    )
                    snmp_version = (
                        device.snmp_version
                        or (vendor.snmp_default_version if vendor else None)
                        or 2
                    )
                    snmp_params = {
                        "host": (device.primary_ip or "").split("/")[0],
                        "community": snmp_community,
                        "version": snmp_version,
                    }
                    client = SNMPClient(**snmp_params)
                    collector = SNMPCollector()
                    collected = CollectedData()

                    await crud_scan_job.append_log(db, scan_job_id, "Collecting system info via SNMP...")
                    collected.system_info = await collector.collect_system_info(client)

                    if scan_type_enum in (ScanType.snmp_full, ScanType.snmp_lldp):
                        await crud_scan_job.append_log(db, scan_job_id, "Collecting interfaces...")
                        collected.interfaces = await collector.collect_interfaces(client)

                    if scan_type_enum in (ScanType.snmp_full, ScanType.snmp_arp):
                        await crud_scan_job.append_log(db, scan_job_id, "Collecting ARP table...")
                        collected.arp_entries = await collector.collect_arp(client)

                    if scan_type_enum in (ScanType.snmp_full, ScanType.snmp_mac):
                        await crud_scan_job.append_log(db, scan_job_id, "Collecting MAC table...")
                        collected.mac_entries = await collector.collect_mac_table(client)
                        collected.bridge_port_map = await collector.collect_bridge_port_map(client)

                    if scan_type_enum in (ScanType.snmp_full, ScanType.snmp_lldp):
                        await crud_scan_job.append_log(db, scan_job_id, "Collecting LLDP neighbors...")
                        lldp_raw = await collector.collect_lldp(client)
                        cdp_raw = await collector.collect_cdp(client)
                        from app.discovery.lldp_cdp import parse_lldp_neighbors, parse_cdp_neighbors
                        lldp_n = parse_lldp_neighbors(lldp_raw)
                        cdp_n = parse_cdp_neighbors(cdp_raw)
                        collected.neighbors = [
                            {"protocol": "lldp", **vars(n)} for n in lldp_n
                        ] + [
                            {"protocol": "cdp", **vars(n)} for n in cdp_n
                        ]

                    from app.discovery.reconciler import Reconciler
                    reconciler = Reconciler()
                    await crud_scan_job.append_log(db, scan_job_id, "Reconciling collected data...")
                    conflicts = await reconciler.reconcile(db, device, collected, scan_job_id)

                    from app.discovery.unmanaged_detector import detect_unmanaged_switches
                    unmanaged_conflicts = await detect_unmanaged_switches(db, device_id, scan_job_id)

                    from app.discovery.topology_linker import link_topology
                    await crud_scan_job.append_log(db, scan_job_id, "Linking topology (auto-cable)...")
                    link_stats = await link_topology(db, device, collected, scan_job_id)

                    summary = {
                        "interfaces_collected": len(collected.interfaces),
                        "mac_entries_collected": len(collected.mac_entries),
                        "arp_entries_collected": len(collected.arp_entries),
                        "neighbors_collected": len(collected.neighbors),
                        "conflicts_created": len(conflicts) + len(unmanaged_conflicts) + link_stats["conflicts"],
                        "cables_created": link_stats["cables_created"],
                        "devices_created": link_stats["devices_created"],
                    }

                    if collected.mac_entries:
                        from app.models.mac_entry import MacEntry, MacEntrySource
                        from app.crud.mac_entry import crud_mac_entry
                        await crud_mac_entry.deactivate_old_entries(db, device_id, scan_job_id)
                        for entry in collected.mac_entries:
                            mac_obj = MacEntry(
                                scan_job_id=scan_job_id,
                                device_id=device_id,
                                mac_address=entry.get("mac_address", ""),
                                vlan_id=entry.get("vlan_id"),
                                ip_address=entry.get("ip_address"),
                                hostname=entry.get("hostname"),
                                is_active=True,
                                source=MacEntrySource.scan,
                            )
                            db.add(mac_obj)
                        await db.flush()

                    device.last_seen = datetime.now(timezone.utc)
                    db.add(device)

                    job = await crud_scan_job.get(db, scan_job_id)
                    if job:
                        job.result_summary = summary
                        db.add(job)
                    await crud_scan_job.update_status(db, scan_job_id, ScanStatus.completed)
                    await crud_scan_job.append_log(db, scan_job_id, f"Scan completed. Summary: {summary}")
                    return {"status": "completed", "summary": summary}

            except Exception as exc:
                error_msg = str(exc)
                await crud_scan_job.append_log(db, scan_job_id, f"ERROR: {error_msg}")
                await crud_scan_job.update_status(
                    db, scan_job_id, ScanStatus.failed, error_message=error_msg
                )
                raise

        return {"status": "completed"}

    loop = _get_event_loop()
    try:
        return loop.run_until_complete(_run())
    except Exception as exc:
        try:
            self.retry(exc=exc)
        except Exception:
            return {"status": "failed", "error": str(exc)}


def _nmap_host_discovery(start_ip: str, end_ip: str) -> list[dict]:
    """
    Use nmap ARP ping (-sn -PR) for reliable L2 host discovery.
    Falls back to ICMP+TCP if nmap is unavailable.
    Returns list of dicts: {ip, mac, vendor, hostname, open_ports}.
    """
    import shutil, xml.etree.ElementTree as ET

    target = f"{start_ip}-{end_ip.split('.')[-1]}"
    # Use the last octet range: nmap accepts "192.168.1.1-254"
    # Full range notation
    parts_start = start_ip.split(".")
    parts_end   = end_ip.split(".")
    if parts_start[:3] == parts_end[:3]:
        target = f"{'.'.join(parts_start[:3])}.{parts_start[3]}-{parts_end[3]}"
    else:
        target = f"{start_ip} {end_ip}"  # fallback: let nmap handle it

    nmap_bin = shutil.which("nmap")
    if not nmap_bin:
        return []

    try:
        result = subprocess.run(
            [
                nmap_bin, "-sn",          # ping scan (host discovery only)
                "-T4",                     # aggressive timing
                "--min-parallelism", "100",
                "--min-rate", "300",
                "-oX", "-",               # XML output to stdout
                target,
            ],
            capture_output=True, text=True, timeout=300
        )
        if result.returncode not in (0, 1):  # 1 = some hosts down, still ok
            return []

        hosts = []
        root = ET.fromstring(result.stdout)
        for host_el in root.findall("host"):
            status = host_el.find("status")
            if status is None or status.get("state") != "up":
                continue

            ip = None
            mac = None
            vendor = None
            for addr in host_el.findall("address"):
                if addr.get("addrtype") == "ipv4":
                    ip = addr.get("addr")
                elif addr.get("addrtype") == "mac":
                    mac = addr.get("addr", "").lower()
                    vendor = addr.get("vendor")

            if not ip:
                continue

            hostname = None
            hostnames_el = host_el.find("hostnames")
            if hostnames_el is not None:
                for hn in hostnames_el.findall("hostname"):
                    name = hn.get("name", "")
                    if name and not name.replace(".", "").isdigit():
                        hostname = name
                        break

            hosts.append({
                "ip": ip,
                "mac": mac,
                "vendor": vendor or "",
                "hostname": hostname,
                "open_ports": [],
                "ping": True,
            })

        return hosts
    except Exception:
        return []


@celery_app.task(bind=True, time_limit=1800, soft_time_limit=1740)
def run_ip_range_scan(self, scan_job_id: int) -> dict:
    """Scan an IP range for live hosts: nmap ARP primary, TCP+ICMP fallback."""

    async def _run():
        from app.database import get_async_session
        from app.crud.scan_job import crud_scan_job
        from app.models.scan_job import ScanStatus

        async with get_async_session() as db:
            job = await crud_scan_job.get(db, scan_job_id)
            if job is None:
                return {"status": "failed", "error": "Job not found"}

            await crud_scan_job.update_status(db, scan_job_id, ScanStatus.running)

            start_ip = job.range_start_ip
            end_ip   = job.range_end_ip
            ports: list[int] = job.range_ports if job.range_ports else [
                22, 23, 80, 443, 445, 8080, 8443, 8888, 9100, 5000, 5001, 7547
            ]

            if not start_ip or not end_ip:
                await crud_scan_job.update_status(
                    db, scan_job_id, ScanStatus.failed,
                    error_message="Missing range_start_ip or range_end_ip"
                )
                return {"status": "failed"}

            # Count total IPs
            try:
                ip_list: list[str] = []
                for net in summarize_address_range(parse_ip(start_ip), parse_ip(end_ip)):
                    for host in net.hosts():
                        ip_list.append(str(host))
                if not ip_list:
                    ip_list = [start_ip] if start_ip == end_ip else []
            except Exception as exc:
                await crud_scan_job.update_status(
                    db, scan_job_id, ScanStatus.failed, error_message=str(exc)
                )
                return {"status": "failed", "error": str(exc)}

            await crud_scan_job.append_log(
                db, scan_job_id,
                f"Scansione {len(ip_list)} IP ({start_ip} → {end_ip}) | nmap ARP + TCP"
            )

            # ── Phase 1: nmap ARP host discovery (primary, fastest) ──
            loop = asyncio.get_event_loop()
            found_hosts: list[dict] = await loop.run_in_executor(
                None, _nmap_host_discovery, start_ip, end_ip
            )

            await crud_scan_job.append_log(
                db, scan_job_id,
                f"nmap ARP: {len(found_hosts)} host trovati"
            )

            # ── Phase 2: TCP port check on alive hosts (parallel) ──
            async def enrich_host(h: dict) -> dict:
                ip = h["ip"]
                tcp_tasks = [_tcp_check(ip, p, timeout=1.2) for p in ports]
                results = await asyncio.gather(*tcp_tasks, return_exceptions=True)
                h["open_ports"] = [p for p, ok in zip(ports, results) if ok is True]
                if not h.get("hostname"):
                    h["hostname"] = await _reverse_dns(ip)
                # Enrich MAC from ARP table if nmap didn't get it
                if not h.get("mac"):
                    h["mac"] = await loop.run_in_executor(None, _arp_mac, ip)
                return h

            batch_size = 60
            enriched: list[dict] = []
            for i in range(0, len(found_hosts), batch_size):
                batch = found_hosts[i:i + batch_size]
                batch_results = await asyncio.gather(*[enrich_host(h) for h in batch])
                enriched.extend(batch_results)

            # ── Phase 3: TCP-only sweep for IPs nmap may have missed ──
            #    (hosts that block ICMP/ARP but respond on TCP ports)
            found_ips = {h["ip"] for h in enriched}
            missed_ips = [ip for ip in ip_list if ip not in found_ips]

            async def tcp_probe(ip: str) -> dict | None:
                tcp_tasks = [_tcp_check(ip, p, timeout=0.8) for p in [80, 443, 22, 445, 8080]]
                results = await asyncio.gather(*tcp_tasks, return_exceptions=True)
                open_ports = [p for p, ok in zip([80, 443, 22, 445, 8080], results) if ok is True]
                if not open_ports:
                    return None
                mac = await loop.run_in_executor(None, _arp_mac, ip)
                hostname = await _reverse_dns(ip)
                return {"ip": ip, "mac": mac, "vendor": "", "hostname": hostname,
                        "open_ports": open_ports, "ping": False}

            for i in range(0, len(missed_ips), batch_size):
                batch = missed_ips[i:i + batch_size]
                batch_results = await asyncio.gather(*[tcp_probe(ip) for ip in batch])
                for r in batch_results:
                    if r:
                        enriched.append(r)

            # Sort by IP
            enriched.sort(key=lambda h: list(map(int, h["ip"].split("."))))

            # Log results
            for h in enriched:
                ports_str = ", ".join(str(p) for p in h["open_ports"]) if h["open_ports"] else "—"
                mac_str    = f"  MAC: {h['mac']}"    if h.get("mac")      else ""
                vendor_str = f" ({h['vendor']})"     if h.get("vendor")   else ""
                hn_str     = f"  {h['hostname']}"    if h.get("hostname") else ""
                await crud_scan_job.append_log(
                    db, scan_job_id,
                    f"✓ {h['ip']}{hn_str}{mac_str}{vendor_str}  porte: {ports_str}"
                )

            if not enriched:
                await crud_scan_job.append_log(db, scan_job_id, "Nessun host trovato.")

            # ── Persist IpAddress records ──
            from app.models.ip_address import IpAddress, IpAddressSource
            from sqlalchemy import select as sa_select
            for h in enriched:
                existing = await db.execute(
                    sa_select(IpAddress).where(IpAddress.address == h["ip"])
                )
                if existing.scalar_one_or_none() is None:
                    db.add(IpAddress(
                        address=h["ip"],
                        dns_name=h.get("hostname"),
                        source=IpAddressSource.ip_range_scan,
                        description=f"Scoperto dalla scansione #{scan_job_id}",
                    ))
            await db.flush()

            summary = {
                "total_ips": len(ip_list),
                "alive_hosts": len(enriched),
                "found_hosts": enriched,
            }
            job = await crud_scan_job.get(db, scan_job_id)
            if job:
                job.result_summary = summary
                db.add(job)
            await crud_scan_job.update_status(db, scan_job_id, ScanStatus.completed)
            await crud_scan_job.append_log(
                db, scan_job_id,
                f"Scansione completata: {len(enriched)}/{len(ip_list)} host attivi."
            )
            return {"status": "completed", "summary": summary}

    loop = _get_event_loop()
    return loop.run_until_complete(_run())


async def _ping(ip: str) -> bool:
    """ICMP ping. Returns True if host responds."""
    try:
        flag = "-n" if sys.platform == "win32" else "-c"
        wait_flag = "-w" if sys.platform == "win32" else "-W"
        proc = await asyncio.create_subprocess_exec(
            "ping", flag, "1", wait_flag, "1", ip,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await asyncio.wait_for(proc.wait(), timeout=3)
        return proc.returncode == 0
    except Exception:
        return False


async def _tcp_check(ip: str, port: int, timeout: float = 1.5) -> bool:
    """Check if a TCP port is open."""
    try:
        _, writer = await asyncio.wait_for(
            asyncio.open_connection(ip, port), timeout=timeout
        )
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass
        return True
    except Exception:
        return False


async def _reverse_dns(ip: str) -> str | None:
    """Attempt reverse DNS lookup."""
    try:
        loop = asyncio.get_event_loop()
        result = await asyncio.wait_for(
            loop.run_in_executor(None, lambda: socket.gethostbyaddr(ip)),
            timeout=2.0,
        )
        return result[0]
    except Exception:
        return None
