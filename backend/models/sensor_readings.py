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

    # Primary and foreign keys
    id: Optional[int] = Field(default=None, primary_key=True)
    sensor_id: str = Field(default=None, index=True)

    # Time log the data
    timestamp: datetime = Field(index=True)

    # Environmental Parameters
    temp_c: float
    rh_percent: float
    pressure_iwg: float

    # Corrosion parameters
    cu_incr_A_per_24h: Optional[float] = None
    ag_incr_A_per_24h: Optional[float] = None
    cu_cum_A: Optional[float] = None
    ag_cum_A: Optional[float] = None

    # Event handling
    event_flag: int = 0
    sensor_valid: bool = True
    isa_class: ISAClass = Field(default=ISAClass.G1, index=True)
    