from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from db.database import get_session
from schemas.sensor_request import SensorRequest
from schemas.sensor_response import SensorResponse
from schemas.sensor_update import SensorUpdate
from services.sensor_service import (
    CreateSensor,
    get_sensor_or_404,
    update_sensor,
)
from models.sensors import Sensors
from models.sensor_readings import SensorReading


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


# GET /api/sensor-submissions/{sensor_code}
# Fetch a single sensor by its code. New endpoint, additive.

@router.get("/{sensor_code}", response_model=SensorResponse)
def get_sensor(
    sensor_code: str,
    session: Session = Depends(get_session),
):
    return get_sensor_or_404(session, sensor_code)


# PATCH /api/sensor-submissions/{sensor_code}
# Partial update (status, location, name, purpose, is_active). New endpoint, additive.

@router.patch("/{sensor_code}", response_model=SensorResponse)
def patch_sensor(
    sensor_code: str,
    patch: SensorUpdate,
    session: Session = Depends(get_session),
):
    return update_sensor(session, sensor_code, patch)


# DELETE /api/sensor-submissions/{sensor_code}
# Removes a sensor and any associated readings. Compatible with existing setup.

@router.delete("/{sensor_code}", status_code=204)
def delete_sensor(
    sensor_code: str,
    session: Session = Depends(get_session),
):
    sensor = get_sensor_or_404(session, sensor_code)

    # Clean up any child readings first to respect the FK.
    readings = session.exec(
        select(SensorReading).where(SensorReading.sensor_code == sensor_code)
    ).all()
    for r in readings:
        session.delete(r)

    session.delete(sensor)
    session.commit()
    return None