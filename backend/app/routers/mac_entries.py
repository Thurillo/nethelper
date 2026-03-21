from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Body, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.audit_log import log_action
from app.crud.mac_entry import crud_mac_entry
from app.database import get_db
from app.dependencies import get_current_user, require_admin
from app.schemas.mac_entry import MacEntryCreate, MacEntryRead, MacEntryUpdate, MacSearchResult
from app.schemas.pagination import PaginatedResponse

router = APIRouter(prefix="/mac-entries", tags=["mac-entries"])


@router.get("/search", response_model=MacSearchResult)
async def search_mac(
    mac: str,
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MacSearchResult:
    entries = await crud_mac_entry.search_by_mac(db, mac)
    return MacSearchResult(
        mac_address=mac,
        entries=[MacEntryRead.model_validate(e) for e in entries],
    )


@router.get("/", response_model=PaginatedResponse[MacEntryRead])
async def list_mac_entries(
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    device_id: int | None = None,
    page: int = 1,
    size: int = 100,
) -> PaginatedResponse[MacEntryRead]:
    kwargs = {}
    if device_id is not None:
        kwargs["device_id"] = device_id
    entries = await crud_mac_entry.get_multi(db, skip=(page-1)*size, limit=size, **kwargs)
    _total = await crud_mac_entry.count(db)
    return PaginatedResponse.build([MacEntryRead.model_validate(e) for e in entries], total=_total, page=page, size=size)


@router.post("/", response_model=MacEntryRead, status_code=status.HTTP_201_CREATED)
async def create_mac_entry(
    body: MacEntryCreate,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MacEntryRead:
    entry = await crud_mac_entry.create(db, body)
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="create", entity_table="mac_entry",
                     entity_id=entry.id, client_ip=client_ip,
                     description=f"Created manual MAC entry '{entry.mac_address}'.")
    return MacEntryRead.model_validate(entry)


@router.get("/{entry_id}", response_model=MacEntryRead)
async def get_mac_entry(
    entry_id: int,
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MacEntryRead:
    entry = await crud_mac_entry.get(db, entry_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="MAC entry not found.")
    return MacEntryRead.model_validate(entry)


@router.patch("/{entry_id}", response_model=MacEntryRead)
async def update_mac_entry(
    entry_id: int,
    body: MacEntryUpdate,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MacEntryRead:
    entry = await crud_mac_entry.get(db, entry_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="MAC entry not found.")
    updated = await crud_mac_entry.update(db, entry, body)
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="update", entity_table="mac_entry",
                     entity_id=updated.id, client_ip=client_ip,
                     description=f"Updated MAC entry '{updated.mac_address}'.")
    return MacEntryRead.model_validate(updated)


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_mac_entry(
    entry_id: int,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    entry = await crud_mac_entry.get(db, entry_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="MAC entry not found.")
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="delete", entity_table="mac_entry",
                     entity_id=entry_id, client_ip=client_ip,
                     description=f"Deleted MAC entry '{entry.mac_address}'.")
    await crud_mac_entry.remove(db, entry_id)


@router.delete("/purge", status_code=status.HTTP_200_OK)
async def purge_old_mac_entries(
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    body: dict = Body(..., example={"days": 90}),
    request: Request = None,
) -> dict:
    days = body.get("days")
    if not isinstance(days, int) or days < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="'days' must be a positive integer.",
        )
    deleted_count = await crud_mac_entry.purge_old_entries(db, days)
    client_ip = getattr(request.state, "client_ip", None) if request else None
    await log_action(db, user_id=current_user.id, action="purge", entity_table="mac_entry",
                     client_ip=client_ip,
                     description=f"Purged {deleted_count} MAC entries older than {days} days.")
    return {"deleted": deleted_count}
