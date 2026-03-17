from __future__ import annotations

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.cable import Cable
from app.schemas.cable import CableCreate, CableUpdate


def _normalize_ids(a_id: int, b_id: int) -> tuple[int, int]:
    """Ensure interface_a_id < interface_b_id for dedup."""
    return (min(a_id, b_id), max(a_id, b_id))


class CRUDCable(CRUDBase[Cable, CableCreate, CableUpdate]):
    async def get_cables_for_device(
        self, db: AsyncSession, device_id: int
    ) -> list[Cable]:
        from app.models.interface import Interface

        # Get all interface IDs for this device
        iface_result = await db.execute(
            select(Interface.id).where(Interface.device_id == device_id)
        )
        iface_ids = [row[0] for row in iface_result.all()]
        if not iface_ids:
            return []

        result = await db.execute(
            select(Cable).where(
                or_(
                    Cable.interface_a_id.in_(iface_ids),
                    Cable.interface_b_id.in_(iface_ids),
                )
            )
        )
        return list(result.scalars().all())

    async def get_cable_for_interface(
        self, db: AsyncSession, interface_id: int
    ) -> Cable | None:
        result = await db.execute(
            select(Cable).where(
                or_(
                    Cable.interface_a_id == interface_id,
                    Cable.interface_b_id == interface_id,
                )
            )
        )
        return result.scalar_one_or_none()

    async def create(self, db: AsyncSession, obj_in: CableCreate) -> Cable:
        a_id, b_id = _normalize_ids(obj_in.interface_a_id, obj_in.interface_b_id)
        data = obj_in.model_dump()
        data["interface_a_id"] = a_id
        data["interface_b_id"] = b_id
        db_obj = Cable(**data)
        db.add(db_obj)
        await db.flush()
        await db.refresh(db_obj)
        return db_obj

    async def update(self, db: AsyncSession, db_obj: Cable, obj_in: CableUpdate | dict) -> Cable:
        if isinstance(obj_in, dict):
            update_data = obj_in
        else:
            update_data = obj_in.model_dump(exclude_unset=True)
        # Normalize IDs if both are being updated
        a_id = update_data.get("interface_a_id", db_obj.interface_a_id)
        b_id = update_data.get("interface_b_id", db_obj.interface_b_id)
        if "interface_a_id" in update_data or "interface_b_id" in update_data:
            a_id, b_id = _normalize_ids(a_id, b_id)
            update_data["interface_a_id"] = a_id
            update_data["interface_b_id"] = b_id
        for field, value in update_data.items():
            if hasattr(db_obj, field):
                setattr(db_obj, field, value)
        db.add(db_obj)
        await db.flush()
        await db.refresh(db_obj)
        return db_obj


crud_cable = CRUDCable(Cable)
