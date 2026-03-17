import pandas as pd
from db.database import engine
import joblib


def fetch_sensor_data(sensor_code: str, limit: int = 50) -> pd.DataFrame:
    query = f"""
        SELECT *
        FROM sensor_readings
        WHERE sensor_code = '{sensor_code}'
        ORDER BY timestamp DESC
        LIMIT {limit}
    """

    df = pd.read_sql(query, engine)

    if df.empty:
        return df

    # must be oldest → newest for lag creation
    return df.sort_values("timestamp")


def prepare_sensor_data(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    # sort time
    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
    df = df.dropna(subset=["timestamp"]).sort_values("timestamp")

    # keep valid sensor rows
    if "sensor_valid" in df.columns:
        df = df[df["sensor_valid"] == True]

    # create lag features (must match training)
    for lag in (1, 2, 4):
        df[f"rh_lag{lag}"] = df["rh_percent"].shift(lag)
        df[f"temp_lag{lag}"] = df["temp_c"].shift(lag)
        df[f"pressure_lag{lag}"] = df["pressure_iwg"].shift(lag)

    required = [
        "temp_c",
        "rh_percent",
        "pressure_iwg",
        "rh_lag1","rh_lag2","rh_lag4",
        "temp_lag1","temp_lag2","temp_lag4",
        "pressure_lag1","pressure_lag2","pressure_lag4",
    ]

    df = df.dropna(subset=required)

    return df

MODEL_PATH = "artifacts/svm_pipeline.joblib"
METADATA_PATH = "artifacts/model_metadata.joblib"

model = joblib.load(MODEL_PATH)
metadata = joblib.load(METADATA_PATH)

FEATURES = metadata["features"]
THRESHOLD = metadata["decision_threshold"]


def predict_latest(df):
    if df.empty:
        return None

    latest = df.iloc[[-1]]

    X = latest[FEATURES]

    prob = float(model.predict_proba(X)[:,1][0])

    prediction = int(prob >= THRESHOLD)

    return {
        "sensor_code": latest.iloc[0]["sensor_code"],
        "timestamp": latest.iloc[0]["timestamp"],
        "probability": prob,
        "prediction": prediction
    }

df = fetch_sensor_data("OG-LAB-101")

prepared = prepare_sensor_data(df)

result = predict_latest(prepared)

print(result)