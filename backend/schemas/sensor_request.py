from sqlmodel import SQLModel

class SensorRequest(SQLModel):
    sensor_code: str
    name: str
    purpose: str = None
    location: str