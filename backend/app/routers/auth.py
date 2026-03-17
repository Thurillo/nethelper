from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, create_refresh_token, decode_token
from app.crud.audit_log import log_action
from app.crud.user import crud_user
from app.database import get_db
from app.dependencies import get_current_user
from app.schemas.auth import LoginRequest, RefreshRequest, TokenResponse, UserMe

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    user = await crud_user.authenticate(db, body.username, body.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
        )

    await crud_user.update_last_login(db, user.id)

    client_ip = getattr(request.state, "client_ip", None) or (
        request.client.host if request.client else None
    )
    await log_action(
        db,
        user_id=user.id,
        action="login",
        entity_table="user",
        entity_id=user.id,
        client_ip=client_ip,
        description=f"User '{user.username}' logged in.",
    )

    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    body: RefreshRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    try:
        payload = decode_token(body.refresh_token)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token.",
        )

    token_type = payload.get("type")
    if token_type != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not a refresh token.",
        )

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing 'sub' claim.",
        )

    user = await crud_user.get(db, int(user_id))
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive.",
        )

    access_token = create_access_token(user.id)
    new_refresh_token = create_refresh_token(user.id)
    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        token_type="bearer",
    )


@router.get("/me", response_model=UserMe)
async def get_me(
    current_user: Annotated[object, Depends(get_current_user)],
) -> UserMe:
    return UserMe.model_validate(current_user)


@router.post("/logout")
async def logout(
    current_user: Annotated[object, Depends(get_current_user)],
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    client_ip = getattr(request.state, "client_ip", None) or (
        request.client.host if request.client else None
    )
    await log_action(
        db,
        user_id=current_user.id,
        action="logout",
        entity_table="user",
        entity_id=current_user.id,
        client_ip=client_ip,
        description=f"User '{current_user.username}' logged out.",
    )
    return {"detail": "Logged out successfully."}
