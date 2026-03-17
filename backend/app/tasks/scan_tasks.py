from __future__ import annotations

import asyncio
import socket
import subprocess
import sys
from datetime import datetime, timezone
from ipaddress import IPv4Address, ip_address as parse_ip, summarize_address_range
from typing import Optional

from app.tasks.celery_app import celery_app


def _get_event_loop() -> asyncio.AbstractEventLoop:
    """Get or create an event loop for use in sync Celery tasks."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            raise RuntimeError("Loop is closed")
        return loop
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        return loop


@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def run_device_scan(self, device_id: int, scan_job_id: int, scan_type: str) -> dict:
    """Run a full or partial SNMP/SSH device scan."""

    async def _run():
        from app.database import get_async_session
        from app.crud.scan_job import crud_scan_job
        from app.models.scan_job import ScanStatus, ScanType
        from app.models.device import Device
        from sqlalchemy import select

        async with get_async_session() as db:
            # Update job status to running
            await crud_scan_job.update_status(db, scan_job_id, ScanStatus.running)
            await crud_scan_job.append_log(db, scan_job_id, f"[{datetime.now(timezone.utc).isoformat()}] Starting {scan_type} scan for device {device_id}...")

            # Load device
            result = await db.execute(select(Device).where(Device.id == device_id))
            device = result.scalar_one_or_none()
            if device is None:
                await crud_scan_job.update_status(
                    db, scan_job_id, ScanStatus.failed,
                    error_message=f"Device {device_id} not found."
                )
                return {"status": "failed", "error": "Device not found"}

            try:
                # Select driver
                driver_instance = None
                scan_type_enum = ScanType(scan_type)

                # Determine which driver to use
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
                    # SNMP-based scan
                    from app.discovery.snmp_client import SNMPClient
                    from app.discovery.snmp_collector import SNMPCollector
                    from app.discovery.drivers.base import CollectedData

                    snmp_params = {
                        "host": (device.primary_ip or "").split("/")[0],
                        "community": device.snmp_community or "public",
                        "version": device.snmp_version or 2,
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

                    # Reconcile
                    from app.discovery.reconciler import Reconciler
                    reconciler = Reconciler()
                    await crud_scan_job.append_log(db, scan_job_id, "Reconciling collected data...")
                    conflicts = await reconciler.reconcile(db, device, collected, scan_job_id)

                    # Detect unmanaged switches
                    from app.discovery.unmanaged_detector import detect_unmanaged_switches
                    unmanaged_conflicts = await detect_unmanaged_switches(db, device_id, scan_job_id)

                    summary = {
                        "interfaces_collected": len(collected.interfaces),
                        "mac_entries_collected": len(collected.mac_entries),
                        "arp_entries_collected": len(collected.arp_entries),
                        "neighbors_collected": len(collected.neighbors),
                        "conflicts_created": len(conflicts) + len(unmanaged_conflicts),
                    }

                    # Store MAC entries in DB
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

                    # Update last_seen on device
                    device.last_seen = datetime.now(timezone.utc)
                    db.add(device)

                    # Update scan job
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


@celery_app.task(bind=True)
def run_ip_range_scan(self, scan_job_id: int) -> dict:
    """Scan an IP range for live hosts."""

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
            ports = job.range_ports or [22, 80, 443, 8080, 8443]

            if not start_ip or not end_ip:
                await crud_scan_job.update_status(
                    db, scan_job_id, ScanStatus.failed,
                    error_message="Missing range_start_ip or range_end_ip"
                )
                return {"status": "failed"}

            # Expand IP range
            try:
                ip_list: list[str] = []
                for net in summarize_address_range(
                    parse_ip(start_ip), parse_ip(end_ip)
                ):
                    for host in net.hosts():
                        ip_list.append(str(host))
            except Exception as exc:
                await crud_scan_job.update_status(
                    db, scan_job_id, ScanStatus.failed, error_message=str(exc)
                )
                return {"status": "failed", "error": str(exc)}

            await crud_scan_job.append_log(
                db, scan_job_id, f"Scanning {len(ip_list)} IPs in range {start_ip}-{end_ip}..."
            )

            found_hosts = []
            for ip in ip_list:
                alive = await _ping(ip)
                if not alive:
                    continue

                open_ports = []
                for port in ports:
                    if await _tcp_check(ip, port):
                        open_ports.append(port)

                hostname = await _reverse_dns(ip)

                await crud_scan_job.append_log(
                    db, scan_job_id,
                    f"Found: {ip} | ports={open_ports} | hostname={hostname}"
                )
                found_hosts.append({
                    "ip": ip,
                    "open_ports": open_ports,
                    "hostname": hostname,
                })

                # Create IpAddress record
                from app.models.ip_address import IpAddress, IpAddressSource
                from sqlalchemy import select
                existing = await db.execute(
                    select(IpAddress).where(IpAddress.address == ip)
                )
                if existing.scalar_one_or_none() is None:
                    ip_obj = IpAddress(
                        address=ip,
                        dns_name=hostname,
                        source=IpAddressSource.ip_range_scan,
                        description=f"Discovered by scan job {scan_job_id}",
                    )
                    db.add(ip_obj)

            await db.flush()
            summary = {"total_ips": len(ip_list), "alive_hosts": len(found_hosts)}
            job = await crud_scan_job.get(db, scan_job_id)
            if job:
                job.result_summary = summary
                db.add(job)
            await crud_scan_job.update_status(db, scan_job_id, ScanStatus.completed)
            return {"status": "completed", "summary": summary}

    loop = _get_event_loop()
    return loop.run_until_complete(_run())


async def _ping(ip: str) -> bool:
    """ICMP ping using subprocess. Returns True if host is alive."""
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


async def _tcp_check(ip: str, port: int, timeout: float = 0.5) -> bool:
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
        result = await loop.run_in_executor(
            None, lambda: socket.gethostbyaddr(ip)
        )
        return result[0]
    except Exception:
        return None
