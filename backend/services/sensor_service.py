from sqlmodel import Session
from models.sensors import Sensors
from schemas.sensor_request import SensorRequest
from models.sensors import ConnectionStatus

def CreateSensor(
    session: Session,
    submission_data: SensorRequest,
) -> Sensors:

    db_submission = Sensors(

        sensor_code=submission_data.sensor_code,
        name=submission_data.name,
        purpose=submission_data.purpose,
        location=submission_data.location,
    )

    session.add(db_submission)
    session.commit()
    session.refresh(db_submission)

    return db_submission
