from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from app.tasks.celery_app import celery_app


def _get_event_loop() -> asyncio.AbstractEventLoop:
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            raise RuntimeError("closed")
        return loop
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        return loop


def _cron_is_due(cron_expression: str, last_run: datetime | None) -> bool:
    """Simple cron evaluation: check if the expression is due given last_run.

    Supports only the 5-field cron format. Uses croniter if available,
    otherwise falls back to a simplified check.
    """
    now = datetime.now(timezone.utc)
    if last_run is None:
        return True

    try:
        from croniter import croniter
        cron = croniter(cron_expression, last_run)
        next_run = cron.get_next(datetime)
        return now >= next_run
    except ImportError:
        # Fallback: re-run if it's been more than 60 seconds (for testing)
        delta = (now - last_run).total_seconds()
        return delta >= 60


async def schedule_device_scan(device_id: int, scan_type: str) -> str:
    """Enqueue a device scan and return the Celery task ID."""
    from app.database import get_async_session
    from app.crud.scan_job import crud_scan_job
    from app.models.scan_job import ScanStatus
    from app.schemas.scan_job import ScanJobCreate

    async with get_async_session() as db:
        job_in = ScanJobCreate(
            device_id=device_id,
            scan_type=scan_type,
            is_scheduled=True,
        )
        job = await crud_scan_job.create_job(db, job_in)
        from app.tasks.scan_tasks import run_device_scan
        task = run_device_scan.delay(device_id, job.id, scan_type)
        await crud_scan_job.update_status(
            db, job.id, ScanStatus.running, celery_task_id=task.id
        )
        return task.id


@celery_app.task
def run_scheduled_scans() -> dict:
    """Celery-Beat task: check scheduled_scan table and launch due scans."""

    async def _run():
        from app.database import get_async_session
        from app.models.scheduled_scan import ScheduledScan
        from sqlalchemy import select, update

        launched = []
        skipped = []

        async with get_async_session() as db:
            result = await db.execute(
                select(ScheduledScan).where(ScheduledScan.enabled == True)
            )
            scheduled_scans = result.scalars().all()

            for ss in scheduled_scans:
                if not _cron_is_due(ss.cron_expression, ss.last_run):
                    skipped.append(ss.id)
                    continue

                try:
                    task_id = await schedule_device_scan(ss.device_id, ss.scan_type)
                    # Update last_run
                    ss.last_run = datetime.now(timezone.utc)
                    db.add(ss)
                    launched.append({"id": ss.id, "device_id": ss.device_id, "task_id": task_id})
                except Exception as exc:
                    skipped.append({"id": ss.id, "error": str(exc)})

        return {"launched": launched, "skipped": len(skipped)}

    loop = _get_event_loop()
    return loop.run_until_complete(_run())
