"""Backtest of the IBS rule on daily snapshots, with costs, metrics and controls."""
import datetime as dt
import math

import numpy as np
import pandas as pd

from . import stats
from .costs import CostModel, cost_share_of_gross, pct_to_r
from .ibs import BUY, HOLD, SELL, calendar_nights, decide


def run_rule(snaps: pd.DataFrame, threshold: float, max_days: int, extend: bool, costs: CostModel) -> pd.DataFrame:
    """Walk the snapshots day by day with `decide`. Returns one row per closed trade.

    A position still open on the last day is not counted (no exit price).
    """
    dates = list(snaps.index)
    px = snaps["price"].to_numpy()
    ibs = snaps["ibs"].to_numpy()
    atr = snaps["atr14_pct"].to_numpy() if "atr14_pct" in snaps else np.full(len(dates), np.nan)
    trades, entry_i = [], None
    for i in range(len(dates)):
        held = 0 if entry_i is None else i - entry_i
        a = decide(entry_i is not None, held, ibs[i], threshold, max_days, extend)
        if a == BUY:
            entry_i = i
        elif a == SELL:
            trades.append(_trade(dates, px, atr, entry_i, i, costs))
            entry_i = None
        elif a == HOLD:
            pass
    return pd.DataFrame(trades)


def _trade(dates, px, atr, i, j, costs: CostModel) -> dict:
    nights = calendar_nights(dates[i], dates[j])
    gross = (px[j] / px[i] - 1) * 100
    cb = costs.breakdown_pct(px[i], nights)
    net = gross - cb["total_pct"]
    r_unit = atr[i] if atr is not None and not (isinstance(atr[i], float) and math.isnan(atr[i])) else None
    return {
        "entry_date": dates[i], "exit_date": dates[j], "entry_px": px[i], "exit_px": px[j],
        "days_held": j - i, "nights": nights, "gross_pct": gross, **cb, "net_pct": net,
        "r_unit_pct": r_unit, "net_r": pct_to_r(net, r_unit), "cost_r": pct_to_r(cb["total_pct"], r_unit),
    }


def costs_for(trades: pd.DataFrame, costs: CostModel) -> np.ndarray:
    return np.array([costs.total_pct(p, n) for p, n in zip(trades["entry_px"], trades["nights"])])


def restrict(df: pd.DataFrame, start: str, end: str, col=None) -> pd.DataFrame:
    s, e = dt.date.fromisoformat(start), dt.date.fromisoformat(end)
    if df.empty:
        return df
    key = df[col] if col else pd.Series(df.index, index=df.index)
    return df[(key >= s) & (key <= e)]


def metrics(trades: pd.DataFrame, n_days: int, years: float, stressed_net=None) -> dict:
    if trades.empty:
        return {"trades": 0}
    net, gross = trades["net_pct"].to_numpy(), trades["gross_pct"].to_numpy()
    wins, losses = net[net > 0], net[net <= 0]
    eq = stats.equity_curve(net)
    by_year = trades.assign(y=[d.year for d in trades["exit_date"]]).groupby("y")
    yearly = {int(y): {"trades": int(len(g)), "return_pct": stats.compounded_pct(g["net_pct"]),
                       "mean_net_pct": float(g["net_pct"].mean())} for y, g in by_year}
    nr = trades["net_r"].dropna()
    m = {
        "trades": int(len(trades)),
        "win_rate_pct": float(len(wins) / len(net) * 100),
        "avg_win_pct": float(wins.mean()) if len(wins) else None,
        "avg_loss_pct": float(losses.mean()) if len(losses) else None,
        "mean_gross_pct": float(gross.mean()),
        "mean_cost_pct": float(trades["total_pct"].mean()),
        "cost_breakdown_pct": {k: float(trades[k].mean()) for k in ("spread_pct", "slippage_pct", "commission_pct", "swap_pct")},
        "cost_share_of_gross": cost_share_of_gross(float(gross.mean()), float(trades["total_pct"].mean())),
        "expectancy_net_pct": float(net.mean()),
        "expectancy_net_r": float(nr.mean()) if len(nr) else None,
        "mean_cost_r": float(trades["cost_r"].dropna().mean()) if trades["cost_r"].notna().any() else None,
        "t_stat": stats.t_stat(net),
        "total_return_pct": float((eq[-1] - 1) * 100),
        "max_drawdown_pct": stats.max_drawdown_pct(eq),
        "worst_trade_pct": float(net.min()),
        "best_trade_pct": float(net.max()),
        "exposure_pct_of_days": float(trades["days_held"].sum() / n_days * 100) if n_days else None,
        "turnover_x_equity_per_year": float(2 * len(trades) / years) if years else None,
        "yearly": yearly,
    }
    if stressed_net is not None:
        m["stressed_mean_net_pct"] = float(np.mean(stressed_net))
        m["stressed_t_stat"] = stats.t_stat(stressed_net)
    return m


