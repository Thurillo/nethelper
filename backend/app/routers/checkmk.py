"""CheckMK RAW 2.4 integration router.

Endpoints:
  GET  /checkmk/settings           - Read current settings (api_key masked) [admin]
  PUT  /checkmk/settings           - Save settings (encrypts api_key at rest) [admin]
  GET  /checkmk/test               - Test connection to CheckMK [admin]
  GET  /checkmk/hosts              - List available hosts from CheckMK API [any user]
  GET  /checkmk/status             - UP/DOWN/UNREACHABLE state for all linked devices [any user]
  POST /checkmk/link/{device_id}   - Set checkmk_host_name on device [admin]
  DELETE /checkmk/link/{device_id} - Clear checkmk_host_name on device [admin]
"""
from __future__ import annotations

import logging
from typing import Annotated, Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import decrypt_value, encrypt_value
from app.database import get_db
from app.dependencies import get_current_user, require_admin
from app.models.app_setting import AppSetting
from app.models.device import Device

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/checkmk", tags=["checkmk"])

# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------


class CheckMKSettings(BaseModel):
    url: str = ""
    username: str = ""
    api_key: str = ""          # masked on GET, plain on PUT
    enabled: bool = False


class CheckMKSettingsRead(BaseModel):
    url: str = ""
    username: str = ""
    api_key_set: bool = False  # True if an api_key is stored
    enabled: bool = False


class CheckMKTestResult(BaseModel):
    ok: bool
    message: str
    version: str | None = None


class CheckMKHostItem(BaseModel):
    name: str
    address: str


class CheckMKDeviceStatus(BaseModel):
    host_name: str
    state: int                  # 0=UP 1=DOWN 2=UNREACHABLE 3=PENDING -1=not_found
    state_label: str
    address: str


class CheckMKLinkRequest(BaseModel):
    host_name: str


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

_STATE_LABELS: dict[int, str] = {
    0: "up",
    1: "down",
    2: "unreachable",
    3: "pending",
    -1: "not_found",
}


async def _get_setting(db: AsyncSession, key: str) -> str:
    row = await db.get(AppSetting, key)
    return row.value if row and row.value else ""


async def _set_setting(db: AsyncSession, key: str, value: str | None) -> None:
    row = await db.get(AppSetting, key)
    if row is None:
        row = AppSetting(key=key, value=value)
        db.add(row)
    else:
        row.value = value
    await db.flush()


async def _get_checkmk_credentials(db: AsyncSession) -> tuple[str, str, str]:
    """Return (url, username, decrypted_api_key). Raises HTTP 503 if not configured."""
    url = await _get_setting(db, "checkmk.url")
    username = await _get_setting(db, "checkmk.username")
    api_key_enc = await _get_setting(db, "checkmk.api_key")

    if not url or not username or not api_key_enc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="CheckMK non configurato. Vai in Admin → Integrazioni.",
        )

    try:
        api_key = decrypt_value(api_key_enc)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Impossibile decifrare la chiave API CheckMK. Riconfigura l'integrazione.",
        )

    return url, username, api_key


def _checkmk_auth_headers(username: str, api_key: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {username} {api_key}",
        "Accept": "application/json",
    }


async def _fetch_checkmk_hosts(url: str, username: str, api_key: str) -> list[dict[str, Any]]:
    """Call CheckMK REST API and return list of hosts with name/state/address."""
    api_url = url.rstrip("/") + "/check_mk/api/1.0/domain-types/host/collections/all"
    params = {"columns": ["name", "state", "address"]}
    headers = _checkmk_auth_headers(username, api_key)

    try:
        async with httpx.AsyncClient(timeout=10.0, verify=False) as client:
            resp = await client.get(api_url, headers=headers, params=params)
            resp.raise_for_status()
            data = resp.json()
            return data.get("value", [])
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"CheckMK ha risposto con errore {exc.response.status_code}.",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Impossibile raggiungere CheckMK: {exc}",
        ) from exc


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/settings", response_model=CheckMKSettingsRead)
async def get_settings(
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin=Depends(require_admin),
):
    """Read current CheckMK settings. API key is never returned in plain text."""
    url = await _get_setting(db, "checkmk.url")
    username = await _get_setting(db, "checkmk.username")
    api_key_enc = await _get_setting(db, "checkmk.api_key")
    enabled_str = await _get_setting(db, "checkmk.enabled")
    return CheckMKSettingsRead(
        url=url,
        username=username,
        api_key_set=bool(api_key_enc),
        enabled=enabled_str == "true",
    )


