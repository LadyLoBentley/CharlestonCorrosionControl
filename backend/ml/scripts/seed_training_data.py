from __future__ import annotations

from dataclasses import dataclass
from typing import Optional
import numpy as np
import pandas as pd


@dataclass
class OnGuardSimConfig:
    interval_minutes: int = 15
    days: int = 14

    temp_c_mean: float = 22.0
    temp_c_std: float = 0.6
    rh_mean: float = 45.0
    rh_std: float = 3.0
    pressure_iwg_mean: float = 0.08
    pressure_iwg_std: float = 0.01

    temp_daily_amp: float = 1.2
    rh_daily_amp: float = 6.0
    pressure_daily_amp: float = 0.015

    base_incr_cu_A_per_day: float = 10.0
    base_incr_ag_A_per_day: float = 6.0
    rh_sensitivity: float = 0.35
    temp_sensitivity: float = 0.08
    pressure_sensitivity: float = -12.0

    event_rate_per_day: float = 0.35
    event_duration_minutes_mean: int = 180
    event_duration_minutes_std: int = 60
    event_rh_spike_mean: float = 18.0
    event_rh_spike_std: float = 6.0
    event_pressure_drop_mean: float = 0.03
    event_pressure_drop_std: float = 0.01
    event_temp_shift_mean: float = 2.5
    event_temp_shift_std: float = 1.0

    env_noise_scale: float = 0.25
    incr_noise_scale: float = 1.5

    cumulative_cap_A: float = 4000.0
    init_invalid_hours: float = 2.0

    isa_g1_max_incr: float = 200.0
    isa_g2_max_incr: float = 1000.0
    isa_g3_max_incr: float = 2000.0


