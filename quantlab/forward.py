"""Forward log: each morning, what the IBS rule did at 15:55 New York the evening before.

Uses QQQ 5-minute bars, independent of demo mode (it runs whether demo mode is
on or off). Keeps its own virtual position so it follows the exact rule.
Notifies only on BUY or SELL. Closed forward trades are costed with the
pre-registered cost model, converted from index points to % (see `_index_level`).
"""
import datetime as dt

from . import jsonlog, state
from .costs import CostModel
from .data import DataUnavailable, fetch_qqq_5min
from .ibs import BUY, HOLD, SELL, calendar_nights, decide, snapshot_for_day
from .notify import telegram
from .paths import logs_dir
from .timeutil import NY, is_weekday

STATE = "forward"
DEFAULT = {"position": None, "last_date": None}
# NDX / QQQ price ratio, used only when no US100Cash# quote has been logged by
# `costs` yet, to turn the cost model's index points into %. Approximation.
NDX_PER_QQQ_FALLBACK = 41.0
MAX_BACKFILL_DAYS = 10


def _index_level(qqq_price: float) -> float:
    rows = jsonlog.read_jsonl(logs_dir() / "cost_observations")
    if rows:
        r = rows[-1]
        return (float(r["bid"]) + float(r["ask"])) / 2
    return qqq_price * NDX_PER_QQQ_FALLBACK


def days_to_process(today: dt.date, last_date, forward_start: dt.date) -> list:
    start = max(forward_start, (dt.date.fromisoformat(last_date) + dt.timedelta(days=1)) if last_date else forward_start,
                today - dt.timedelta(days=MAX_BACKFILL_DAYS))
    out, d = [], start
    while d < today:
        if is_weekday(d):
            out.append(d)
        d += dt.timedelta(days=1)
    return out


def run(cfg: dict, cfg_sha: str, now: dt.datetime = None, fetch=fetch_qqq_5min, notify=telegram) -> list:
    now = now or dt.datetime.now(NY)
    tf, er, hp = cfg["timeframe"], cfg["entry_rule"], cfg["holding_period"]
    cm = CostModel.from_config(cfg["cost_model"])
    s = state.load(STATE, DEFAULT)
    fstart = dt.date.fromisoformat(cfg["sample_split"]["forward_start"])
    rows = []
    for day in days_to_process(now.date(), s["last_date"], fstart):
        row = {"date": str(day), "config_id": cfg["id"], "config_sha256": cfg_sha, "source": "QQQ 5min",
               "decision_time": tf["decision_time"]}
        try:
            snap = snapshot_for_day(fetch(day), day, tf["session_open"], tf["decision_time"],
                                    int(tf.get("forward_bar_minutes", 5)), float(tf["min_bar_coverage"]))
        except (DataUnavailable, Exception) as e:  # noqa: BLE001
            snap, row["error"] = None, f"{type(e).__name__}: {e}"
        if snap is None:
            # holiday or missing data: logged, no decision, position days unchanged
            row["action"] = "NO_DATA"
            jsonlog.append(logs_dir() / "forward_log", row)
            rows.append(row)
            s["last_date"] = str(day)
            continue
        pos = s["position"]
        held = pos["days_held"] + 1 if pos else 0
        a = decide(pos is not None, held, snap.ibs, float(er["threshold"]), int(hp["max_days"]),
                   bool(cfg["exit_rule"]["extend_if_signal_repeats"]))
        row.update(ibs=snap.ibs, high=snap.high, low=snap.low, price=snap.price, action=a,
                   days_held=held if pos else None)
        if a == BUY:
            s["position"] = {"entry_date": str(day), "entry_px": snap.price, "days_held": 0}
        elif a == HOLD and pos:
            pos["days_held"] = held
        elif a == SELL and pos:
            nights = calendar_nights(dt.date.fromisoformat(pos["entry_date"]), day)
            gross = (snap.price / pos["entry_px"] - 1) * 100
            cost = cm.total_pct(_index_level(pos["entry_px"]), nights)
            trade = {"entry_date": pos["entry_date"], "exit_date": str(day), "entry_px": pos["entry_px"],
                     "exit_px": snap.price, "nights": nights, "days_held": held, "gross_pct": gross,
                     "model_cost_pct": cost, "net_pct": gross - cost, "config_sha256": cfg_sha}
            jsonlog.append(logs_dir() / "forward_trades", trade)
            row.update(gross_pct=gross, net_pct=gross - cost)
            s["position"] = None
        jsonlog.append(logs_dir() / "forward_log", row)
        rows.append(row)
        s["last_date"] = str(day)
        if a in (BUY, SELL):
            msg = f"IBS forward log {day} 15:55 NY: {a} QQQ at {snap.price:.2f} (IBS {snap.ibs:.2f})"
            if a == SELL:
                msg += f", net {row['net_pct']:+.3f}% after modelled costs"
            notify(msg)
    state.save(STATE, s)
    return rows
