from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/backup", tags=["backup"])

EXPORT_TABLES = [
    "user",
    "site",
    "vendor",
    "cabinet",
    "vlan",
    "device",
    "interface",
    "cable",
    "ip_prefix",
    "ip_address",
    "scan_job",
    "mac_entry",
    "scan_conflict",
    "audit_log",
]

NETWORK_RESET_TABLES = [
    "scan_conflict",
    "audit_log",
    "mac_entry",
    "scan_job",
    "cable",
    "ip_address",
    "ip_prefix",
    "interface",
    "device",
]

FULL_EXTRA_TABLES = [
    "cabinet",
    "vlan",
    "site",
]


def _serialize_value(val):
    """Convert non-JSON-serializable types to serializable equivalents."""
    if isinstance(val, datetime):
        return val.isoformat()
    if isinstance(val, UUID):
        return str(val)
    if isinstance(val, Decimal):
        return float(val)
    return val


@router.get("/export")
async def export_backup(
    _: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Export all tables to a JSON backup file."""
    exported_at = datetime.now(timezone.utc).isoformat()
    tables_data: dict[str, list] = {}

    for table in EXPORT_TABLES:
        try:
            result = await db.execute(text(f'SELECT * FROM "{table}" ORDER BY id'))
            rows = result.mappings().all()
            tables_data[table] = [
                {k: _serialize_value(v) for k, v in row.items()} for row in rows
            ]
        except Exception as exc:
            logger.warning("Skipping table '%s' during export: %s", table, exc)
            tables_data[table] = []

    payload = {
        "version": 1,
        "exported_at": exported_at,
        "tables": tables_data,
    }

    json_bytes = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"nethelper_backup_{timestamp}.json"

    return StreamingResponse(
        iter([json_bytes]),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/import")
async def import_backup(
    file: UploadFile,
    _: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Restore all tables from a JSON backup file."""
    raw = await file.read()
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid JSON file: {exc}",
        ) from exc

    if "tables" not in payload:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Backup file missing 'tables' key.",
        )

    tables: dict[str, list] = payload["tables"]
    restored: dict[str, int] = {}

    # Use a raw connection for the transaction so we can run DDL-like statements
    async with db.begin():
        # Truncate in REVERSE export order
        for table in reversed(EXPORT_TABLES):
            if table not in tables:
                continue
            try:
                await db.execute(
                    text(f'TRUNCATE "{table}" RESTART IDENTITY CASCADE')
                )
            except Exception as exc:
                logger.warning("Skipping TRUNCATE for table '%s': %s", table, exc)

        # Insert in FORWARD order
        for table in EXPORT_TABLES:
            rows = tables.get(table)
            if not rows:
                restored[table] = 0
                continue

            try:
                cols = list(rows[0].keys())
                col_list = ", ".join(f'"{c}"' for c in cols)
                placeholders = ", ".join(f":{c}" for c in cols)
                insert_sql = text(
                    f'INSERT INTO "{table}" ({col_list}) VALUES ({placeholders})'
                )
                for row in rows:
                    await db.execute(insert_sql, row)
                restored[table] = len(rows)
            except Exception as exc:
                logger.warning(
                    "Skipping INSERT for table '%s': %s", table, exc
                )
                restored[table] = 0

        # Reset sequences
        for table in EXPORT_TABLES:
            try:
                await db.execute(
                    text(
                        f"SELECT setval('\"{table}_id_seq\"',"
                        f" COALESCE(MAX(id), 0) + 1, false) FROM \"{table}\""
                    )
                )
            except Exception as exc:
                logger.debug(
                    "Could not reset sequence for '%s': %s", table, exc
                )

    return {"restored": restored}


@router.delete("/reset")
async def reset_data(
    _: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    scope: str = "network",
):
    """Truncate network or all data (keeps users and vendors always)."""
    if scope not in ("network", "full"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="scope must be 'network' or 'full'",
        )

    tables_to_clear = list(NETWORK_RESET_TABLES)
    if scope == "full":
        tables_to_clear = tables_to_clear + list(FULL_EXTRA_TABLES)

    cleared: list[str] = []
    async with db.begin():
        for table in tables_to_clear:
            try:
                await db.execute(
                    text(f'TRUNCATE "{table}" RESTART IDENTITY CASCADE')
                )
                cleared.append(table)
            except Exception as exc:
                logger.warning("Skipping TRUNCATE for table '%s': %s", table, exc)

    return {"reset": scope, "tables_cleared": cleared}
