from fastapi import APIRouter, HTTPException
from ml.predict import fetch_sensor_data, prepare_sensor_data, predict_latest

router = APIRouter(prefix="/corrosion", tags=["corrosion"])


@router.get("/predict/{sensor_code}")
def predict_corrosion(sensor_code: str):
    df = fetch_sensor_data(sensor_code)

    if df.empty:
        raise HTTPException(status_code=404, detail="No sensor data found.")

    prepared = prepare_sensor_data(df)

    if prepared.empty:
        raise HTTPException(
            status_code=400,
            detail="Not enough valid sensor history to create lag features."
        )

    result = predict_latest(prepared)

    if result is None:
        raise HTTPException(status_code=400, detail="Prediction failed.")

    return result