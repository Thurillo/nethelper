from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.audit_log import log_action
from app.crud.user import crud_user
from app.database import get_db
from app.dependencies import require_admin
from app.schemas.user import UserCreate, UserRead, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/", response_model=list[UserRead])
async def list_users(
    skip: int = 0,
    limit: int = 100,
    _: Annotated[object, Depends(require_admin)] = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
) -> list[UserRead]:
    users = await crud_user.get_multi(db, skip=skip, limit=limit)
    return [UserRead.model_validate(u) for u in users]


@router.post("/", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreate,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserRead:
    existing = await crud_user.get_by_username(db, body.username)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Username '{body.username}' already exists.",
        )
    user = await crud_user.create(db, body)
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(
        db,
        user_id=current_user.id,
        action="create",
        entity_table="user",
        entity_id=user.id,
        client_ip=client_ip,
        description=f"Created user '{user.username}'.",
    )
    return UserRead.model_validate(user)


@router.get("/{user_id}", response_model=UserRead)
async def get_user(
    user_id: int,
    _: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserRead:
    user = await crud_user.get(db, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return UserRead.model_validate(user)


@router.patch("/{user_id}", response_model=UserRead)
async def update_user(
    user_id: int,
    body: UserUpdate,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserRead:
    user = await crud_user.get(db, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    updated = await crud_user.update(db, user, body)
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(
        db,
        user_id=current_user.id,
        action="update",
        entity_table="user",
        entity_id=updated.id,
        client_ip=client_ip,
        description=f"Updated user '{updated.username}'.",
    )
    return UserRead.model_validate(updated)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    user = await crud_user.get(db, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete yourself.",
        )
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(
        db,
        user_id=current_user.id,
        action="delete",
        entity_table="user",
        entity_id=user_id,
        client_ip=client_ip,
        description=f"Deleted user '{user.username}'.",
    )
    await crud_user.remove(db, user_id)
