"""`costs`: read-only snapshot of XM trading costs through MetaApi, logged with timestamps.

Pulls symbol names, contract size, min volume / step, long and short swap,
the bid/ask spread (meant to be taken at 15:55 New York) and commission per lot
from recent deals. Appends one observation per symbol to
logs/cost_observations.{csv,jsonl}, then summarises cost per trade in % and R
and the share of the backtest's gross edge that costs take.
"""
import datetime as dt
import re
import statistics

from . import jsonlog
from .costs import CostModel, cost_share_of_gross, pct_to_r, swap_to_pct_per_night
from .metaapi import ReadOnlyMetaApi
from .paths import logs_dir
from .records import read_index
from .timeutil import NY, UTC

DEFAULT_PATTERN = r"(US100|USTEC|NAS|NDX)"
OBS = "cost_observations"


def find_symbols(ro: ReadOnlyMetaApi, pattern=DEFAULT_PATTERN) -> list:
    syms = ro.symbols()
    names = [s if isinstance(s, str) else s.get("symbol") for s in syms]
    rx = re.compile(pattern, re.I)
    return sorted(n for n in names if n and rx.search(n))


def commission_per_lot(ro: ReadOnlyMetaApi, symbol: str, days: int = 30):
    """Mean |commission| per lot from this account's deals in `symbol` (None if none)."""
    end = dt.datetime.now(UTC)
    start = end - dt.timedelta(days=days)
    try:
        deals = ro.deals_by_time(start.strftime("%Y-%m-%dT%H:%M:%S.000Z"), end.strftime("%Y-%m-%dT%H:%M:%S.000Z"))
    except Exception:  # noqa: BLE001 - commission is optional information
        return None, 0
    per = [abs(float(d.get("commission") or 0)) / float(d["volume"])
           for d in deals if d.get("symbol") == symbol and float(d.get("volume") or 0) > 0]
    return (statistics.mean(per) if per else None), len(per)


def observe(ro: ReadOnlyMetaApi, symbol: str, target="15:55", now=None) -> dict:
    now = now or dt.datetime.now(NY)
    spec, px = ro.specification(symbol), ro.price(symbol)
    bid, ask = float(px["bid"]), float(px["ask"])
    mid = (bid + ask) / 2
    tick = float(spec.get("tickSize") or spec.get("point") or 0) or None
    cs = float(spec.get("contractSize") or 0) or None
    sl, sl_note = swap_to_pct_per_night(spec.get("swapLong"), spec.get("swapMode"), mid, cs, tick)
    ss, _ = swap_to_pct_per_night(spec.get("swapShort"), spec.get("swapMode"), mid, cs, tick)
    comm, n_comm = commission_per_lot(ro, symbol)
    th, tm = (int(x) for x in target.split(":"))
    tgt = now.replace(hour=th, minute=tm, second=0, microsecond=0)
    return {
        "symbol": symbol,
        "taken_at_ny": now.isoformat(timespec="seconds"),
        "target_time_ny": target,
        "minutes_from_target": round((now - tgt).total_seconds() / 60, 1),
        "broker_time": px.get("time") or px.get("brokerTime"),
        "bid": bid, "ask": ask, "spread_points": ask - bid, "spread_pct": (ask - bid) / mid * 100,
        "contract_size": cs, "tick_size": tick,
        "min_volume": spec.get("minVolume"), "max_volume": spec.get("maxVolume"), "volume_step": spec.get("volumeStep"),
        "swap_mode": spec.get("swapMode"), "swap_long": spec.get("swapLong"), "swap_short": spec.get("swapShort"),
        "swap_rollover_3days": spec.get("swapRollover3Days"),
        "swap_long_pct_per_night": sl, "swap_short_pct_per_night": ss, "swap_conversion": sl_note,
        "commission_per_lot": comm, "commission_deals_seen": n_comm,
        "commission_pct_per_side": (comm / (mid * cs) * 100) if comm is not None and cs else None,
        "min_notional": (float(spec.get("minVolume") or 0) * mid * cs) if cs else None,
    }


def slippage_observations() -> list:
    """Adverse slippage per fill (points) from the IBS demo fill log."""
    out = []
    for r in jsonlog.read_jsonl(logs_dir() / "ibs_fills"):
        v = r.get("slippage_points")
        if v not in (None, ""):
            out.append(float(v))
    return out


def latest_gross_edge(config_id: str):
    """Mean gross % per trade, out-of-sample, from the latest run record of `config_id`."""
    import json
    from .paths import runs_dir
    rows = [r for r in read_index() if r["config_id"] == config_id]
    if not rows:
        return None
    rec = json.loads((runs_dir() / rows[-1]["record"]).read_text())
    return rec.get("results", {}).get("out_of_sample", {}).get("strategy", {}).get("mean_gross_pct")


