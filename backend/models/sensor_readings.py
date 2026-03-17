from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime
from enum import Enum

class ISAClass(str, Enum):
    G1 = "G1"
    G2 = "G2"
    G3 = "G3"
    GX = "GX"

class SensorReading(SQLModel, table=True):
    __tablename__ = "sensor_readings"

    id: Optional[int] = Field(default=None, primary_key=True)
    sensor_code: str = Field(foreign_key="sensors.sensor_code", index=True)
    timestamp: datetime = Field(index=True)

    temp_c: float
    rh_percent: float
    pressure_iwg: float

    cu_incr_A_per_24h: Optional[float] = None
    ag_incr_A_per_24h: Optional[float] = None
    cu_cum_A: Optional[float] = None
    ag_cum_A: Optional[float] = None

    event_flag: int = 0
    sensor_valid: bool = True
    isa_class: ISAClass = Field(default=ISAClass.G1, index=True)
    