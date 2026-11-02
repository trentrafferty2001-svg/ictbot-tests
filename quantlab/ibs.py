"""Nasdaq IBS rule: the daily snapshot at the decision time and the position logic.

The same `decide` function is used by the backtest, the forward log and demo
mode, so all three apply the identical rule.
"""
import datetime as dt
from dataclasses import dataclass
from typing import Optional

import pandas as pd

from .timeutil import NY, parse_hhmm

BUY, SELL, HOLD, NONE = "BUY", "SELL", "HOLD", "NONE"


@dataclass
class Snapshot:
    date: dt.date
    high: float
    low: float
    price: float  # close of the last bar before the decision time
    ibs: Optional[float]
    bars: int
    expected_bars: int

    @property
    def coverage(self) -> float:
        return self.bars / self.expected_bars if self.expected_bars else 0.0


def to_ny_frame(bars: pd.DataFrame) -> pd.DataFrame:
    """bars: columns timestamp (ms UTC, bar START), open, high, low, close."""
    df = bars.copy()
    df["t"] = pd.to_datetime(df["timestamp"], unit="ms", utc=True).dt.tz_convert(NY)
    df["date"] = df["t"].dt.date
    df["tod"] = df["t"].dt.time
    return df


def daily_snapshots(bars: pd.DataFrame, session_open="09:30", decision_time="15:55",
                    bar_minutes=1, min_coverage=0.8) -> tuple:
    """One Snapshot per New York weekday. Returns (snapshots_df, skipped_days).

    Bars included: start >= session_open and start < decision_time. The price is
    the close of the last included bar, i.e. the price at decision_time.
    """
    o, d = parse_hhmm(session_open), parse_hhmm(decision_time)
    minutes = (d.hour * 60 + d.minute) - (o.hour * 60 + o.minute)
    expected = minutes // bar_minutes
    df = to_ny_frame(bars)
    df = df[(df["tod"] >= o) & (df["tod"] < d)]
    df = df[df["t"].dt.weekday < 5]
    rows, skipped = [], []
    for day, g in df.groupby("date", sort=True):
        g = g.sort_values("t")
        snap = _snap(day, g, expected)
        last_ok = g["tod"].iloc[-1] >= (dt.datetime.combine(day, d) - dt.timedelta(minutes=2 * bar_minutes)).time()
        if snap.coverage < min_coverage or not last_ok:
            skipped.append((day, "coverage" if snap.coverage < min_coverage else "no bar near decision time"))
            continue
        if snap.ibs is None:
            skipped.append((day, "zero range"))
            continue
        rows.append(snap.__dict__ | {"coverage": snap.coverage})
    out = pd.DataFrame(rows)
    if not out.empty:
        out = out.set_index("date").sort_index()
        rng = (out["high"] - out["low"]) / out["price"] * 100
        out["atr14_pct"] = rng.rolling(14, min_periods=5).mean()
    return out, skipped


def _snap(day, g: pd.DataFrame, expected: int) -> Snapshot:
    h, lo, p = float(g["high"].max()), float(g["low"].min()), float(g["close"].iloc[-1])
    ibs = None if h <= lo else (p - lo) / (h - lo)
    return Snapshot(day, h, lo, p, ibs, len(g), expected)


def snapshot_for_day(bars: pd.DataFrame, day: dt.date, session_open="09:30", decision_time="15:55",
                     bar_minutes=5, min_coverage=0.8) -> Optional[Snapshot]:
    """Snapshot for a single day (used live). None if data is insufficient."""
    snaps, _ = daily_snapshots(bars, session_open, decision_time, bar_minutes, min_coverage)
    if snaps.empty or day not in snaps.index:
        return None
    r = snaps.loc[day]
    return Snapshot(day, r["high"], r["low"], r["price"], r["ibs"], int(r["bars"]), int(r["expected_bars"]))


def decide(in_position: bool, days_held: int, ibs: Optional[float], threshold: float,
           max_days: int, extend: bool = True) -> str:
    """The IBS rule at one decision time.

    flat:  BUY if ibs < threshold, else NONE.
    long:  days_held counts trading days since entry (>= 1 at the first chance to exit).
           HOLD if extend and ibs < threshold and days_held < max_days, else SELL.
    Never adds to a position: there is no action that increases size.
    """
    if not in_position:
        return BUY if (ibs is not None and ibs < threshold) else NONE
    if days_held < 1:
        return HOLD
    if extend and ibs is not None and ibs < threshold and days_held < max_days:
        return HOLD
    return SELL


def calendar_nights(entry: dt.date, exit_: dt.date) -> int:
    return int((pd.Timestamp(exit_) - pd.Timestamp(entry)).days)

