from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from db.database import get_session
from models.sensors import Sensors
from schemas.sensor_response import SensorResponse
from schemas.location_update import LocationRename


router = APIRouter(prefix="/locations", tags=["Locations"])


# GET /api/locations/{name}
# Returns all sensors at this location.
@router.get("/{name}", response_model=list[SensorResponse])
def get_sensors_by_location(
    name: str,
    session: Session = Depends(get_session),
):
    sensors = session.exec(
        select(Sensors).where(Sensors.location == name)
    ).all()
    if not sensors:
        raise HTTPException(
            status_code=404,
            detail=f"Location '{name}' has no sensors.",
        )
    return sensors


# PATCH /api/locations/{name}
# Bulk-renames every sensor whose `location` matches `name` to `new_name`.
# Atomic — single commit. Returns the updated sensors.
@router.patch("/{name}", response_model=list[SensorResponse])
def rename_location(
    name: str,
    body: LocationRename,
    session: Session = Depends(get_session),
):
    new_name = (body.new_name or "").strip()
    if not new_name:
        raise HTTPException(
            status_code=400,
            detail="`new_name` cannot be empty.",
        )
    if new_name == name:
        raise HTTPException(
            status_code=400,
            detail="`new_name` is the same as the current name.",
        )

    sensors = session.exec(
        select(Sensors).where(Sensors.location == name)
    ).all()
    if not sensors:
        raise HTTPException(
            status_code=404,
            detail=f"Location '{name}' has no sensors.",
        )

    now = datetime.now(timezone.utc)
    for s in sensors:
        s.location = new_name
        s.updated_at = now
        session.add(s)

    session.commit()
    for s in sensors:
        session.refresh(s)
    return sensors
