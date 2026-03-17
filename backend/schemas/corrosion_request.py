from pydantic import BaseModel
from datetime import datetime

class CorrosionRequest(BaseModel):
    device_id: str
    timestamp: datetime
    temp_c: float
    rh_percent: float
    pressure_iwg: float
    sensor_valid: bool = True