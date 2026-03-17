from __future__ import annotations

from sqlalchemy import select
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
)


class CRUDCabinet(CRUDBase[Cabinet, CabinetCreate, CabinetUpdate]):
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

        # Build occupied slots map: u_position -> device
        occupied: dict[int, Device] = {}
        for device in devices:
            if device.u_position is not None:
                for u in range(device.u_position, device.u_position + (device.u_height or 1)):
                    occupied[u] = device

        slots: list[RackDiagramSlot] = []
        free_slots: list[int] = []

        for u in range(1, cabinet.u_count + 1):
            if u in occupied:
                device = occupied[u]
                # Only add the first slot for multi-U devices
                if device.u_position == u:
                    slots.append(
                        RackDiagramSlot(
                            u_position=u,
                            u_height=device.u_height or 1,
                            device_id=device.id,
                            device_name=device.name,
                            device_type=device.device_type.value,
                            is_free=False,
                        )
                    )
                # Skip continuation slots for multi-U devices
            else:
                slots.append(
                    RackDiagramSlot(
                        u_position=u,
                        u_height=1,
                        device_id=None,
                        device_name=None,
                        device_type=None,
                        is_free=True,
                    )
                )
                free_slots.append(u)

        cabinet_read = CabinetRead.model_validate(cabinet)
        return RackDiagram(cabinet=cabinet_read, slots=slots, free_slots=free_slots)


crud_cabinet = CRUDCabinet(Cabinet)
