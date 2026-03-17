from __future__ import annotations

from typing import Optional

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.device import Device
from app.schemas.device import DeviceCreate, DeviceUpdate
from app.core.crypto import encrypt_value


class CRUDDevice(CRUDBase[Device, DeviceCreate, DeviceUpdate]):
    async def get_by_ip(self, db: AsyncSession, ip: str) -> Optional[Device]:
        result = await db.execute(
            select(Device).where(Device.primary_ip == ip)
        )
        return result.scalar_one_or_none()

    async def get_by_cabinet(self, db: AsyncSession, cabinet_id: int) -> list[Device]:
        result = await db.execute(
            select(Device).where(Device.cabinet_id == cabinet_id)
        )
        return list(result.scalars().all())

    async def search(
        self,
        db: AsyncSession,
        skip: int = 0,
        limit: int = 100,
        site_id: Optional[int] = None,
        cabinet_id: Optional[int] = None,
        device_type: Optional[str] = None,
        status: Optional[str] = None,
        q: Optional[str] = None,
    ) -> list[Device]:
        stmt = select(Device)
        if site_id is not None:
            stmt = stmt.where(Device.site_id == site_id)
        if cabinet_id is not None:
            stmt = stmt.where(Device.cabinet_id == cabinet_id)
        if device_type is not None:
            stmt = stmt.where(Device.device_type == device_type)
        if status is not None:
            stmt = stmt.where(Device.status == status)
        if q:
            stmt = stmt.where(
                or_(
                    Device.name.ilike(f"%{q}%"),
                    Device.primary_ip.ilike(f"%{q}%"),
                )
            )
        stmt = stmt.offset(skip).limit(limit)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    def _encrypt_sensitive_fields(self, data: dict) -> dict:
        """Encrypt password/credential fields before storing."""
        sensitive_map = {
            "ssh_password": "ssh_password_enc",
            "snmp_v3_auth_password": "snmp_v3_auth_password_enc",
            "snmp_v3_priv_password": "snmp_v3_priv_password_enc",
        }
        for plain_field, enc_field in sensitive_map.items():
            if plain_field in data:
                value = data.pop(plain_field)
                if value is not None:
                    data[enc_field] = encrypt_value(value)
                else:
                    data[enc_field] = None
        return data

    async def create(self, db: AsyncSession, obj_in: DeviceCreate) -> Device:
        data = obj_in.model_dump()
        data = self._encrypt_sensitive_fields(data)
        db_obj = Device(**data)
        db.add(db_obj)
        await db.flush()
        await db.refresh(db_obj)
        return db_obj

    async def update(self, db: AsyncSession, db_obj: Device, obj_in: DeviceUpdate | dict) -> Device:
        if isinstance(obj_in, dict):
            update_data = obj_in
        else:
            update_data = obj_in.model_dump(exclude_unset=True)
        update_data = self._encrypt_sensitive_fields(update_data)
        for field, value in update_data.items():
            if hasattr(db_obj, field):
                setattr(db_obj, field, value)
        db.add(db_obj)
        await db.flush()
        await db.refresh(db_obj)
        return db_obj


crud_device = CRUDDevice(Device)