def random_controls(snaps: pd.DataFrame, holdings: list, costs: CostModel, count: int, seed: int) -> dict:
    """Random long entries with the strategy's holding lengths, non-overlapping, same costs.

    Each run places len(holdings) trades at uniformly random non-overlapping
    positions (in trading days) in the same period. Returns the distribution of
    per-run mean net % per trade.
    """
    rng = np.random.default_rng(seed)
    dates = list(snaps.index)
    px = snaps["price"].to_numpy()
    D, n = len(dates), len(holdings)
    if n == 0:
        return {"means": np.array([]), "overlap_fallback": False}
    h = np.asarray(holdings, dtype=int)
    free = D - int((h + 1).sum())
    overlap = free < 0
    ords = np.array([d.toordinal() for d in dates])
    means = np.empty(count)
    for k in range(count):
        hk = rng.permutation(h)
        if not overlap:
            # n+1 gaps summing to `free`, uniformly over compositions (stars and bars)
            cuts = np.sort(rng.choice(free + n, size=n, replace=False))
            gaps = np.diff(np.concatenate([[-1], cuts])) - 1
            starts = np.cumsum(gaps + np.concatenate([[0], hk[:-1] + 1]))
        else:
            starts = np.array([rng.integers(0, D - x) for x in hk])
        ends = starts + hk
        gross = (px[ends] / px[starts] - 1) * 100
        nights = ords[ends] - ords[starts]
        c = np.array([costs.total_pct(px[s], nt) for s, nt in zip(starts, nights)])
        means[k] = float((gross - c).mean())
    return {"means": means, "overlap_fallback": overlap}


def percentile_of(value: float, dist: np.ndarray) -> float:
    if len(dist) == 0:
        return float("nan")
    return float((dist < value).mean() * 100)


def buy_and_hold(snaps: pd.DataFrame, costs: CostModel) -> dict:
    """Index buy-and-hold (no financing) and CFD buy-and-hold (swap every night) at 1x."""
    if len(snaps) < 2:
        return {}
    px = snaps["price"].to_numpy()
    ords = np.array([d.toordinal() for d in snaps.index])
    daily = px[1:] / px[:-1] - 1
    nights = np.diff(ords)
    swap = nights * costs.swap_long_annual_pct / costs.swap_day_count / 100 * costs.multiplier
    eq_idx = np.cumprod(1 + daily)
    eq_cfd = np.cumprod(1 + daily - swap)
    entry_cost = costs.total_pct(px[0], 0) / 100
    eq_cfd = eq_cfd * (1 - entry_cost)
    years = (ords[-1] - ords[0]) / 365.25
    return {
        "index_return_pct": float((eq_idx[-1] - 1) * 100),
        "index_max_drawdown_pct": stats.max_drawdown_pct(eq_idx),
        "cfd_return_pct": float((eq_cfd[-1] - 1) * 100),
        "cfd_max_drawdown_pct": stats.max_drawdown_pct(eq_cfd),
        "cfd_cagr_pct": float((eq_cfd[-1] ** (1 / years) - 1) * 100) if years > 0 and eq_cfd[-1] > 0 else None,
        "exposure_pct_of_days": 100.0,
    }


def weekdays_between(start: str, end: str) -> int:
    return int(np.busday_count(dt.date.fromisoformat(start), dt.date.fromisoformat(end) + dt.timedelta(days=1)))


def evaluate(snaps: pd.DataFrame, cfg: dict) -> dict:
    """Full pre-registered evaluation. Pure function of snapshots + config."""
    er, hp, cm = cfg["entry_rule"], cfg["holding_period"], cfg["cost_model"]
    split, rc = cfg["sample_split"], cfg["random_controls"]
    base = CostModel.from_config(cm)
    stress = base.stressed(float(cm["stress_multiplier"]))
    thr, maxd, ext = float(er["threshold"]), int(hp["max_days"]), bool(cfg["exit_rule"]["extend_if_signal_repeats"])

    out = {"periods": {}}
    full_start, full_end = split["in_sample"][0], split["out_of_sample"][1]
    for name, (s, e) in {"in_sample": split["in_sample"], "out_of_sample": split["out_of_sample"],
                         "full": (full_start, full_end)}.items():
        ps = restrict(snaps, s, e)
        tr = run_rule(ps, thr, maxd, ext, base)
        n_days = len(ps)
        years = max(weekdays_between(s, e) / 261.0, 1e-9)
        stressed_net = (tr["gross_pct"].to_numpy() - costs_for(tr, stress)) if not tr.empty else None
        per = {
            "range": [s, e],
            "snapshot_days": n_days,
            "weekdays": weekdays_between(s, e),
            "day_coverage": n_days / max(weekdays_between(s, e), 1),
            "strategy": metrics(tr, n_days, years, stressed_net),
            "buy_and_hold": buy_and_hold(ps, base),
        }
        if name != "full" and not tr.empty:
            ctl = random_controls(ps, list(tr["days_held"]), base, int(rc["count"]), int(rc["seed"]))
            means = ctl["means"]
            per["random_controls"] = {
                "count": int(len(means)),
                "mean_of_means_pct": float(means.mean()),
                "p5_pct": float(np.percentile(means, 5)),
                "p95_pct": float(np.percentile(means, 95)),
                "strategy_percentile": percentile_of(per["strategy"]["expectancy_net_pct"], means),
                "overlap_fallback": ctl["overlap_fallback"],
            }
        per["_trades"] = tr
        out["periods"][name] = per
    return out


