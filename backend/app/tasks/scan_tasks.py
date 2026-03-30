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


@celery_app.task(bind=True, time_limit=1800, soft_time_limit=1740)
def run_ip_range_scan(self, scan_job_id: int) -> dict:
    """Scan an IP range for live hosts using TCP + ICMP in parallel."""

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
            end_ip = job.range_end_ip
            ports: list[int] = job.range_ports if job.range_ports is not None else [22, 80, 443, 8080]

            if not start_ip or not end_ip:
                await crud_scan_job.update_status(
                    db, scan_job_id, ScanStatus.failed,
                    error_message="Missing range_start_ip or range_end_ip"
                )
                return {"status": "failed"}

            # Expand IP range
            try:
                ip_list: list[str] = []
                for net in summarize_address_range(parse_ip(start_ip), parse_ip(end_ip)):
                    for host in net.hosts():
                        ip_list.append(str(host))
                # Also include start/end if they ended up as network/broadcast (edge case)
                if not ip_list:
                    ip_list = [start_ip] if start_ip == end_ip else []
            except Exception as exc:
                await crud_scan_job.update_status(
                    db, scan_job_id, ScanStatus.failed, error_message=str(exc)
                )
                return {"status": "failed", "error": str(exc)}

            await crud_scan_job.append_log(
                db, scan_job_id,
                f"Scanning {len(ip_list)} IPs ({start_ip} → {end_ip}) | Porte: {ports}"
            )

            # Scan all IPs concurrently in batches of 50
            found_hosts: list[dict] = []
            batch_size = 50

            async def scan_one(ip: str) -> dict | None:
                """Returns host info if alive, else None."""
                tcp_tasks = [_tcp_check(ip, p, timeout=1.5) for p in ports]
                ping_task = _ping(ip)
                results = await asyncio.gather(ping_task, *tcp_tasks, return_exceptions=True)

                ping_alive = results[0] is True
                tcp_results = results[1:]
                open_ports = [p for p, ok in zip(ports, tcp_results) if ok is True]

                if not ping_alive and not open_ports:
                    return None

                # After TCP connect, kernel ARP table should have the MAC
                loop = asyncio.get_event_loop()
                mac = await loop.run_in_executor(None, _arp_mac, ip)
                vendor = await loop.run_in_executor(None, _vendor_from_mac, mac) if mac else None
                hostname = await _reverse_dns(ip)

                return {
                    "ip": ip,
                    "open_ports": open_ports,
                    "hostname": hostname,
                    "ping": ping_alive,
                    "mac": mac,
                    "vendor": vendor,
                }

            for i in range(0, len(ip_list), batch_size):
                batch = ip_list[i:i + batch_size]
                batch_results = await asyncio.gather(*[scan_one(ip) for ip in batch])
                for result in batch_results:
                    if result is not None:
                        found_hosts.append(result)
                        ports_str = ", ".join(str(p) for p in result["open_ports"]) or "—"
                        hn = result["hostname"] or ""
                        mac_str = f"  MAC: {result['mac']}" if result.get("mac") else ""
                        vendor_str = f" ({result['vendor']})" if result.get("vendor") else ""
                        ping_str = " [ping ok]" if result["ping"] else ""
                        await crud_scan_job.append_log(
                            db, scan_job_id,
                            f"✓ {result['ip']}{('  ' + hn) if hn else ''}{mac_str}{vendor_str}  porte: {ports_str}{ping_str}"
                        )

            if not found_hosts:
                await crud_scan_job.append_log(db, scan_job_id, "Nessun host raggiungibile trovato.")

            # Update IpAddress records
            from app.models.ip_address import IpAddress, IpAddressSource
            from sqlalchemy import select as sa_select
            for h in found_hosts:
                existing = await db.execute(sa_select(IpAddress).where(IpAddress.address == h["ip"]))
                if existing.scalar_one_or_none() is None:
                    ip_obj = IpAddress(
                        address=h["ip"],
                        dns_name=h.get("hostname"),
                        source=IpAddressSource.ip_range_scan,
                        description=f"Scoperto dalla scansione #{scan_job_id}",
                    )
                    db.add(ip_obj)
            await db.flush()

            summary = {
                "total_ips": len(ip_list),
                "alive_hosts": len(found_hosts),
                "found_hosts": found_hosts,
            }
            job = await crud_scan_job.get(db, scan_job_id)
            if job:
                job.result_summary = summary
                db.add(job)
            await crud_scan_job.update_status(db, scan_job_id, ScanStatus.completed)
            await crud_scan_job.append_log(
                db, scan_job_id,
                f"Scansione completata: {len(found_hosts)}/{len(ip_list)} host attivi."
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
