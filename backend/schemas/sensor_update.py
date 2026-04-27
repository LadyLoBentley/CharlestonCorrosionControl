from typing import Optional
from sqlmodel import SQLModel

from models.sensors import ConnectionStatus


class SensorUpdate(SQLModel):
    """All fields optional — caller only sends what they want to change."""
    name: Optional[str] = None
    purpose: Optional[str] = None
    location: Optional[str] = None
    status: Optional[ConnectionStatus] = None
    is_active: Optional[bool] = None
