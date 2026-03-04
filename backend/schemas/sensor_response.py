from sqlmodel import SQLModel
from datetime import datetime
from typing import Optional

from models.sensors import ConnectionStatus

class SensorResponse(SQLModel):
    sensor_code: str
    name: str
    purpose: str = None
    location: str
    status: ConnectionStatus
    last_seen_at: Optional[datetime] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime