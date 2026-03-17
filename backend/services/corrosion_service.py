import json
from pathlib import Path
import joblib
import pandas as pd


ARTIFACT_DIR = Path("app/ml/artifacts")


class CorrosionModelService:
    def __init__(self):
        self.model = joblib.load(ARTIFACT_DIR / "corrosion_xgb.joblib")
        with open(ARTIFACT_DIR / "model_metadata.json", "r") as f:
            self.metadata = json.load(f)

        self.feature_columns = self.metadata["feature_columns"]
        self.decision_threshold = self.metadata["decision_threshold"]

    def predict_from_history(self, history_df: pd.DataFrame) -> dict:
        df = clean_df(history_df)
        df = add_lag_features(df)
        df = df.dropna(subset=self.feature_columns)

        if df.empty:
            raise ValueError("Not enough history to compute lag features.")

        latest = df.iloc[[-1]][self.feature_columns]
        prob = float(self.model.predict_proba(latest)[:, 1][0])
        pred = int(prob > self.decision_threshold)

        return {
            "corrosion_risk_score": prob,
            "corrosion_prediction": pred,
            "threshold_used": self.decision_threshold,
            "model_version": "xgb_v1"
        }