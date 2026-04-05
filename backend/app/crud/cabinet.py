from __future__ import annotations

from sqlalchemy import case, func, select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.cabinet import Cabinet
from app.models.device import Device
from app.schemas.cabinet import (
    CabinetCreate,
    CabinetRead,
    CabinetUpdate,
    RackDiagram,
    RackDiagramSlot,
    RackDiagramDevice,
)


class CRUDCabinet(CRUDBase[Cabinet, CabinetCreate, CabinetUpdate]):

    async def get(self, db: AsyncSession, id: int) -> Cabinet | None:
        """Get cabinet with site eagerly loaded."""
        result = await db.execute(
            select(Cabinet)
            .options(selectinload(Cabinet.site))
            .where(Cabinet.id == id)
        )
        return result.scalar_one_or_none()

    async def get_multi(self, db: AsyncSession, skip: int = 0, limit: int = 100, **filters) -> list[Cabinet]:
        """List cabinets with site eagerly loaded."""
        stmt = select(Cabinet).options(
            selectinload(Cabinet.site),
        )
        for field, value in filters.items():
            if value is not None and hasattr(Cabinet, field):
                stmt = stmt.where(getattr(Cabinet, field) == value)
        stmt = stmt.offset(skip).limit(limit)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def get_cabinet_stats(
        self, db: AsyncSession, cabinet_ids: list[int]
    ) -> dict[int, dict]:
        """Return per-cabinet stats: devices_count, used_u, devices_summary.

        Single query grouped by (cabinet_id, device_type).
        Returns a dict keyed by cabinet_id.
        """
        if not cabinet_ids:
            return {}

        rows = await db.execute(
            select(
                Device.cabinet_id,
                Device.device_type,
                func.count(Device.id).label("cnt"),
                func.sum(
                    case((Device.u_position.isnot(None), Device.u_height), else_=0)
                ).label("used_u"),
            )
            .where(Device.cabinet_id.in_(cabinet_ids))
            .group_by(Device.cabinet_id, Device.device_type)
        )

        stats: dict[int, dict] = {}
        for row in rows:
            cid = row.cabinet_id
            dtype = row.device_type.value if hasattr(row.device_type, "value") else str(row.device_type)
            cnt = int(row.cnt)
            used = int(row.used_u or 0)
            if cid not in stats:
                stats[cid] = {"devices_count": 0, "used_u": 0, "devices_summary": {}}
            stats[cid]["devices_count"] += cnt
            stats[cid]["used_u"] += used
            stats[cid]["devices_summary"][dtype] = stats[cid]["devices_summary"].get(dtype, 0) + cnt

        return stats

    async def get_devices_in_cabinet(
        self, db: AsyncSession, cabinet_id: int
    ) -> list[Device]:
        result = await db.execute(
            select(Device).where(Device.cabinet_id == cabinet_id)
        )
        return list(result.scalars().all())

    async def find_next_free_u(
        self, db: AsyncSession, cabinet_id: int, u_height: int = 1
    ) -> int | None:
        """Return the lowest U position with enough consecutive free slots, or None if full."""
        cabinet = await self.get(db, cabinet_id)
        if cabinet is None:
            return None

        devices = await self.get_devices_in_cabinet(db, cabinet_id)

        # Build set of occupied U positions
        occupied: set[int] = set()
        for device in devices:
            if device.u_position is not None:
                for u in range(device.u_position, device.u_position + (device.u_height or 1)):
                    occupied.add(u)

        # Find first run of `u_height` consecutive free slots
        for u in range(1, cabinet.u_count + 1):
            if all((u + i) not in occupied and (u + i) <= cabinet.u_count for i in range(u_height)):
                return u
        return None

    async def get_rack_diagram(self, db: AsyncSession, cabinet_id: int) -> RackDiagram | None:
        cabinet = await self.get(db, cabinet_id)
        if cabinet is None:
            return None

        devices = await self.get_devices_in_cabinet(db, cabinet_id)

        # Build map: u_position -> device
        occupied: dict[int, Device] = {}
        for device in devices:
            if device.u_position is not None:
                for u in range(device.u_position, device.u_position + (device.u_height or 1)):
                    occupied[u] = device

        slots: list[RackDiagramSlot] = []
        free_slots: list[int] = []
        used_u = 0

        for u in range(1, cabinet.u_count + 1):
            if u in occupied:
                device = occupied[u]
                if device.u_position == u:
                    h = device.u_height or 1
                    used_u += h
                    slots.append(
                        RackDiagramSlot(
                            u_position=u,
                            u_height=h,
                            is_free=False,
                            device=RackDiagramDevice(
                                id=device.id,
                                name=device.name,
                                device_type=device.device_type.value,
                                status=device.status.value,
                                u_height=h,
                                u_position=device.u_position,
                                primary_ip=device.primary_ip,
                                model=device.model,
                                serial_number=device.serial_number,
                                notes=device.notes,
                            ),
                        )
                    )
                # Continuation slots skipped — covered by u_height of the first slot
            else:
                slots.append(
                    RackDiagramSlot(u_position=u, u_height=1, is_free=True, device=None)
                )
                free_slots.append(u)

        free_u = cabinet.u_count - used_u
        return RackDiagram(
            cabinet=CabinetRead.model_validate(cabinet),
            slots=slots,
            free_slots=free_slots,
            used_u=used_u,
            free_u=free_u,
        )


crud_cabinet = CRUDCabinet(Cabinet)
