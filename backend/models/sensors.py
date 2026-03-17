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

    sensor_code: str = Field(primary_key=True, index=True)

    name: str = Field(index=True)
    purpose: Optional[str] = Field(default=None)

    location: str = Field(index=True)

    status: ConnectionStatus = Field(default=ConnectionStatus.OFFLINE)
    last_seen_at: Optional[datetime] = Field(default=None, index=True)

    is_active: bool = Field(default=False, index=True)
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)