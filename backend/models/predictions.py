from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime, timezone
from enum import Enum

def now_utc() -> datetime:
    return datetime.now(timezone.utc)

class RiskLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"

class Predction(SQLModel, table=True):

    __tablename__ = "predictions"

    # Primary and foreign keys
    id: Optional[int] = Field(default=None, primary_key=True)
    sensor_id: int= Field(index=True)

    # Time attributes
    predicted_at: datetime = Field(default_factory=now_utc, index=True)
    created_at: datetime = Field(default_factory=now_utc)

    # Model outputs
    prob_corrosive: float = Field(ge=0.0, le=1.0)
    is_corrosive: bool = Field(index=True)

    # UI prediction translation
    risk_level: RiskLevel = Field(default=RiskLevel.LOW, index=True)

    # Model parameters
    threshold: float = Field(default=0.20)
    model_name: str = Field(default="svm_rbf", index=True)
    model_version: str = Field(default="v1", index=True)

    # Increase interpretability
    reason: Optional[str]= Field(default_factory=now_utc)