def historical_verdict(ev: dict, cfg: dict) -> dict:
    """Apply the pre-registered historical thresholds. Returns verdict + every check."""
    th = cfg["pass_thresholds"]["historical"]
    oos, full = ev["periods"]["out_of_sample"], ev["periods"]["full"]
    s, fs = oos["strategy"], full["strategy"]
    checks = []

    def chk(cid, rule, threshold, value, ok):
        checks.append({"id": cid, "rule": rule, "threshold": threshold, "value": value, "pass": bool(ok)})

    cov_ok = oos["day_coverage"] >= th["min_day_coverage"]
    chk("D0", "Out-of-sample data coverage (share of weekdays with a usable 15:55 snapshot)",
        f">= {th['min_day_coverage']}", round(oos["day_coverage"], 3), cov_ok)
    n = s.get("trades", 0)
    chk("H1", "Out-of-sample trades", f">= {th['H1_min_trades']}", n, n >= th["H1_min_trades"])
    insufficient = (not cov_ok) or n < th["H1_min_trades"]
    if n:
        mean, t = s["expectancy_net_pct"], s["t_stat"]
        chk("H2", "Out-of-sample mean net return per trade > threshold, with t-stat",
            f"> {th['H2_min_mean_net_pct']}% and t >= {th['H2_min_t']}",
            f"{mean:+.3f}%, t {t:.2f}", mean > th["H2_min_mean_net_pct"] and t >= th["H2_min_t"])
        pct = oos.get("random_controls", {}).get("strategy_percentile", float("nan"))
        chk("H3", "Beats random long entries with matched holding (percentile of 1,000 runs)",
            f">= {th['H3_min_random_percentile']}", round(pct, 1), pct >= th["H3_min_random_percentile"])
        yrs = {y: v for y, v in fs.get("yearly", {}).items() if v["trades"] >= th["H4_min_trades_per_year"]}
        share = (sum(1 for v in yrs.values() if v["return_pct"] > 0) / len(yrs)) if yrs else float("nan")
        enough_years = len(yrs) >= 3
        chk("H4", f"Share of years (full sample, >= {th['H4_min_trades_per_year']} trades) with positive net return",
            f">= {th['H4_min_positive_year_share']} over >= 3 years", f"{share:.2f} over {len(yrs)} years",
            enough_years and share >= th["H4_min_positive_year_share"])
        insufficient = insufficient or not enough_years
        sm = s.get("stressed_mean_net_pct", float("nan"))
        chk("H5", f"Out-of-sample mean net with costs x{cfg['cost_model']['stress_multiplier']}",
            f"> {th['H5_stressed_mean_net_pct_above']}%", f"{sm:+.3f}%", sm > th["H5_stressed_mean_net_pct_above"])
        dd = s["max_drawdown_pct"]
        chk("H6", "Out-of-sample max drawdown at 1x (at trade exits)", f"<= {th['H6_max_drawdown_pct']}%",
            f"{dd:.1f}%", dd <= th["H6_max_drawdown_pct"])
    if insufficient:
        verdict = "Insufficient evidence"
    elif all(c["pass"] for c in checks):
        verdict = "Pass"
    else:
        verdict = "Fail"
    return {"verdict": verdict, "checks": checks}


def real_money_verdict(historical: str, forward: dict = None) -> dict:
    """Historical Pass alone never allows real money; forward evidence is required."""
    if historical == "Fail":
        return {"verdict": "Fail", "reason": "historical test failed"}
    if historical != "Pass":
        return {"verdict": "Insufficient evidence", "reason": "historical evidence insufficient"}
    if not forward or forward.get("verdict") != "Pass":
        v = forward.get("verdict") if forward else "Insufficient evidence"
        return {"verdict": "Fail" if v == "Fail" else "Insufficient evidence",
                "reason": "forward (demo) evidence " + ("failed" if v == "Fail" else "not complete")}
    return {"verdict": "Pass", "reason": "historical and forward passed; real money still needs the owner's explicit decision"}