class OnGuardDataSimulator:
    def __init__(self, cfg: OnGuardSimConfig = OnGuardSimConfig(), seed: Optional[int] = 7):
        self.cfg = cfg
        self.rng = np.random.default_rng(seed)

    def _time_index(self) -> pd.DatetimeIndex:
        n = int((self.cfg.days * 24 * 60) / self.cfg.interval_minutes) + 1
        start = pd.Timestamp.now().floor("min")
        return pd.date_range(start=start, periods=n, freq=f"{self.cfg.interval_minutes}min")

    def _daily_cycle(self, t: np.ndarray, amp: float, phase: float = 0.0) -> np.ndarray:
        return amp * np.sin(2 * np.pi * t + phase)

    def _generate_events(self, idx: pd.DatetimeIndex) -> np.ndarray:
        n = len(idx)
        minutes_total = (idx[-1] - idx[0]).total_seconds() / 60.0
        days_total = minutes_total / (24 * 60)

        expected_events = self.cfg.event_rate_per_day * days_total
        num_events = self.rng.poisson(lam=max(expected_events, 0.0))

        event_mask = np.zeros(n, dtype=int)
        if num_events == 0:
            return event_mask

        starts = self.rng.integers(low=0, high=max(n - 2, 1), size=num_events)

        for s in starts:
            dur_min = int(max(
                15,
                self.rng.normal(self.cfg.event_duration_minutes_mean, self.cfg.event_duration_minutes_std)
            ))
            dur_steps = max(1, dur_min // self.cfg.interval_minutes)
            e = min(n, s + dur_steps)
            event_mask[s:e] = 1

        return event_mask

    def _isa_class(self, ag_incr: float) -> str:
        if ag_incr <= self.cfg.isa_g1_max_incr:
            return "G1"
        if ag_incr <= self.cfg.isa_g2_max_incr:
            return "G2"
        if ag_incr <= self.cfg.isa_g3_max_incr:
            return "G3"
        return "GX"

    def simulate(self, device_id: str = "OG_SIM_001") -> pd.DataFrame:
        idx = self._time_index()
        n = len(idx)

        t_days = np.arange(n) * (self.cfg.interval_minutes / (24 * 60))

        temp = (
            self.cfg.temp_c_mean
            + self._daily_cycle(t_days, self.cfg.temp_daily_amp, phase=0.1)
            + self.rng.normal(0, self.cfg.temp_c_std, size=n) * 0.4
        )
        rh = (
            self.cfg.rh_mean
            + self._daily_cycle(t_days, self.cfg.rh_daily_amp, phase=1.2)
            + self.rng.normal(0, self.cfg.rh_std, size=n) * 0.4
        )
        pressure = (
            self.cfg.pressure_iwg_mean
            + self._daily_cycle(t_days, self.cfg.pressure_daily_amp, phase=2.2)
            + self.rng.normal(0, self.cfg.pressure_iwg_std, size=n) * 0.6
        )

        event_mask = self._generate_events(idx)
        if event_mask.any():
            rh_spike = self.rng.normal(self.cfg.event_rh_spike_mean, self.cfg.event_rh_spike_std)
            p_drop = self.rng.normal(self.cfg.event_pressure_drop_mean, self.cfg.event_pressure_drop_std)
            t_shift = self.rng.normal(self.cfg.event_temp_shift_mean, self.cfg.event_temp_shift_std)

            taper = np.where(event_mask == 1, 1.0, 0.0).astype(float)
            kernel = np.array([0.25, 0.5, 0.25])
            taper = np.convolve(taper, kernel, mode="same")

            rh = rh + taper * rh_spike
            pressure = pressure - taper * max(p_drop, 0.0)
            temp = temp + taper * t_shift

        rh = np.clip(rh, 5, 100)
        pressure = np.clip(pressure, 0.0, 0.4)

        rh_term = self.cfg.rh_sensitivity * (rh - self.cfg.rh_mean)
        temp_term = self.cfg.temp_sensitivity * (temp - self.cfg.temp_c_mean)
        pressure_term = self.cfg.pressure_sensitivity * (pressure - self.cfg.pressure_iwg_mean)

        cu_incr = (
            self.cfg.base_incr_cu_A_per_day
            + rh_term
            + temp_term
            + pressure_term
            + self.rng.normal(0, self.cfg.incr_noise_scale, size=n)
        )
        ag_incr = (
            self.cfg.base_incr_ag_A_per_day
            + 0.85 * rh_term
            + 0.65 * temp_term
            + 0.90 * pressure_term
            + self.rng.normal(0, self.cfg.incr_noise_scale, size=n)
        )

        cu_incr = np.clip(cu_incr, 0.0, None)
        ag_incr = np.clip(ag_incr, 0.0, None)

        step_days = self.cfg.interval_minutes / (24 * 60)
        cu_cum = np.cumsum(cu_incr * step_days)
        ag_cum = np.cumsum(ag_incr * step_days)

        cu_cum = np.clip(cu_cum, 0.0, self.cfg.cumulative_cap_A)
        ag_cum = np.clip(ag_cum, 0.0, self.cfg.cumulative_cap_A)

        init_steps = int((self.cfg.init_invalid_hours * 60) / self.cfg.interval_minutes)
        is_valid = np.ones(n, dtype=bool)
        is_valid[:init_steps] = False

        isa_class = np.array([self._isa_class(x) for x in ag_incr], dtype=object)

        df = pd.DataFrame({
            "timestamp": idx,
            "device_id": device_id,
            "temp_c": temp,
            "rh_percent": rh,
            "pressure_iwg": pressure,
            "cu_incr_A_per_24h": cu_incr,
            "ag_incr_A_per_24h": ag_incr,
            "cu_cum_A": cu_cum,
            "ag_cum_A": ag_cum,
            "event_flag": event_mask,
            "sensor_valid": is_valid,
            "isa_class": isa_class,
        })

        invalid = ~df["sensor_valid"]
        for col in ["cu_incr_A_per_24h", "ag_incr_A_per_24h", "cu_cum_A", "ag_cum_A"]:
            df.loc[invalid, col] = np.nan

        return df


if __name__ == "__main__":
    sim = OnGuardDataSimulator(OnGuardSimConfig(days=7, interval_minutes=15), seed=42)
    data = sim.simulate(device_id="OG_LAB_101")
    print(data.head(20))
    print("\nRows:", len(data))