from sqlmodel import Session, select
from fastapi import HTTPException
from models.sensors import Sensors
from schemas.sensor_request import SensorRequest
from models.sensors import ConnectionStatus

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
