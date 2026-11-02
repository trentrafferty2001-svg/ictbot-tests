import datetime as dt
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from quantlab import config  # noqa: E402
from quantlab.timeutil import NY, UTC  # noqa: E402

CONFIG = ROOT / "configs" / "ibs_nasdaq_v1.yaml"


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setenv("QUANTLAB_HOME", str(tmp_path / "home"))
    monkeypatch.setenv("QUANTLAB_RUNS", str(tmp_path / "runs"))
    for k in ("META_TOKEN", "META_ACC_ID", "QUANTLAB_DEMO_ACC_ID", "QUANTLAB_EXECUTION",
              "QUANTLAB_TELEGRAM_TOKEN", "QUANTLAB_TELEGRAM_CHAT_ID", "TWELVEDATA_API_KEY"):
        monkeypatch.delenv(k, raising=False)
    yield


@pytest.fixture
def cfg():
    return config.load(CONFIG)


def make_day_bars(day: dt.date, high, low, close, bar_minutes=5, start="09:30", end="16:00", base=None):
    """Intraday bars for one NY day whose 09:30-15:55 range is [low, high] and whose 15:55 price is close."""
    t = dt.datetime.combine(day, dt.time(*map(int, start.split(":"))), tzinfo=NY)
    stop = dt.datetime.combine(day, dt.time(*map(int, end.split(":"))), tzinfo=NY)
    dec = dt.datetime.combine(day, dt.time(15, 55), tzinfo=NY)
    rows, mid = [], base if base is not None else (high + low) / 2
    times = []
    while t < stop:
        times.append(t)
        t += dt.timedelta(minutes=bar_minutes)
    pre = [x for x in times if x < dec]
    for k, x in enumerate(times):
        if x >= dec:  # after the decision: wild prices that must be ignored
            o = h = lo = c = high * 10
        elif k == 0:
            o, h, lo, c = mid, high, mid, mid
        elif k == 1:
            o, h, lo, c = mid, mid, low, mid
        elif x == pre[-1]:
            o, h, lo, c = mid, max(mid, close), min(mid, close), close
        else:
            o = h = lo = c = mid
        rows.append({"timestamp": int(x.astimezone(UTC).timestamp() * 1000), "open": o, "high": h, "low": lo, "close": c})
    return pd.DataFrame(rows)


def synthetic_snaps(n_days=1600, seed=1, start="2015-01-02", edge=0.0):
    """Daily snapshots with random-walk prices; `edge` adds a next-day return after low-IBS days (in %)."""
    rng = np.random.default_rng(seed)
    days = pd.bdate_range(start, periods=n_days).date
    px, rows = 4000.0, []
    ibs_prev = 0.5
    for d in days:
        ret = rng.normal(0.03, 1.2) + (edge if ibs_prev < 0.2 else 0.0)
        px *= 1 + ret / 100
        rng_pct = abs(rng.normal(1.2, 0.3))
        ibs = float(rng.uniform())
        hi = px * (1 + rng_pct / 100 * (1 - ibs))
        lo = px * (1 - rng_pct / 100 * ibs)
        rows.append({"date": d, "high": hi, "low": lo, "price": px, "ibs": ibs, "bars": 78, "expected_bars": 77,
                     "coverage": 1.0, "atr14_pct": rng_pct})
        ibs_prev = ibs
    return pd.DataFrame(rows).set_index("date")


@pytest.fixture
def snaps():
    return synthetic_snaps()
