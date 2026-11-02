"""Nasdaq IBS demo mode. Off by default. Never places real orders.

`ibs on` / `ibs off` flip a state file. `ibs tick` runs once at the decision
time (15:55 New York, e.g. from the daemon or a scheduler):
  1. QQQ 5-minute bars for today -> IBS snapshot -> `decide` (same rule as the backtest).
  2. Every signal is logged (logs/ibs_signals), enabled or not.
  3. If enabled, BUY/SELL is executed on US100Cash#:
       - QUANTLAB_EXECUTION=paper (default): no order; fill = ask (buy) / bid (sell) at decision.
       - QUANTLAB_EXECUTION=metaapi_demo: market order through DemoExecutor, which
         refuses unless MetaApi reports a DEMO account whose id = QUANTLAB_DEMO_ACC_ID.
  4. Fills (logs/ibs_fills) record quote, spread, intended price, fill, slippage;
     closed trades (logs/ibs_demo_trades) record swap, commission, net and the
     modelled cost for the same trade.

`ibs off` stops NEW entries. An open demo position is still closed by the rule
(otherwise it would be orphaned), and that exit is logged.
"""
import datetime as dt
import math
import os

from . import jsonlog, state
from .costs import CostModel
from .data import DataUnavailable, fetch_qqq_5min
from .ibs import BUY, HOLD, NONE, SELL, calendar_nights, decide, snapshot_for_day
from .metaapi import DemoExecutor, MetaApiError, NotConfigured, ReadOnlyMetaApi
from .notify import telegram
from .paths import logs_dir
from .timeutil import NY

STATE = "ibs_demo"
DEFAULT = {"enabled": False, "position": None, "last_tick_date": None, "enabled_config_sha256": None}


def status() -> dict:
    return state.load(STATE, DEFAULT)


def set_enabled(on: bool, cfg_id: str, cfg_sha: str) -> dict:
    s = status()
    s["enabled"] = bool(on)
    if on:
        s["enabled_config_id"], s["enabled_config_sha256"] = cfg_id, cfg_sha
    state.save(STATE, s)
    jsonlog.append(logs_dir() / "ibs_switch", {"enabled": bool(on), "config_id": cfg_id, "config_sha256": cfg_sha,
                                               "open_position": bool(s["position"])})
    return s


def size_volume(equity: float, price: float, contract_size: float, min_vol: float, step: float, leverage: float = 1.0):
    """Largest volume with notional <= leverage x equity. None if even min volume exceeds it."""
    if not (equity > 0 and price > 0 and contract_size > 0 and step > 0):
        return None
    raw = equity * leverage / (price * contract_size)
    vol = math.floor(raw / step + 1e-9) * step
    vol = round(vol, 8)
    return vol if vol >= min_vol else None


def _execution_mode() -> str:
    m = os.environ.get("QUANTLAB_EXECUTION", "paper")
    return m if m in ("paper", "metaapi_demo") else "paper"


def tick(cfg: dict, cfg_sha: str, now: dt.datetime = None, fetch=fetch_qqq_5min, ro=None, executor=None,
         notify=telegram, paper_equity: float = None) -> dict:
    now = now or dt.datetime.now(NY)
    today = now.date()
    s = status()
    if today.weekday() >= 5:
        return {"skipped": "weekend"}
    if s.get("last_tick_date") == str(today):
        return {"skipped": "already ran today"}
    tf, er, hp = cfg["timeframe"], cfg["entry_rule"], cfg["holding_period"]
    sig = {"date": str(today), "config_id": cfg["id"], "config_sha256": cfg_sha, "enabled": s["enabled"],
           "decision_time": tf["decision_time"], "signal_source": "QQQ 5min"}
    try:
        bars = fetch(today)
        snap = snapshot_for_day(bars, today, tf["session_open"], tf["decision_time"],
                                int(tf.get("forward_bar_minutes", 5)), float(tf["min_bar_coverage"]))
    except (DataUnavailable, Exception) as e:  # noqa: BLE001 - logged, never traded on
        snap, sig["data_error"] = None, f"{type(e).__name__}: {e}"
    pos = s.get("position")
    days_held = (pos["days_held"] + 1) if pos else 0
    if snap is None:
        sig.update(action="NO_DATA")
        jsonlog.append(logs_dir() / "ibs_signals", sig)
        # Like the backtest, a day without a usable snapshot (holiday, data gap) is
        # not a trading day for the rule: days_held is not advanced.
        s["last_tick_date"] = str(today)
        state.save(STATE, s)
        return sig
    action = decide(pos is not None, days_held, snap.ibs, float(er["threshold"]), int(hp["max_days"]),
                    bool(cfg["exit_rule"]["extend_if_signal_repeats"]))
    if action == BUY and not s["enabled"]:
        executed = "not executed (demo mode off)"
    else:
        executed = action
    sig.update(ibs=snap.ibs, high=snap.high, low=snap.low, price=snap.price, bars=snap.bars,
               action=action, executed=executed, days_held=days_held if pos else None)
    jsonlog.append(logs_dir() / "ibs_signals", sig)

    result = dict(sig)
    if executed == BUY:
        result["fill"] = _enter(cfg, cfg_sha, s, today, snap, ro, executor, notify, paper_equity)
    elif action == SELL and pos:
        result["fill"] = _exit(cfg, cfg_sha, s, today, snap, ro, executor, notify)
    elif action == HOLD and pos:
        pos["days_held"] = days_held
    s["last_tick_date"] = str(today)
    state.save(STATE, s)
    return result


