from __future__ import annotations

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.audit_log import log_action
from app.crud.scan_conflict import crud_scan_conflict
from app.models.scan_conflict import ScanConflict
from app.database import get_db
from app.dependencies import get_current_user, require_admin
from app.schemas.scan_conflict import (
    AcceptNewDeviceRequest,
    ConflictBulkResolveRequest,
    ConflictResolveRequest,
    ScanConflictCreate,
    ScanConflictRead,
)
from app.schemas.pagination import PaginatedResponse

router = APIRouter(prefix="/conflicts", tags=["conflicts"])


@router.get("/pending-count")
async def get_pending_count(
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    count = await crud_scan_conflict.get_pending_count(db)
    return {"count": count}


@router.get("/", response_model=PaginatedResponse[ScanConflictRead])
async def list_conflicts(
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    status_filter: Optional[str] = None,
    device_id: Optional[int] = None,
    conflict_type: Optional[str] = None,
    page: int = 1,
    size: int = 100,
) -> PaginatedResponse[ScanConflictRead]:
    conflicts = await crud_scan_conflict.get_multi_filtered(
        db,
        skip=(page-1)*size,
        limit=size,
        status=status_filter,
        device_id=device_id,
        conflict_type=conflict_type,
    )
    _total = await crud_scan_conflict.count(db)
    return PaginatedResponse.build([ScanConflictRead.model_validate(c) for c in conflicts], total=_total, page=page, size=size)


@router.post("/", response_model=ScanConflictRead, status_code=status.HTTP_201_CREATED)
async def create_conflict(
    body: ScanConflictCreate,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ScanConflictRead:
    from app.models.scan_conflict import ConflictStatus
    conflict = ScanConflict(
        conflict_type=body.conflict_type,
        device_id=body.device_id,
        scan_job_id=body.scan_job_id,
        entity_table=body.entity_table,
        entity_id=body.entity_id,
        field_name=body.field_name,
        current_value=body.current_value,
        discovered_value=body.discovered_value,
        notes=body.notes,
        status=ConflictStatus.pending,
    )
    db.add(conflict)
    await db.flush()
    await db.refresh(conflict)
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="create_conflict",
                     entity_table="scan_conflict", entity_id=conflict.id,
                     client_ip=client_ip, description=f"Created conflict {conflict.conflict_type}.")
    return ScanConflictRead.model_validate(conflict)


@router.get("/{conflict_id}", response_model=ScanConflictRead)
async def get_conflict(
    conflict_id: int,
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ScanConflictRead:
    conflict = await crud_scan_conflict.get(db, conflict_id)
    if conflict is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conflict not found.")
    return ScanConflictRead.model_validate(conflict)


@router.post("/{conflict_id}/accept", response_model=ScanConflictRead)
async def accept_conflict(
    conflict_id: int,
    body: ConflictResolveRequest,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ScanConflictRead:
    conflict = await crud_scan_conflict.accept_conflict(
        db, conflict_id, current_user.id, body.notes
    )
    if conflict is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conflict not found.")
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="accept_conflict",
                     entity_table="scan_conflict", entity_id=conflict_id,
                     client_ip=client_ip, description=f"Accepted conflict {conflict_id}.")
    return ScanConflictRead.model_validate(conflict)


@router.post("/{conflict_id}/reject", response_model=ScanConflictRead)
async def reject_conflict(
    conflict_id: int,
    body: ConflictResolveRequest,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ScanConflictRead:
    conflict = await crud_scan_conflict.reject_conflict(
        db, conflict_id, current_user.id, body.notes
    )
    if conflict is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conflict not found.")
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="reject_conflict",
                     entity_table="scan_conflict", entity_id=conflict_id,
                     client_ip=client_ip, description=f"Rejected conflict {conflict_id}.")
    return ScanConflictRead.model_validate(conflict)


@router.post("/{conflict_id}/ignore", response_model=ScanConflictRead)
async def ignore_conflict(
    conflict_id: int,
    body: ConflictResolveRequest,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ScanConflictRead:
    conflict = await crud_scan_conflict.ignore_conflict(
        db, conflict_id, current_user.id, body.notes
    )
    if conflict is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conflict not found.")
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="ignore_conflict",
                     entity_table="scan_conflict", entity_id=conflict_id,
                     client_ip=client_ip, description=f"Ignored conflict {conflict_id}.")
    return ScanConflictRead.model_validate(conflict)


@router.post("/{conflict_id}/accept-new-device", response_model=ScanConflictRead)
async def accept_new_device_conflict(
    conflict_id: int,
    body: AcceptNewDeviceRequest,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ScanConflictRead:
    conflict, _ = await crud_scan_conflict.accept_new_device_conflict(
        db, conflict_id, current_user.id, body.device_name, body.device_type, body.notes
    )
    if conflict is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conflict not found.")
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="accept_conflict",
                     entity_table="scan_conflict", entity_id=conflict_id,
                     client_ip=client_ip,
                     description=f"Accepted new_device_discovered conflict {conflict_id}: '{body.device_name}'.")
    return ScanConflictRead.model_validate(conflict)


@router.post("/bulk-accept", response_model=list[ScanConflictRead])
async def bulk_accept_conflicts(
    body: ConflictBulkResolveRequest,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[ScanConflictRead]:
    conflicts = await crud_scan_conflict.bulk_accept(
        db, body.conflict_ids, current_user.id, body.notes
    )
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="bulk_accept_conflicts",
                     client_ip=client_ip,
                     description=f"Bulk accepted {len(conflicts)} conflicts.")
    return [ScanConflictRead.model_validate(c) for c in conflicts]


@router.post("/bulk-reject", response_model=list[ScanConflictRead])
async def bulk_reject_conflicts(
    body: ConflictBulkResolveRequest,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[ScanConflictRead]:
    conflicts = await crud_scan_conflict.bulk_reject(
        db, body.conflict_ids, current_user.id, body.notes
    )
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="bulk_reject_conflicts",
                     client_ip=client_ip,
                     description=f"Bulk rejected {len(conflicts)} conflicts.")
    return [ScanConflictRead.model_validate(c) for c in conflicts]
