"""
update_sensor_readings.py
=========================

Live data refresh: appends NEW realistic readings to every sensor currently in
the DB (including any added through the UI), then bumps each sensor's
`last_seen_at` and sets `status=ONLINE`. Does NOT wipe existing data.

Behavior
--------
- Default mode: for every sensor, generate readings every 15 min from the
  sensor's `last_seen_at` up to "now". If `last_seen_at` is None, backfill
  24 hours so the ML model has enough history to predict.
- `--once`: append a single fresh reading per sensor (timestamp = now).
- `--minutes-back N`: backfill the last N minutes per sensor (ignored if
  `--once` is set).
- `--interval-minutes N`: reading cadence (default 15).
- `--dry-run`: simulate, print what would be inserted, write nothing.

Usage
-----
From the `backend/` directory:

    .venv/bin/python -m scripts.update_sensor_readings              # default catchup
    .venv/bin/python -m scripts.update_sensor_readings --once       # one new reading per sensor
    .venv/bin/python -m scripts.update_sensor_readings --minutes-back 360
    .venv/bin/python -m scripts.update_sensor_readings --dry-run

The DB connection is taken from `DATABASE_URL` in `backend/.env`, same as the
running API.
"""

from __future__ import annotations

# ---------------------------------------------------------------
# Path bootstrap: make the script work regardless of how it's run
# (`python -m scripts.update_sensor_readings`, `python
# scripts/update_sensor_readings.py`, PyCharm Run, etc.).
#
# Without this, running the file directly puts `backend/scripts/` on
# sys.path[0] and Python falls through to user/system site-packages
# when resolving `from db.database import ...` — which on some macOS
# setups finds an unrelated Python-2-era package literally named `db`
# in ~/Library/Python/3.9/site-packages and crashes on `print "var"`.
# ---------------------------------------------------------------
import os
import sys

_BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

import argparse
import math
import random
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from sqlmodel import Session, select

from db.database import engine, create_db_and_tables
from models.sensors import Sensors, ConnectionStatus
from models.sensor_readings import SensorReading

# Reuse the existing simulation helpers so the data shape matches the
# original seed exactly (same daily/weekly waves, ISA scoring, env factors).
# These are pure helpers — importing the module has no side effects.
from scripts.seed_sensors_and_readings import (
    clamp,
    steps_per_day,
    daily_wave,
    weekly_wave,
    determine_isa_class,
    chunked,
)


# =========================================================
# Config
# =========================================================

DEFAULT_INTERVAL_MINUTES = 15
DEFAULT_BACKFILL_HOURS_FOR_NEW = 24  # if a sensor has no last_seen_at
BATCH_SIZE = 500
SEED = None  # leave random; pass --seed for reproducibility


# =========================================================
# Heuristics for new sensors (added via UI without env metadata)
# =========================================================

ENV_KEYWORDS = (
    ("lab", ("lab", "clean room", "cleanroom")),
    ("outdoor", ("outdoor", "exterior", "yard", "rooftop", "roof", "field", "outside")),
    ("industrial", ("plant", "industrial", "production", "factory", "boiler", "press")),
    ("warehouse", ("warehouse", "storage", "depot", "stockroom")),
)

ENV_BASES = {
    "lab":        {"temp": 22.0, "rh": 45.0, "pressure": 0.06},
    "warehouse":  {"temp": 27.0, "rh": 60.0, "pressure": 0.09},
    "industrial": {"temp": 30.0, "rh": 70.0, "pressure": 0.12},
    "outdoor":    {"temp": 24.0, "rh": 75.0, "pressure": 0.11},
}

ENV_FACTORS = {"lab": 0.8, "warehouse": 1.0, "industrial": 1.35, "outdoor": 1.2}


def env_for(sensor: Sensors) -> str:
    """Best-effort guess of the sensor's environment based on its text fields."""
    text = " ".join(
        [
            sensor.sensor_code or "",
            sensor.name or "",
            sensor.purpose or "",
            sensor.location or "",
        ]
    ).lower()
    for env, words in ENV_KEYWORDS:
        if any(w in text for w in words):
            return env
    return "warehouse"  # safe default


def base_params_for(sensor: Sensors, env: str) -> tuple[float, float, float]:
    """Stable per-sensor jitter so two sensors in the same env still differ."""
    base = ENV_BASES[env]
    # Hash → [0,1) so the same sensor always gets the same jitter
    h = (abs(hash(sensor.sensor_code)) % 10000) / 10000.0
    temp = base["temp"] + (h - 0.5) * 4.0
    rh = base["rh"] + (h - 0.5) * 8.0
    pressure = base["pressure"] + (h - 0.5) * 0.02
    return temp, rh, pressure


