from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from db.database import get_session
from schemas.sensor_request import SensorRequest
from schemas.sensor_response import SensorResponse
from services.sensor_service import CreateSensor
from models.sensors import Sensors


router = APIRouter(prefix="/sensor-submissions", tags=["Sensor Submissions"])

# POST /api/sensor-submissions/

@router.post("/", response_model=SensorResponse)
def submit_sensor(
    submission: SensorRequest,
    session: Session = Depends(get_session)
):
    return CreateSensor(session, submission)

@router.get("/", response_model=list[SensorResponse])
def get_sensors(session: Session = Depends(get_session)):
    sensors = session.exec(select(Sensors)).all()
    return sensors