def latest_r_unit_pct():
    """1R in % = mean session range / price over the last 14 forward-log days (None if < 5)."""
    rows = [r for r in jsonlog.read_jsonl(logs_dir() / "forward_log") if r.get("high") not in (None, "")]
    rows = rows[-14:]
    if len(rows) < 5:
        return None
    return statistics.mean((float(r["high"]) - float(r["low"])) / float(r["price"]) * 100 for r in rows)


def summarize(obs: dict, cfg: dict) -> dict:
    """Measured cost per round trip (1 night and a 3-night weekend hold) in % and R."""
    cm = CostModel.from_config(cfg["cost_model"])
    mid = (obs["bid"] + obs["ask"]) / 2
    slips = slippage_observations()
    slip_pts = statistics.median(slips) if slips else cm.slippage_points_per_side
    comm = obs["commission_pct_per_side"] if obs["commission_pct_per_side"] is not None else cm.commission_pct_per_side
    swap = -obs["swap_long_pct_per_night"] if obs["swap_long_pct_per_night"] is not None else None
    r_unit = latest_r_unit_pct()
    gross = latest_gross_edge(cfg["id"])
    out = {"slippage_source": f"median of {len(slips)} demo fills" if slips else "cost model (no demo fills yet)",
           "commission_source": "account deals" if obs["commission_pct_per_side"] is not None else "cost model",
           "r_unit_pct": r_unit, "gross_edge_pct": gross}
    for nights in (1, 3):
        parts = {
            "spread_pct": obs["spread_points"] / mid * 100,
            "slippage_pct": 2 * slip_pts / mid * 100,
            "commission_pct": 2 * comm,
            "swap_pct": (swap * nights) if swap is not None else None,
        }
        total = sum(v for v in parts.values() if v is not None)
        model = cm.breakdown_pct(mid, nights)
        out[f"{nights}_night"] = {
            **parts, "total_pct": total, "total_r": pct_to_r(total, r_unit), "model_total_pct": model["total_pct"],
            "measured_vs_model": total / model["total_pct"] if model["total_pct"] else None,
            "share_of_gross_edge": cost_share_of_gross(gross, total),
            "swap_missing": swap is None,
        }
    return out


def format_summary(obs: dict, s: dict) -> str:
    def f(x, fmt="{:.4f}"):
        return "n/a" if x is None else fmt.format(x)
    lines = [
        f"{obs['symbol']} at {obs['taken_at_ny']} NY ({obs['minutes_from_target']:+.0f} min from {obs['target_time_ny']})",
        f"bid {obs['bid']} ask {obs['ask']} spread {obs['spread_points']:.2f} pts ({obs['spread_pct']:.4f}%)",
        f"contract size {obs['contract_size']}, min volume {obs['min_volume']}, step {obs['volume_step']}, "
        f"min notional {f(obs['min_notional'], '{:,.0f}')}",
        f"swap long {obs['swap_long']} / short {obs['swap_short']} ({obs['swap_mode']}) = "
        f"{f(obs['swap_long_pct_per_night'])}% / {f(obs['swap_short_pct_per_night'])}% a night; "
        f"triple on {obs['swap_rollover_3days']}",
        f"commission per lot: {f(obs['commission_per_lot'], '{:.2f}')} ({obs['commission_deals_seen']} deals seen)",
    ]
    for n in (1, 3):
        x = s[f"{n}_night"]
        lines.append(
            f"round trip held {n} night(s): {f(x['total_pct'])}% = {f(x['total_r'], '{:.3f}')} R "
            f"(model {x['model_total_pct']:.4f}%, measured/model {f(x['measured_vs_model'], '{:.2f}')}x); "
            f"share of gross edge {f(x['share_of_gross_edge'], '{:.0%}')}" + (" [swap not converted]" if x["swap_missing"] else ""))
    lines.append(f"slippage: {s['slippage_source']}; commission: {s['commission_source']}; "
                 f"1R = {f(s['r_unit_pct'], '{:.3f}')}% (forward log); gross edge = {f(s['gross_edge_pct'])}% (latest run record)")
    return "\n".join(lines)


def run(cfg: dict, symbols=None, pattern=DEFAULT_PATTERN, ro=None, log=True) -> list:
    ro = ro or ReadOnlyMetaApi()
    symbols = symbols or [cfg["market"]["execution_symbol"]]
    results = []
    for sym in symbols:
        obs = observe(ro, sym, target=cfg["timeframe"]["decision_time"])
        if log:
            jsonlog.append(logs_dir() / OBS, obs)
        results.append((obs, summarize(obs, cfg)))
    return results
