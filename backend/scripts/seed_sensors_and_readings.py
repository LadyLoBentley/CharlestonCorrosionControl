from __future__ import annotations

import math
import random
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from sqlmodel import Session, delete


from db.database import engine, create_db_and_tables
from models.sensors import Sensors, ConnectionStatus
from models.sensor_readings import SensorReading, ISAClass


# =========================================================
# Config
# =========================================================

SEED = 42
NUM_DAYS = 30
INTERVAL_MINUTES = 15
BATCH_SIZE = 1000

# Set True if you want to wipe both tables before reseeding
RESET_TABLES = True


# =========================================================
# Profiles for seeded sensors
# =========================================================

SENSOR_PROFILES = [
    {
        "sensor_code": "OG-LAB-101",
        "name": "OnGuard Lab Sensor 101",
        "purpose": "Clean lab corrosion monitoring",
        "location": "Lab A",
        "status": ConnectionStatus.ONLINE,
        "is_active": True,
        "base_temp": 22.0,
        "base_rh": 45.0,
        "base_pressure": 0.06,
        "env": "lab",
    },
    {
        "sensor_code": "OG-LAB-102",
        "name": "OnGuard Lab Sensor 102",
        "purpose": "Secondary lab corrosion monitoring",
        "location": "Lab B",
        "status": ConnectionStatus.ONLINE,
        "is_active": True,
        "base_temp": 23.5,
        "base_rh": 49.0,
        "base_pressure": 0.07,
        "env": "lab",
    },
    {
        "sensor_code": "OG-WH-201",
        "name": "Warehouse Sensor 201",
        "purpose": "Storage area corrosion monitoring",
        "location": "Warehouse North",
        "status": ConnectionStatus.WARNING,
        "is_active": True,
        "base_temp": 26.5,
        "base_rh": 58.0,
        "base_pressure": 0.09,
        "env": "warehouse",
    },
    {
        "sensor_code": "OG-WH-202",
        "name": "Warehouse Sensor 202",
        "purpose": "Backup warehouse monitoring",
        "location": "Warehouse South",
        "status": ConnectionStatus.ONLINE,
        "is_active": True,
        "base_temp": 28.0,
        "base_rh": 63.0,
        "base_pressure": 0.10,
        "env": "warehouse",
    },
    {
        "sensor_code": "OG-PLANT-301",
        "name": "Plant Sensor 301",
        "purpose": "Industrial corrosion monitoring",
        "location": "Plant Floor 1",
        "status": ConnectionStatus.ONLINE,
        "is_active": True,
        "base_temp": 30.0,
        "base_rh": 68.0,
        "base_pressure": 0.12,
        "env": "industrial",
    },
    {
        "sensor_code": "OG-PLANT-302",
        "name": "Plant Sensor 302",
        "purpose": "High-risk production line monitoring",
        "location": "Plant Floor 2",
        "status": ConnectionStatus.WARNING,
        "is_active": True,
        "base_temp": 32.0,
        "base_rh": 74.0,
        "base_pressure": 0.14,
        "env": "industrial",
    },
    {
        "sensor_code": "OG-OUT-401",
        "name": "Outdoor Sensor 401",
        "purpose": "Exterior conditions monitoring",
        "location": "Outdoor East",
        "status": ConnectionStatus.ONLINE,
        "is_active": True,
        "base_temp": 25.0,
        "base_rh": 72.0,
        "base_pressure": 0.11,
        "env": "outdoor",
    },
    {
        "sensor_code": "OG-OUT-402",
        "name": "Outdoor Sensor 402",
        "purpose": "Backup exterior conditions monitoring",
        "location": "Outdoor West",
        "status": ConnectionStatus.OFFLINE,
        "is_active": False,
        "base_temp": 24.0,
        "base_rh": 78.0,
        "base_pressure": 0.12,
        "env": "outdoor",
    },
]


# =========================================================
# Helpers
# =========================================================

def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def steps_per_day(interval_minutes: int) -> int:
    return (24 * 60) // interval_minutes


def daily_wave(step: int, interval_minutes: int, amplitude: float = 1.0, phase: float = 0.0) -> float:
    spd = steps_per_day(interval_minutes)
    angle = (2 * math.pi * (step % spd) / spd) + phase
    return amplitude * math.sin(angle)


def weekly_wave(step: int, interval_minutes: int, amplitude: float = 1.0, phase: float = 0.0) -> float:
    spw = steps_per_day(interval_minutes) * 7
    angle = (2 * math.pi * (step % spw) / spw) + phase
    return amplitude * math.sin(angle)


