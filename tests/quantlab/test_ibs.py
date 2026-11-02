import datetime as dt

import pandas as pd

from conftest import make_day_bars
from quantlab.ibs import BUY, HOLD, NONE, SELL, calendar_nights, daily_snapshots, decide, snapshot_for_day


def test_snapshot_uses_bars_before_decision_time_only():
    day = dt.date(2026, 10, 28)
    bars = make_day_bars(day, high=110, low=100, close=101)
    s = snapshot_for_day(bars, day, bar_minutes=5)
    assert s.high == 110 and s.low == 100 and s.price == 101
    assert abs(s.ibs - 0.1) < 1e-12
    assert s.bars == 77  # 09:30 .. 15:50 starts


def test_one_minute_bars_and_coverage_filter():
    day = dt.date(2026, 10, 28)
    bars = make_day_bars(day, 210, 200, 209, bar_minutes=1)
    snaps, skipped = daily_snapshots(bars, bar_minutes=1)
    assert abs(snaps.loc[day, "ibs"] - 0.9) < 1e-12
    thin = bars.iloc[::3]  # one third of the bars
    snaps, skipped = daily_snapshots(thin, bar_minutes=1, min_coverage=0.8)
    assert snaps.empty and skipped[0][1] == "coverage"


def test_zero_range_day_skipped():
    day = dt.date(2026, 10, 28)
    bars = make_day_bars(day, 100, 100, 100)
    snaps, skipped = daily_snapshots(bars, bar_minutes=5)
    assert snaps.empty and skipped == [(day, "zero range")]


def test_decide_rules():
    assert decide(False, 0, 0.1, 0.2, 5) == BUY
    assert decide(False, 0, 0.2, 0.2, 5) == NONE  # strictly below
    assert decide(False, 0, None, 0.2, 5) == NONE
    assert decide(True, 1, 0.5, 0.2, 5) == SELL
    assert decide(True, 1, 0.1, 0.2, 5) == HOLD  # signal repeats -> extend
    assert decide(True, 5, 0.1, 0.2, 5) == SELL  # max days reached
    assert decide(True, 1, 0.1, 0.2, 5, extend=False) == SELL


def test_decide_never_adds_to_a_position():
    for held in range(0, 10):
        for ibs in (0.0, 0.05, 0.19, 0.5, None):
            assert decide(True, held, ibs, 0.2, 5) != BUY


def test_calendar_nights_weekend():
    assert calendar_nights(dt.date(2026, 10, 30), dt.date(2026, 11, 2)) == 3  # Fri -> Mon
    assert calendar_nights(dt.date(2026, 10, 28), dt.date(2026, 10, 29)) == 1
