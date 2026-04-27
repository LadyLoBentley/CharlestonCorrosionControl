from fastapi import APIRouter, HTTPException
from ml.predict import (
    fetch_sensor_data,
    prepare_sensor_data,
    predict_latest,
    metadata as model_metadata,
    FEATURES,
    THRESHOLD,
)

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


@router.get("/metadata")
def get_model_metadata():
    """Expose ML model metadata (features + decision threshold).

    Reuses what `ml.predict` already loaded at startup, so no extra disk hit.
    Defensively serializes any extra keys present in the metadata dict.
    """
    safe = {
        "features": list(FEATURES),
        "decision_threshold": float(THRESHOLD),
    }
    # Surface any additional metadata the user stored at training time
    # (e.g. model_name, trained_at, metrics) without requiring code changes.
    if isinstance(model_metadata, dict):
        for key, value in model_metadata.items():
            if key in ("features", "decision_threshold"):
                continue
            try:
                # Round-trip through Python primitives where possible
                if isinstance(value, (str, int, float, bool, list, dict)) or value is None:
                    safe[key] = value
                else:
                    safe[key] = str(value)
            except Exception:
                safe[key] = str(value)
    return safe