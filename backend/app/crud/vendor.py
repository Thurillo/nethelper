from __future__ import annotations

from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.vendor import Vendor
from app.schemas.vendor import VendorCreate, VendorUpdate
from app.core.crypto import encrypt_value, decrypt_value


class CRUDVendor(CRUDBase[Vendor, VendorCreate, VendorUpdate]):
    async def get_multi(self, db: AsyncSession, skip: int = 0, limit: int = 100, **filters) -> list[Vendor]:
        stmt = select(Vendor).order_by(Vendor.name).offset(skip).limit(limit)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def get_by_slug(self, db: AsyncSession, slug: str) -> Optional[Vendor]:
        result = await db.execute(select(Vendor).where(Vendor.slug == slug))
        return result.scalar_one_or_none()

    async def create(self, db: AsyncSession, obj_in: VendorCreate) -> Vendor:
        data = obj_in.model_dump(exclude={"ssh_default_password"})
        if obj_in.ssh_default_password:
            data["ssh_default_password_enc"] = encrypt_value(obj_in.ssh_default_password)
        db_obj = Vendor(**data)
        db.add(db_obj)
        await db.flush()
        await db.refresh(db_obj)
        return db_obj

    async def update(self, db: AsyncSession, db_obj: Vendor, obj_in: VendorUpdate | dict) -> Vendor:
        if isinstance(obj_in, dict):
            update_data = obj_in
        else:
            update_data = obj_in.model_dump(exclude_unset=True)
        if "ssh_default_password" in update_data:
            pwd = update_data.pop("ssh_default_password")
            if pwd is not None:
                update_data["ssh_default_password_enc"] = encrypt_value(pwd)
            else:
                update_data["ssh_default_password_enc"] = None
        for field, value in update_data.items():
            if hasattr(db_obj, field):
                setattr(db_obj, field, value)
        db.add(db_obj)
        await db.flush()
        await db.refresh(db_obj)
        return db_obj


crud_vendor = CRUDVendor(Vendor)