@router.put("/settings", status_code=status.HTTP_204_NO_CONTENT)
async def update_settings(
    payload: CheckMKSettings,
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin=Depends(require_admin),
):
    """Save CheckMK settings. API key is encrypted at rest if provided."""
    await _set_setting(db, "checkmk.url", payload.url.strip() or None)
    await _set_setting(db, "checkmk.username", payload.username.strip() or None)
    if payload.api_key.strip():
        await _set_setting(db, "checkmk.api_key", encrypt_value(payload.api_key.strip()))
    await _set_setting(db, "checkmk.enabled", "true" if payload.enabled else "false")
    await db.commit()


@router.get("/test", response_model=CheckMKTestResult)
async def test_connection(
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin=Depends(require_admin),
):
    """Test connectivity to CheckMK and return version info."""
    url, username, api_key = await _get_checkmk_credentials(db)
    api_url = url.rstrip("/") + "/check_mk/api/1.0/domain-types/version/actions/show/invoke"
    headers = _checkmk_auth_headers(username, api_key)

    try:
        async with httpx.AsyncClient(timeout=10.0, verify=False) as client:
            resp = await client.get(api_url, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            version = data.get("versions", {}).get("checkmk", None)
            return CheckMKTestResult(ok=True, message="Connessione riuscita", version=version)
    except httpx.HTTPStatusError as exc:
        return CheckMKTestResult(
            ok=False,
            message=f"CheckMK ha risposto con HTTP {exc.response.status_code}",
        )
    except Exception as exc:
        return CheckMKTestResult(ok=False, message=str(exc))


@router.get("/hosts", response_model=list[CheckMKHostItem])
async def list_hosts(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user=Depends(get_current_user),
):
    """Return all hosts available in CheckMK (name + address)."""
    url, username, api_key = await _get_checkmk_credentials(db)
    raw = await _fetch_checkmk_hosts(url, username, api_key)
    result = []
    for host in raw:
        extensions = host.get("extensions", {})
        name = extensions.get("name") or host.get("id", "")
        address = extensions.get("attributes", {}).get("ipaddress", "")
        result.append(CheckMKHostItem(name=name, address=address))
    return result


@router.get("/status", response_model=dict[int, CheckMKDeviceStatus])
async def get_status(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user=Depends(get_current_user),
):
    """Return CheckMK state for all devices that have a checkmk_host_name set.

    State codes: 0=UP, 1=DOWN, 2=UNREACHABLE, 3=PENDING, -1=not_found (no error).
    Devices without checkmk_host_name are not included in the response.
    If CheckMK is disabled or unreachable, returns empty dict silently.
    """
    enabled_str = await _get_setting(db, "checkmk.enabled")
    if enabled_str != "true":
        return {}

    # Fetch all linked devices
    result = await db.execute(
        select(Device).where(Device.checkmk_host_name.isnot(None))
    )
    linked_devices = result.scalars().all()
    if not linked_devices:
        return {}

    # Attempt to fetch CheckMK data; on failure return not_found for all
    try:
        url, username, api_key = await _get_checkmk_credentials(db)
        raw = await _fetch_checkmk_hosts(url, username, api_key)
    except HTTPException:
        return {}

    # Build lookup map: host_name -> {state, address}
    host_map: dict[str, dict[str, Any]] = {}
    for host in raw:
        extensions = host.get("extensions", {})
        name = extensions.get("name") or host.get("id", "")
        attrs = extensions.get("attributes", {})
        address = attrs.get("ipaddress", "")
        # state is nested under "state" in the extensions — CheckMK Live Status
        state_val = extensions.get("state", -1)
        if isinstance(state_val, dict):
            state_val = state_val.get("value", -1)
        host_map[name] = {"state": int(state_val), "address": address}

    # Build response
    response: dict[int, CheckMKDeviceStatus] = {}
    for device in linked_devices:
        host_name = device.checkmk_host_name
        if host_name in host_map:
            info = host_map[host_name]
            state = info["state"]
            response[device.id] = CheckMKDeviceStatus(
                host_name=host_name,
                state=state,
                state_label=_STATE_LABELS.get(state, "unknown"),
                address=info["address"],
            )
        else:
            response[device.id] = CheckMKDeviceStatus(
                host_name=host_name,
                state=-1,
                state_label="not_found",
                address="",
            )

    return response


@router.post("/link/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
async def link_device(
    device_id: int,
    payload: CheckMKLinkRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin=Depends(require_admin),
):
    """Set checkmk_host_name on the given device."""
    device = await db.get(Device, device_id)
    if device is None:
        raise HTTPException(status_code=404, detail="Dispositivo non trovato.")
    device.checkmk_host_name = payload.host_name.strip() or None
    await db.commit()


@router.delete("/link/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_device(
    device_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin=Depends(require_admin),
):
    """Clear checkmk_host_name on the given device."""
    device = await db.get(Device, device_id)
    if device is None:
        raise HTTPException(status_code=404, detail="Dispositivo non trovato.")
    device.checkmk_host_name = None
    await db.commit()
