from __future__ import annotations

from sqlalchemy import select
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

    async def get_devices_in_cabinet(
        self, db: AsyncSession, cabinet_id: int
    ) -> list[Device]:
        result = await db.execute(
            select(Device).where(Device.cabinet_id == cabinet_id)
        )
        return list(result.scalars().all())

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
