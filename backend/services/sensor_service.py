from datetime import datetime, timezone

from sqlmodel import Session, select
from fastapi import HTTPException
from models.sensors import Sensors
from schemas.sensor_request import SensorRequest
from schemas.sensor_update import SensorUpdate
from models.sensors import ConnectionStatus


def get_sensor_or_404(session: Session, sensor_code: str) -> Sensors:
    sensor = session.exec(
        select(Sensors).where(Sensors.sensor_code == sensor_code)
    ).first()
    if not sensor:
        raise HTTPException(
            status_code=404,
            detail=f"Sensor '{sensor_code}' not found.",
        )
    return sensor


def update_sensor(
    session: Session,
    sensor_code: str,
    patch: SensorUpdate,
) -> Sensors:
    sensor = get_sensor_or_404(session, sensor_code)

    data = patch.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(sensor, field, value)

    sensor.updated_at = datetime.now(timezone.utc)

    session.add(sensor)
    session.commit()
    session.refresh(sensor)
    return sensor


def CreateSensor(
    session: Session,
    submission_data: SensorRequest,
) -> Sensors:

    # Check if sensor already exists
    existing = session.exec(
        select(Sensors).where(
            Sensors.sensor_code == submission_data.sensor_code
        )
    ).first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Sensor '{submission_data.sensor_code}' already exists"


        )

    db_submission = Sensors(

        sensor_code=submission_data.sensor_code,
        name=submission_data.name,
        purpose=submission_data.purpose,
        location=submission_data.location,

        # explicit operational defaults
        status=ConnectionStatus.OFFLINE,
        is_active=False,
        last_seen_at=None,
    )

    session.add(db_submission)
    session.commit()
    session.refresh(db_submission)

    return db_submission
