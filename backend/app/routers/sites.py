from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.audit_log import log_action
from app.crud.cabinet import crud_cabinet
from app.crud.site import crud_site
from app.database import get_db
from app.dependencies import get_current_user, require_admin
from app.schemas.cabinet import CabinetRead
from app.schemas.site import SiteCreate, SiteRead, SiteUpdate, FloorPlanUpload
from app.schemas.pagination import PaginatedResponse

router = APIRouter(prefix="/sites", tags=["sites"])


@router.get("/", response_model=PaginatedResponse[SiteRead])
async def list_sites(
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = 1,
    size: int = 100,
) -> PaginatedResponse[SiteRead]:
    sites = await crud_site.get_multi_with_counts(db, skip=(page-1)*size, limit=size)
    total = await crud_site.count(db)
    return PaginatedResponse.build(sites, total=total, page=page, size=size)


@router.post("/", response_model=SiteRead, status_code=status.HTTP_201_CREATED)
async def create_site(
    body: SiteCreate,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SiteRead:
    site = await crud_site.create(db, body)
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="create", entity_table="site",
                     entity_id=site.id, client_ip=client_ip,
                     description=f"Created site '{site.name}'.")
    return await crud_site.get_with_cabinet_count(db, site.id)


@router.get("/{site_id}", response_model=SiteRead)
async def get_site(
    site_id: int,
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SiteRead:
    site = await crud_site.get_with_cabinet_count(db, site_id)
    if site is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not found.")
    return site


@router.patch("/{site_id}", response_model=SiteRead)
async def update_site(
    site_id: int,
    body: SiteUpdate,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SiteRead:
    site = await crud_site.get(db, site_id)
    if site is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not found.")
    await crud_site.update(db, site, body)
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="update", entity_table="site",
                     entity_id=site_id, client_ip=client_ip,
                     description=f"Updated site '{site.name}'.")
    return await crud_site.get_with_cabinet_count(db, site_id)


@router.delete("/{site_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_site(
    site_id: int,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    site = await crud_site.get(db, site_id)
    if site is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not found.")
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="delete", entity_table="site",
                     entity_id=site_id, client_ip=client_ip,
                     description=f"Deleted site '{site.name}'.")
    await crud_site.remove(db, site_id)


@router.get("/{site_id}/floor-plan")
async def get_floor_plan(
    site_id: int,
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    site = await crud_site.get(db, site_id)
    if site is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not found.")
    if not site.floor_plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No floor plan uploaded.")
    return {"floor_plan": site.floor_plan, "floor_plan_name": site.floor_plan_name}


@router.put("/{site_id}/floor-plan", response_model=SiteRead)
async def upload_floor_plan(
    site_id: int,
    body: FloorPlanUpload,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SiteRead:
    site = await crud_site.get(db, site_id)
    if site is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not found.")
    site.floor_plan = body.floor_plan
    site.floor_plan_name = body.floor_plan_name
    await db.commit()
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="update", entity_table="site",
                     entity_id=site_id, client_ip=client_ip,
                     description=f"Uploaded floor plan '{body.floor_plan_name}' for site '{site.name}'.")
    return await crud_site.get_with_cabinet_count(db, site_id)


@router.delete("/{site_id}/floor-plan", status_code=status.HTTP_204_NO_CONTENT)
async def delete_floor_plan(
    site_id: int,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    site = await crud_site.get(db, site_id)
    if site is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not found.")
    site.floor_plan = None
    site.floor_plan_name = None
    await db.commit()
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="update", entity_table="site",
                     entity_id=site_id, client_ip=client_ip,
                     description=f"Deleted floor plan for site '{site.name}'.")


@router.get("/{site_id}/cabinets", response_model=PaginatedResponse[CabinetRead])
async def list_site_cabinets(
    site_id: int,
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = 1,
    size: int = 100,
) -> PaginatedResponse[CabinetRead]:
    site = await crud_site.get(db, site_id)
    if site is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not found.")
    cabinets = await crud_cabinet.get_multi(db, skip=(page-1)*size, limit=size, site_id=site_id)
    _total = await crud_cabinet.count(db)
    return PaginatedResponse.build([CabinetRead.model_validate(c) for c in cabinets], total=_total, page=page, size=size)
