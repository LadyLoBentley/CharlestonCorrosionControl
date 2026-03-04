from sqlmodel import SQLModel
from models.sensors import ConnectionStatus

class SensorRequest(SQLModel):
    sensor_code: str
    name: str
    purpose: str = None
    location: str