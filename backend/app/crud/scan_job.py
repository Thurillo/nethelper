from __future__ import annotations

from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.scan_job import ScanJob, ScanStatus
from app.schemas.scan_job import ScanJobCreate


class CRUDScanJob(CRUDBase[ScanJob, ScanJobCreate, ScanJobCreate]):
    async def get_by_device(
        self,
        db: AsyncSession,
        device_id: int,
        skip: int = 0,
        limit: int = 50,
    ) -> list[ScanJob]:
        result = await db.execute(
            select(ScanJob)
            .where(ScanJob.device_id == device_id)
            .order_by(ScanJob.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def get_multi_filtered(
        self,
        db: AsyncSession,
        skip: int = 0,
        limit: int = 50,
        device_id: Optional[int] = None,
        status: Optional[str] = None,
        scan_type: Optional[str] = None,
    ) -> list[ScanJob]:
        stmt = select(ScanJob)
        if device_id is not None:
            stmt = stmt.where(ScanJob.device_id == device_id)
        if status is not None:
            stmt = stmt.where(ScanJob.status == status)
        if scan_type is not None:
            stmt = stmt.where(ScanJob.scan_type == scan_type)
        stmt = stmt.order_by(ScanJob.created_at.desc()).offset(skip).limit(limit)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def get_recent(
        self, db: AsyncSession, limit: int = 10
    ) -> list[ScanJob]:
        result = await db.execute(
            select(ScanJob)
            .order_by(ScanJob.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def create_job(
        self,
        db: AsyncSession,
        obj_in: ScanJobCreate,
    ) -> ScanJob:
        db_obj = ScanJob(
            device_id=obj_in.device_id,
            scan_type=obj_in.scan_type,
            status=ScanStatus.pending,
            range_start_ip=obj_in.range_start_ip,
            range_end_ip=obj_in.range_end_ip,
            range_ports=obj_in.range_ports,
            triggered_by_user_id=obj_in.triggered_by_user_id,
            is_scheduled=obj_in.is_scheduled,
        )
        db.add(db_obj)
        await db.flush()
        await db.refresh(db_obj)
        return db_obj

    async def update_status(
        self,
        db: AsyncSession,
        scan_job_id: int,
        status: ScanStatus,
        celery_task_id: Optional[str] = None,
        error_message: Optional[str] = None,
    ) -> Optional[ScanJob]:
        from datetime import datetime, timezone
        job = await self.get(db, scan_job_id)
        if job is None:
            return None
        job.status = status
        if celery_task_id:
            job.celery_task_id = celery_task_id
        if error_message:
            job.error_message = error_message
        if status == ScanStatus.running:
            job.started_at = datetime.now(timezone.utc)
        elif status in (ScanStatus.completed, ScanStatus.failed, ScanStatus.cancelled):
            job.completed_at = datetime.now(timezone.utc)
        db.add(job)
        await db.flush()
        await db.refresh(job)
        return job

    async def append_log(
        self, db: AsyncSession, scan_job_id: int, line: str
    ) -> None:
        job = await self.get(db, scan_job_id)
        if job is None:
            return
        current = job.log_output or ""
        job.log_output = current + line + "\n"
        db.add(job)
        await db.flush()


crud_scan_job = CRUDScanJob(ScanJob)
