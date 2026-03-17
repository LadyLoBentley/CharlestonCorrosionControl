from sqlmodel import SQLModel
from typing import Optional
from datetime import datetime

from models.sensor_readings import ISAClass


class SensorReadingRequest(SQLModel):
    sensor_code: str
    timestamp: datetime

    temp_c: float
    rh_percent: float
    pressure_iwg: float

    cu_incr_A_per_24h: Optional[float] = None
    ag_incr_A_per_24h: Optional[float] = None
    cu_cum_A: Optional[float] = None
    ag_cum_A: Optional[float] = None

    event_flag: int = 0
    sensor_valid: bool = True
    isa_class: ISAClass = ISAClass.G1