# =========================================================
# Reading generation (same physics as seed_sensors_and_readings)
# =========================================================

def _step_reading(
    sensor_code: str,
    ts: datetime,
    step_offset: int,
    interval_minutes: int,
    base_temp: float,
    base_rh: float,
    base_pressure: float,
    env: str,
    cu_cum_state: float,
    ag_cum_state: float,
) -> tuple[SensorReading, float, float]:
    """Produce one reading and return updated cumulative state."""
    env_factor = ENV_FACTORS.get(env, 1.0)

    temp = (
        base_temp
        + daily_wave(step_offset, interval_minutes, amplitude=3.5, phase=0.3)
        + weekly_wave(step_offset, interval_minutes, amplitude=1.2, phase=1.1)
        + random.gauss(0, 0.6)
    )
    rh = (
        base_rh
        + daily_wave(step_offset, interval_minutes, amplitude=7.5, phase=1.0)
        + weekly_wave(step_offset, interval_minutes, amplitude=3.0, phase=0.5)
        + random.gauss(0, 2.5)
    )
    pressure = (
        base_pressure
        + daily_wave(step_offset, interval_minutes, amplitude=0.012, phase=2.0)
        + weekly_wave(step_offset, interval_minutes, amplitude=0.008, phase=0.8)
        + random.gauss(0, 0.004)
    )

    temp = clamp(temp, -5.0, 60.0)
    rh = clamp(rh, 10.0, 100.0)
    pressure = clamp(pressure, 0.0, 0.4)

    event_flag = 1 if random.random() < 0.015 else 0
    sensor_valid = random.random() > 0.02

    rh_risk = max(0, rh - 55) / 45.0
    pressure_risk = pressure / 0.4
    temp_risk = max(0, temp - 24) / 20.0

    base_ag = 15 + (120 * rh_risk) + (70 * pressure_risk) + (25 * temp_risk)
    base_cu = 20 + (150 * rh_risk) + (90 * pressure_risk) + (30 * temp_risk)
    if event_flag:
        base_ag *= random.uniform(1.8, 2.8)
        base_cu *= random.uniform(1.6, 2.5)
    base_ag *= env_factor
    base_cu *= env_factor

    ag_incr = max(0.0, base_ag + random.gauss(0, 10))
    cu_incr = max(0.0, base_cu + random.gauss(0, 14))

    if not sensor_valid and random.random() < 0.7:
        ag_value: Optional[float] = None
        cu_value: Optional[float] = None
    else:
        ag_value = round(ag_incr, 3)
        cu_value = round(cu_incr, 3)

    cu_cum = cu_cum_state
    ag_cum = ag_cum_state
    if ag_value is not None:
        ag_cum += ag_value * (interval_minutes / (24 * 60))
    if cu_value is not None:
        cu_cum += cu_value * (interval_minutes / (24 * 60))

    isa_class = determine_isa_class(ag_incr=ag_incr, cu_incr=cu_incr, rh=rh)

    reading = SensorReading(
        sensor_code=sensor_code,
        timestamp=ts,
        temp_c=round(temp, 3),
        rh_percent=round(rh, 3),
        pressure_iwg=round(pressure, 4),
        cu_incr_A_per_24h=cu_value,
        ag_incr_A_per_24h=ag_value,
        cu_cum_A=round(cu_cum, 3),
        ag_cum_A=round(ag_cum, 3),
        event_flag=event_flag,
        sensor_valid=sensor_valid,
        isa_class=isa_class,
    )
    return reading, cu_cum, ag_cum


# =========================================================
# Per-sensor catchup
# =========================================================

def _latest_cumulative(session: Session, sensor_code: str) -> tuple[float, float]:
    """Read the most recent cumulative cu/ag values so we keep monotonicity."""
    latest = session.exec(
        select(SensorReading)
        .where(SensorReading.sensor_code == sensor_code)
        .order_by(SensorReading.timestamp.desc())
        .limit(1)
    ).first()
    if not latest:
        return 0.0, 0.0
    return float(latest.cu_cum_A or 0.0), float(latest.ag_cum_A or 0.0)


