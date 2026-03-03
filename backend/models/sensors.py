from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime, timezone
from enum import Enum

class ConnectionStatus(str, Enum):
    ONLINE = "ONLINE"
    WARNING = "WARNING"
    OFFLINE = "OFFLINE"

def now_utc() -> datetime:
    return datetime.now(timezone.utc)

class Sensors(SQLModel, table=True):
    __tablename__ = "sensors"

    sensor_code: str = Field(index=True, default=None, primary_key=True)

    name: str = Field(index=True)
    purpose: Optional[str] = Field(default=None)

    # MVP location tracking
    location: str = Field(index=True)

    # State & Health
    status: ConnectionStatus = Field(default=ConnectionStatus.OFFLINE, index=True)
    last_seen_at: Optional[datetime] = Field(default=None, index=True)

    # Lifecycle
    is_active: bool = Field(default=True, index=True)
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)