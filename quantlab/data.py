"""Price data: local minute files (backtest) and QQQ 5-minute bars (forward/demo)."""
import datetime as dt
import os

import pandas as pd
import requests

from .timeutil import NY, UTC

COLUMNS = ["timestamp", "open", "high", "low", "close"]


def load_bars_csv(path) -> pd.DataFrame:
    """CSV(.gz) with header timestamp,open,high,low,close[,volume]; timestamp = bar start, ms UTC.

    This is the format tools/replay/fetch_data.py writes.
    """
    df = pd.read_csv(path)
    missing = [c for c in COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"{path}: missing columns {missing}")
    return df[COLUMNS].sort_values("timestamp").drop_duplicates("timestamp").reset_index(drop=True)


class DataUnavailable(RuntimeError):
    pass


def fetch_qqq_5min(day: dt.date, api_key: str = None, symbol: str = "QQQ", session=None) -> pd.DataFrame:
    """QQQ 5-minute bars for one New York day from Twelve Data. Bar datetimes are bar starts in NY."""
    api_key = api_key or os.environ.get("TWELVEDATA_API_KEY")
    if not api_key:
        raise DataUnavailable("TWELVEDATA_API_KEY is not set")
    s = session or requests
    r = s.get("https://api.twelvedata.com/time_series", params={
        "symbol": symbol, "interval": "5min", "timezone": "America/New_York", "order": "ASC",
        "start_date": f"{day} 09:30:00", "end_date": f"{day} 16:00:00", "outputsize": 200, "apikey": api_key,
    }, timeout=30)
    r.raise_for_status()
    j = r.json()
    if j.get("status") == "error" or "values" not in j:
        raise DataUnavailable(f"Twelve Data: {j.get('message', j)}")
    return twelvedata_to_bars(j["values"])


def twelvedata_to_bars(values: list) -> pd.DataFrame:
    rows = []
    for v in values:
        t = dt.datetime.strptime(v["datetime"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=NY)
        rows.append({"timestamp": int(t.astimezone(UTC).timestamp() * 1000), "open": float(v["open"]),
                     "high": float(v["high"]), "low": float(v["low"]), "close": float(v["close"])})
    return pd.DataFrame(rows, columns=COLUMNS)
