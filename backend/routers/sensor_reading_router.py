from fastapi import APIRouter, Depends
from sqlmodel import Session

from db.database import get_session
from schemas.sensor_reading_request import SensorReadingRequest
from schemas.sensor_reading_response import SensorReadingResponse
from services.sensor_reading_service import (
    create_sensor_reading,
    get_sensor_readings,
    get_sensor_readings_by_sensor_code,
)

router = APIRouter(prefix="/sensor-readings", tags=["Sensor Readings"])


@router.post("/", response_model=SensorReadingResponse)
def submit_sensor_reading(
    submission: SensorReadingRequest,
    session: Session = Depends(get_session),
):
    return create_sensor_reading(session, submission)


@router.get("/", response_model=list[SensorReadingResponse])
def fetch_sensor_readings(
    session: Session = Depends(get_session),
):
    return get_sensor_readings(session)


@router.get("/{sensor_code}", response_model=list[SensorReadingResponse])
def fetch_sensor_readings_by_sensor_code(
    sensor_code: str,
    session: Session = Depends(get_session),
):
    return get_sensor_readings_by_sensor_code(session, sensor_code)