def determine_isa_class(ag_incr: float, cu_incr: float, rh: float) -> ISAClass:
    score = 0

    if rh >= 80:
        score += 2
    elif rh >= 65:
        score += 1

    if ag_incr >= 250:
        score += 2
    elif ag_incr >= 120:
        score += 1

    if cu_incr >= 350:
        score += 2
    elif cu_incr >= 180:
        score += 1

    if score <= 1:
        return ISAClass.G1
    elif score == 2:
        return ISAClass.G2
    elif score in (3, 4):
        return ISAClass.G3
    return ISAClass.GX


def chunked(items, size):
    for i in range(0, len(items), size):
        yield items[i:i + size]


# =========================================================
# Sensor seeding
# =========================================================

def build_sensor_rows(start_time: datetime) -> List[Sensors]:
    sensor_rows: List[Sensors] = []

    for profile in SENSOR_PROFILES:
        last_seen = start_time + timedelta(
            days=NUM_DAYS,
            minutes=random.randint(-90, 0)
        ) if profile["is_active"] else None

        sensor = Sensors(
            sensor_code=profile["sensor_code"],
            name=profile["name"],
            purpose=profile["purpose"],
            location=profile["location"],
            status=profile["status"],
            last_seen_at=last_seen,
            is_active=profile["is_active"],
        )
        sensor_rows.append(sensor)

    return sensor_rows


# =========================================================
# Reading simulation
# =========================================================

def simulate_sensor_readings(
    sensor_code: str,
    base_temp: float,
    base_rh: float,
    base_pressure: float,
    env: str,
    start_time: datetime,
    num_days: int,
    interval_minutes: int,
    is_active: bool,
) -> List[SensorReading]:
    rows: List[SensorReading] = []

    total_steps = num_days * steps_per_day(interval_minutes)
    cu_cum = 0.0
    ag_cum = 0.0

    env_factor = {
        "lab": 0.8,
        "warehouse": 1.0,
        "industrial": 1.35,
        "outdoor": 1.2,
    }.get(env, 1.0)

    # inactive sensors get little/no recent useful data
    active_cutoff_step: Optional[int] = None
    if not is_active:
        active_cutoff_step = int(total_steps * 0.35)

    for step in range(total_steps):
        if active_cutoff_step is not None and step > active_cutoff_step:
            break

        ts = start_time + timedelta(minutes=step * interval_minutes)

        temp = (
            base_temp
            + daily_wave(step, interval_minutes, amplitude=3.5, phase=0.3)
            + weekly_wave(step, interval_minutes, amplitude=1.2, phase=1.1)
            + random.gauss(0, 0.6)
        )

        rh = (
            base_rh
            + daily_wave(step, interval_minutes, amplitude=7.5, phase=1.0)
            + weekly_wave(step, interval_minutes, amplitude=3.0, phase=0.5)
            + random.gauss(0, 2.5)
        )

        pressure = (
            base_pressure
            + daily_wave(step, interval_minutes, amplitude=0.012, phase=2.0)
            + weekly_wave(step, interval_minutes, amplitude=0.008, phase=0.8)
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
            ag_value = None
            cu_value = None
        else:
            ag_value = round(ag_incr, 3)
            cu_value = round(cu_incr, 3)

        if ag_value is not None:
            ag_cum += ag_value * (interval_minutes / (24 * 60))
        if cu_value is not None:
            cu_cum += cu_value * (interval_minutes / (24 * 60))

        isa_class = determine_isa_class(
            ag_incr=ag_incr,
            cu_incr=cu_incr,
            rh=rh,
        )

        row = SensorReading(
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
        rows.append(row)

    return rows


# =========================================================
# Main
# =========================================================

def main():
    random.seed(SEED)
    create_db_and_tables()

    start_time = datetime.now(timezone.utc) - timedelta(days=NUM_DAYS)

    sensor_rows = build_sensor_rows(start_time=start_time)

    all_readings: List[SensorReading] = []
    for profile in SENSOR_PROFILES:
        sensor_readings = simulate_sensor_readings(
            sensor_code=profile["sensor_code"],
            base_temp=profile["base_temp"],
            base_rh=profile["base_rh"],
            base_pressure=profile["base_pressure"],
            env=profile["env"],
            start_time=start_time,
            num_days=NUM_DAYS,
            interval_minutes=INTERVAL_MINUTES,
            is_active=profile["is_active"],
        )
        all_readings.extend(sensor_readings)

    with Session(engine) as session:
        if RESET_TABLES:
            session.exec(delete(SensorReading))
            session.exec(delete(Sensors))
            session.commit()
            print("Cleared existing sensor and reading data.")

        session.add_all(sensor_rows)
        session.commit()
        print(f"Inserted {len(sensor_rows)} sensors.")

        for batch in chunked(all_readings, BATCH_SIZE):
            session.add_all(batch)
            session.commit()
            print(f"Inserted batch of {len(batch)} readings...")

    print(f"Done. Seeded {len(sensor_rows)} sensors and {len(all_readings)} readings.")


if __name__ == "__main__":
    main()