from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.audit_log import log_action
from app.crud.cabinet import crud_cabinet
from app.database import get_db
from app.dependencies import get_current_user, require_admin
from app.schemas.cabinet import CabinetCreate, CabinetRead, CabinetUpdate, RackDiagram
from app.schemas.device import DeviceRead
from app.schemas.pagination import PaginatedResponse

router = APIRouter(prefix="/cabinets", tags=["cabinets"])


@router.get("/", response_model=PaginatedResponse[CabinetRead])
async def list_cabinets(
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = 1,
    size: int = 100,
    site_id: int | None = None,
) -> PaginatedResponse[CabinetRead]:
    kwargs = {}
    if site_id is not None:
        kwargs["site_id"] = site_id
    cabinets = await crud_cabinet.get_multi(db, skip=(page - 1) * size, limit=size, **kwargs)
    _total = await crud_cabinet.count(db)

    # Single aggregate query for devices_count / used_u / devices_summary
    cabinet_ids = [c.id for c in cabinets]
    stats = await crud_cabinet.get_cabinet_stats(db, cabinet_ids)

    result: list[CabinetRead] = []
    for c in cabinets:
        item = CabinetRead.model_validate(c)
        s = stats.get(c.id, {})
        item.devices_count = s.get("devices_count", 0)
        item.used_u = s.get("used_u", 0)
        item.devices_summary = s.get("devices_summary") or None
        result.append(item)

    return PaginatedResponse.build(result, total=_total, page=page, size=size)


@router.post("/", response_model=CabinetRead, status_code=status.HTTP_201_CREATED)
async def create_cabinet(
    body: CabinetCreate,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CabinetRead:
    cabinet = await crud_cabinet.create(db, body)
    cabinet = await crud_cabinet.get(db, cabinet.id)  # reload with site relationship
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="create", entity_table="cabinet",
                     entity_id=cabinet.id, client_ip=client_ip,
                     description=f"Created cabinet '{cabinet.name}'.")
    return CabinetRead.model_validate(cabinet)


@router.get("/{cabinet_id}", response_model=CabinetRead)
async def get_cabinet(
    cabinet_id: int,
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CabinetRead:
    cabinet = await crud_cabinet.get(db, cabinet_id)
    if cabinet is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cabinet not found.")
    return CabinetRead.model_validate(cabinet)


@router.patch("/{cabinet_id}", response_model=CabinetRead)
async def update_cabinet(
    cabinet_id: int,
    body: CabinetUpdate,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CabinetRead:
    cabinet = await crud_cabinet.get(db, cabinet_id)
    if cabinet is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cabinet not found.")
    updated = await crud_cabinet.update(db, cabinet, body)
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="update", entity_table="cabinet",
                     entity_id=updated.id, client_ip=client_ip,
                     description=f"Updated cabinet '{updated.name}'.")
    return CabinetRead.model_validate(updated)


@router.delete("/{cabinet_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cabinet(
    cabinet_id: int,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    cabinet = await crud_cabinet.get(db, cabinet_id)
    if cabinet is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cabinet not found.")
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="delete", entity_table="cabinet",
                     entity_id=cabinet_id, client_ip=client_ip,
                     description=f"Deleted cabinet '{cabinet.name}'.")
    await crud_cabinet.remove(db, cabinet_id)


@router.get("/{cabinet_id}/rack-diagram", response_model=RackDiagram)
@router.get("/{cabinet_id}/diagram", response_model=RackDiagram)
async def get_rack_diagram(
    cabinet_id: int,
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RackDiagram:
    diagram = await crud_cabinet.get_rack_diagram(db, cabinet_id)
    if diagram is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cabinet not found.")
    return diagram


@router.get("/{cabinet_id}/devices", response_model=list[DeviceRead])
async def get_cabinet_devices(
    cabinet_id: int,
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PaginatedResponse[DeviceRead]:
    cabinet = await crud_cabinet.get(db, cabinet_id)
    if cabinet is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cabinet not found.")
    devices = await crud_cabinet.get_devices_in_cabinet(db, cabinet_id)
    return [DeviceRead.model_validate(d) for d in devices]
