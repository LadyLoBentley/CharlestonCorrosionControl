from fastapi import HTTPException
from sqlmodel import Session, select

from models.sensor_readings import SensorReading
from models.sensors import Sensors, ConnectionStatus
from schemas.sensor_reading_request import SensorReadingRequest


def create_sensor_reading(
    session: Session,
    submission_data: SensorReadingRequest,
) -> SensorReading:

    sensor = session.exec(
        select(Sensors).where(Sensors.sensor_code == submission_data.sensor_code)
    ).first()

    if not sensor:
        raise HTTPException(
            status_code=404,
            detail=f"Sensor '{submission_data.sensor_code}' not found."
        )

    db_submission = SensorReading(
        sensor_code=submission_data.sensor_code,
        timestamp=submission_data.timestamp,

        temp_c=submission_data.temp_c,
        rh_percent=submission_data.rh_percent,
        pressure_iwg=submission_data.pressure_iwg,

        cu_incr_A_per_24h=submission_data.cu_incr_A_per_24h,
        ag_incr_A_per_24h=submission_data.ag_incr_A_per_24h,
        cu_cum_A=submission_data.cu_cum_A,
        ag_cum_A=submission_data.ag_cum_A,

        event_flag=submission_data.event_flag,
        sensor_valid=submission_data.sensor_valid,
        isa_class=submission_data.isa_class,
    )

    session.add(db_submission)

    sensor.last_seen_at = submission_data.timestamp
    sensor.status = ConnectionStatus.ONLINE
    sensor.is_active = True
    session.add(sensor)

    session.commit()
    session.refresh(db_submission)

    return db_submission


def get_sensor_readings(
    session: Session,
) -> list[SensorReading]:
    readings = session.exec(select(SensorReading)).all()
    return readings


def get_sensor_readings_by_sensor_code(
    session: Session,
    sensor_code: str,
) -> list[SensorReading]:

    sensor = session.exec(
        select(Sensors).where(Sensors.sensor_code == sensor_code)
    ).first()

    if not sensor:
        raise HTTPException(
            status_code=404,
            detail=f"Sensor '{sensor_code}' not found."
        )

    readings = session.exec(
        select(SensorReading)
        .where(SensorReading.sensor_code == sensor_code)
        .order_by(SensorReading.timestamp.desc())
    ).all()

    return readings