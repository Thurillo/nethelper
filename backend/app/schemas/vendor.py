from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class VendorCreate(BaseModel):
    name: str
    slug: str
    snmp_default_community: Optional[str] = None
    snmp_version: Optional[int] = 2
    ssh_default_username: Optional[str] = None
    ssh_default_password: Optional[str] = None  # plain-text, will be encrypted
    ssh_default_port: Optional[int] = 22
    driver_class: Optional[str] = None
    notes: Optional[str] = None


class VendorUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    snmp_default_community: Optional[str] = None
    snmp_version: Optional[int] = None
    ssh_default_username: Optional[str] = None
    ssh_default_password: Optional[str] = None
    ssh_default_port: Optional[int] = None
    driver_class: Optional[str] = None
    notes: Optional[str] = None


class VendorRead(BaseModel):
    id: int
    name: str
    slug: str
    snmp_default_community: Optional[str] = None
    snmp_version: Optional[int] = None
    ssh_default_username: Optional[str] = None
    has_password: bool = False  # True if ssh_default_password_enc is set
    ssh_default_port: Optional[int] = None
    driver_class: Optional[str] = None
    notes: Optional[str] = None

    model_config = {"from_attributes": True}