def _quote(ro, sym):
    q = ro.price(sym)
    bid, ask = float(q["bid"]), float(q["ask"])
    return bid, ask, (bid + ask) / 2


def _enter(cfg, cfg_sha, s, today, snap, ro, executor, notify, paper_equity):
    sym, mode = cfg["market"]["execution_symbol"], _execution_mode()
    cm = CostModel.from_config(cfg["cost_model"])
    row = {"date": str(today), "side": "BUY", "mode": mode, "symbol": sym, "config_sha256": cfg_sha,
           "signal_price_qqq": snap.price, "ibs": snap.ibs}
    try:
        ro = ro or ReadOnlyMetaApi()
        spec = ro.specification(sym)
        bid, ask, mid = _quote(ro, sym)
    except (NotConfigured, MetaApiError, Exception) as e:  # noqa: BLE001
        row.update(status="NO_QUOTE", error=f"{type(e).__name__}: {e}")
        jsonlog.append(logs_dir() / "ibs_fills", row)
        notify(f"IBS demo BUY signal {today} (IBS {snap.ibs:.2f}) but no {sym} quote: {row['error']}. Nothing filled.")
        return row
    cs, step, minv = float(spec.get("contractSize") or 1), float(spec.get("volumeStep") or 0.01), float(spec.get("minVolume") or 0.01)
    model_fill = mid + cm.spread_points / 2 + cm.slippage_points_per_side
    row.update(quote_bid=bid, quote_ask=ask, quote_mid=mid, spread_points=ask - bid, intended_price=mid,
               model_fill_price=model_fill, contract_size=cs)
    try:
        if mode == "metaapi_demo":
            ex = executor or DemoExecutor(ro)
            info = ex.verify_demo()
            equity = float(info.get("equity") or info.get("balance") or 0)
        else:
            equity = float(paper_equity or os.environ.get("QUANTLAB_PAPER_EQUITY") or 10000)
        vol = size_volume(equity, ask, cs, minv, step, float(cfg["position"]["leverage"]))
        if vol is None:
            row.update(status="REFUSED_LEVERAGE", equity=equity,
                       error=f"min volume {minv} x {ask} x {cs} exceeds 1x equity {equity:.0f}")
            jsonlog.append(logs_dir() / "ibs_fills", row)
            notify(f"IBS demo BUY {today}: refused, {row['error']}.")
            return row
        if mode == "metaapi_demo":
            res = ex.buy(sym, vol)
            pid = res.get("positionId") or res.get("orderId")
            fill = _open_price(ro, pid) or ask
            row.update(position_id=pid, broker_response=res.get("stringCode"))
        else:
            pid, fill = None, ask
        row.update(status="FILLED", volume=vol, equity=equity, fill_price=fill,
                   slippage_points=fill - ask, notional=fill * vol * cs)
    except (MetaApiError, Exception) as e:  # noqa: BLE001
        row.update(status="ERROR", error=f"{type(e).__name__}: {e}")
        jsonlog.append(logs_dir() / "ibs_fills", row)
        notify(f"IBS demo BUY {today} failed: {row['error']}")
        return row
    jsonlog.append(logs_dir() / "ibs_fills", row)
    s["position"] = {"entry_date": str(today), "entry_fill": fill, "entry_mid": mid, "entry_spread": ask - bid,
                     "entry_slippage": fill - ask, "volume": vol, "contract_size": cs, "position_id": pid,
                     "mode": mode, "days_held": 0, "config_sha256": cfg_sha}
    notify(f"IBS demo BUY {sym} {today} ({mode}): IBS {snap.ibs:.2f}, fill {fill} (ask {ask}, spread {ask - bid:.2f}), vol {vol}")
    return row


