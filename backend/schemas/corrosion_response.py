from pydantic import BaseModel
from datetime import datetime


class CorrosionResponse(BaseModel):
    device_id: str
    timestamp: datetime
    corrosion_risk_score: float
    corrosion_prediction: int
    threshold_used: float
    model_version: str