def _planned_timestamps(
    *,
    last_seen_at: Optional[datetime],
    now: datetime,
    interval_minutes: int,
    once: bool,
    minutes_back: Optional[int],
    backfill_hours_for_new: int,
) -> List[datetime]:
    """Decide which timestamps we should generate readings for."""
    if once:
        return [now]

    interval = timedelta(minutes=interval_minutes)

    if minutes_back is not None:
        start = now - timedelta(minutes=minutes_back)
    elif last_seen_at is None:
        start = now - timedelta(hours=backfill_hours_for_new)
    else:
        # Aware/naive normalization: SQLAlchemy may return naive datetimes
        if last_seen_at.tzinfo is None:
            last_seen_at = last_seen_at.replace(tzinfo=timezone.utc)
        start = last_seen_at + interval

    if start >= now:
        # Nothing to backfill — just emit one fresh reading
        return [now]

    timestamps: List[datetime] = []
    cursor = start
    while cursor <= now:
        timestamps.append(cursor)
        cursor += interval

    # Cap absurdly large catchups to avoid hammering the DB
    MAX_PER_SENSOR = 4 * 24 * 60 // interval_minutes  # 4 days at 15-min cadence
    if len(timestamps) > MAX_PER_SENSOR:
        timestamps = timestamps[-MAX_PER_SENSOR:]

    return timestamps


# =========================================================
# Main
# =========================================================

def run(args: argparse.Namespace) -> None:
    if args.seed is not None:
        random.seed(args.seed)

    create_db_and_tables()
    now = datetime.now(timezone.utc)

    with Session(engine) as session:
        sensors = session.exec(select(Sensors)).all()
        if not sensors:
            print("No sensors in DB — add a sensor (UI or seed) first.")
            return

        total_inserted = 0
        per_sensor_summary = []

        for sensor in sensors:
            env = env_for(sensor)
            base_temp, base_rh, base_pressure = base_params_for(sensor, env)

            timestamps = _planned_timestamps(
                last_seen_at=sensor.last_seen_at,
                now=now,
                interval_minutes=args.interval_minutes,
                once=args.once,
                minutes_back=args.minutes_back,
                backfill_hours_for_new=args.backfill_hours_for_new,
            )

            if not timestamps:
                per_sensor_summary.append((sensor.sensor_code, 0, env, "skipped"))
                continue

            cu_cum, ag_cum = _latest_cumulative(session, sensor.sensor_code)

            new_readings: List[SensorReading] = []
            for i, ts in enumerate(timestamps):
                reading, cu_cum, ag_cum = _step_reading(
                    sensor_code=sensor.sensor_code,
                    ts=ts,
                    step_offset=i,
                    interval_minutes=args.interval_minutes,
                    base_temp=base_temp,
                    base_rh=base_rh,
                    base_pressure=base_pressure,
                    env=env,
                    cu_cum_state=cu_cum,
                    ag_cum_state=ag_cum,
                )
                new_readings.append(reading)

            if args.dry_run:
                per_sensor_summary.append(
                    (sensor.sensor_code, len(new_readings), env, "dry-run")
                )
                total_inserted += len(new_readings)
                continue

            for batch in chunked(new_readings, BATCH_SIZE):
                session.add_all(batch)
                session.commit()

            # Mirror the create_sensor_reading service: bump sensor metadata.
            sensor.last_seen_at = new_readings[-1].timestamp
            sensor.status = ConnectionStatus.ONLINE
            sensor.is_active = True
            sensor.updated_at = now
            session.add(sensor)
            session.commit()

            total_inserted += len(new_readings)
            per_sensor_summary.append(
                (sensor.sensor_code, len(new_readings), env, "ok")
            )

    # Pretty summary
    print()
    print(f"{'Sensor':<22} {'Env':<11} {'Inserted':>9}   Status")
    print("-" * 56)
    for code, n, env, status in per_sensor_summary:
        print(f"{code:<22} {env:<11} {n:>9}   {status}")
    print("-" * 56)
    print(f"{'TOTAL':<22} {'':<11} {total_inserted:>9}   {'(dry-run)' if args.dry_run else 'committed'}")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    p.add_argument(
        "--once",
        action="store_true",
        help="Append a single fresh reading per sensor (timestamp = now).",
    )
    p.add_argument(
        "--minutes-back",
        type=int,
        default=None,
        help="Backfill the last N minutes per sensor (ignored if --once).",
    )
    p.add_argument(
        "--interval-minutes",
        type=int,
        default=DEFAULT_INTERVAL_MINUTES,
        help=f"Reading cadence in minutes (default {DEFAULT_INTERVAL_MINUTES}).",
    )
    p.add_argument(
        "--backfill-hours-for-new",
        type=int,
        default=DEFAULT_BACKFILL_HOURS_FOR_NEW,
        help=(
            "Hours of history to backfill for sensors with no last_seen_at "
            f"(default {DEFAULT_BACKFILL_HOURS_FOR_NEW}). Helps the ML model "
            "have enough lag features."
        ),
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be inserted, write nothing.",
    )
    p.add_argument(
        "--seed",
        type=int,
        default=SEED,
        help="Random seed for reproducibility (default: random).",
    )
    return p.parse_args()


if __name__ == "__main__":
    run(parse_args())