def _open_price(ro, pid):
    if not pid:
        return None
    try:
        for p in ro.positions():
            if str(p.get("id")) == str(pid):
                return float(p.get("openPrice"))
    except Exception:  # noqa: BLE001
        return None
    return None


def _exit(cfg, cfg_sha, s, today, snap, ro, executor, notify):
    sym, pos = cfg["market"]["execution_symbol"], s["position"]
    cm = CostModel.from_config(cfg["cost_model"])
    row = {"date": str(today), "side": "SELL", "mode": pos["mode"], "symbol": sym, "config_sha256": cfg_sha,
           "signal_price_qqq": snap.price, "ibs": snap.ibs, "position_id": pos.get("position_id")}
    try:
        ro = ro or ReadOnlyMetaApi()
        bid, ask, mid = _quote(ro, sym)
        row.update(quote_bid=bid, quote_ask=ask, quote_mid=mid, spread_points=ask - bid, intended_price=mid,
                   model_fill_price=mid - cm.spread_points / 2 - cm.slippage_points_per_side)
        swap_money = comm_money = None
        if pos["mode"] == "metaapi_demo":
            ex = executor or DemoExecutor(ro)
            ex.close(pos["position_id"])
            deals = ro.deals_by_position(pos["position_id"])
            outs = [d for d in deals if d.get("entryType") == "DEAL_ENTRY_OUT"]
            fill = float(outs[-1]["price"]) if outs else bid
            swap_money = sum(float(d.get("swap") or 0) for d in deals)
            comm_money = sum(float(d.get("commission") or 0) for d in deals)
        else:
            fill = bid
    except (NotConfigured, MetaApiError, Exception) as e:  # noqa: BLE001
        row.update(status="ERROR", error=f"{type(e).__name__}: {e}")
        jsonlog.append(logs_dir() / "ibs_fills", row)
        notify(f"IBS demo SELL {today} failed: {row['error']}. Position kept; will retry next tick.")
        return row
    row.update(status="FILLED", fill_price=fill, slippage_points=bid - fill)
    jsonlog.append(logs_dir() / "ibs_fills", row)

    entry = dt.date.fromisoformat(pos["entry_date"])
    nights = calendar_nights(entry, today)
    notional = pos["entry_fill"] * pos["volume"] * pos["contract_size"]
    if swap_money is None:  # paper: swap and commission from the cost model, labelled as such
        swap_pct, comm_pct, src = nights * cm.swap_long_annual_pct / cm.swap_day_count, 2 * cm.commission_pct_per_side, "modelled"
    else:
        swap_pct, comm_pct, src = -swap_money / notional * 100, -comm_money / notional * 100, "broker deals"
    price_ret = (fill / pos["entry_fill"] - 1) * 100
    net = price_ret - swap_pct - comm_pct
    mid_ret = (mid / pos["entry_mid"] - 1) * 100
    trade = {
        "entry_date": pos["entry_date"], "exit_date": str(today), "mode": pos["mode"], "symbol": sym,
        "config_sha256": pos.get("config_sha256"), "exit_config_sha256": cfg_sha,
        "days_held": pos["days_held"] + 1, "nights": nights, "volume": pos["volume"],
        "entry_mid": pos["entry_mid"], "entry_fill": pos["entry_fill"], "exit_mid": mid, "exit_fill": fill,
        "entry_spread_points": pos["entry_spread"], "exit_spread_points": ask - bid,
        "entry_slippage_points": pos["entry_slippage"], "exit_slippage_points": bid - fill,
        "swap_pct": swap_pct, "commission_pct": comm_pct, "swap_commission_source": src,
        "mid_to_mid_pct": mid_ret, "net_pct": net, "actual_cost_pct": mid_ret - net,
        "model_cost_pct": cm.total_pct(pos["entry_mid"], nights),
    }
    jsonlog.append(logs_dir() / "ibs_demo_trades", trade)
    s["position"] = None
    notify(f"IBS demo SELL {sym} {today} ({pos['mode']}): fill {fill}, net {net:+.3f}% "
           f"(actual cost {trade['actual_cost_pct']:.3f}% vs model {trade['model_cost_pct']:.3f}%)")
    return row


__all__ = ["status", "set_enabled", "tick", "size_volume", "BUY", "SELL", "HOLD", "NONE"]
