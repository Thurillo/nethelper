from __future__ import annotations

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.audit_log import log_action
from app.crud.scan_conflict import crud_scan_conflict
from app.database import get_db
from app.dependencies import get_current_user, require_admin
from app.schemas.scan_conflict import (
    ConflictBulkResolveRequest,
    ConflictResolveRequest,
    ScanConflictRead,
)
from app.schemas.pagination import PaginatedResponse

router = APIRouter(prefix="/conflicts", tags=["conflicts"])


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


@router.post("/bulk-accept", response_model=list[ScanConflictRead])
async def bulk_accept_conflicts(
    body: ConflictBulkResolveRequest,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PaginatedResponse[ScanConflictRead]:
    results = []
    for conflict_id in body.conflict_ids:
        conflict = await crud_scan_conflict.accept_conflict(
            db, conflict_id, current_user.id, body.notes
        )
        if conflict is not None:
            results.append(ScanConflictRead.model_validate(conflict))
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="bulk_accept_conflicts",
                     client_ip=client_ip,
                     description=f"Bulk accepted {len(results)} conflicts.")
    return results


@router.post("/bulk-reject", response_model=list[ScanConflictRead])
async def bulk_reject_conflicts(
    body: ConflictBulkResolveRequest,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PaginatedResponse[ScanConflictRead]:
    results = []
    for conflict_id in body.conflict_ids:
        conflict = await crud_scan_conflict.reject_conflict(
            db, conflict_id, current_user.id, body.notes
        )
        if conflict is not None:
            results.append(ScanConflictRead.model_validate(conflict))
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="bulk_reject_conflicts",
                     client_ip=client_ip,
                     description=f"Bulk rejected {len(results)} conflicts.")
    return results
