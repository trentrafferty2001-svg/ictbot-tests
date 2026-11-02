"""Demo fills vs backtest assumptions, and the forward (F1-F4) verdict."""
import statistics

from . import jsonlog
from .costs import CostModel
from .paths import logs_dir
from .stats import t_stat


def _mean(xs):
    xs = [float(x) for x in xs if x not in (None, "")]
    return statistics.mean(xs) if xs else None


def _median(xs):
    xs = [float(x) for x in xs if x not in (None, "")]
    return statistics.median(xs) if xs else None


def report(cfg: dict, cfg_sha: str, trades=None, fills=None, forward_trades=None) -> dict:
    cm = CostModel.from_config(cfg["cost_model"])
    trades = trades if trades is not None else jsonlog.read_jsonl(logs_dir() / "ibs_demo_trades")
    fills = fills if fills is not None else jsonlog.read_jsonl(logs_dir() / "ibs_fills")
    fwd = forward_trades if forward_trades is not None else jsonlog.read_jsonl(logs_dir() / "forward_trades")
    start = cfg["sample_split"]["forward_start"]
    trades = [t for t in trades if t["entry_date"] >= start]
    filled = [f for f in fills if f.get("status") == "FILLED" and f["date"] >= start]
    out = {
        "demo_trades": len(trades),
        "fills": len(filled),
        "fill_problems": sum(1 for f in fills if f.get("status") not in ("FILLED",) and f.get("date", "") >= start),
        "spread_points": {"model": cm.spread_points, "actual_mean": _mean(f.get("spread_points") for f in filled),
                          "actual_median": _median(f.get("spread_points") for f in filled)},
        "slippage_points_per_side": {"model": cm.slippage_points_per_side,
                                     "actual_mean": _mean(f.get("slippage_points") for f in filled),
                                     "actual_median": _median(f.get("slippage_points") for f in filled)},
        "swap_pct_per_night": {"model": cm.swap_long_annual_pct / cm.swap_day_count,
                               "actual_mean": _mean(t["swap_pct"] / t["nights"] for t in trades if float(t["nights"]) > 0)},
        "cost_per_trade_pct": {"model_mean": _mean(t["model_cost_pct"] for t in trades),
                               "actual_mean": _mean(t["actual_cost_pct"] for t in trades)},
        "net_per_trade_pct": {"demo_mean": _mean(t["net_pct"] for t in trades),
                              "demo_t": t_stat([float(t["net_pct"]) for t in trades]) if len(trades) > 1 else None,
                              "forward_log_mean": _mean(t["net_pct"] for t in fwd if t["entry_date"] >= start),
                              "forward_log_trades": sum(1 for t in fwd if t["entry_date"] >= start)},
        "modes": sorted({t["mode"] for t in trades}),
    }
    c = out["cost_per_trade_pct"]
    c["actual_over_model"] = (c["actual_mean"] / c["model_mean"]) if c["actual_mean"] is not None and c["model_mean"] else None
    c["gap_pct"] = (c["actual_mean"] - c["model_mean"]) if c["actual_mean"] is not None and c["model_mean"] is not None else None
    out["forward_verdict"] = forward_verdict(cfg, cfg_sha, trades, out)
    return out


def forward_verdict(cfg: dict, cfg_sha: str, trades: list, rep: dict) -> dict:
    th = cfg["pass_thresholds"]["forward"]
    checks = []
    n = len(trades)
    checks.append({"id": "F1", "rule": "closed demo trades after forward start", "threshold": f">= {th['F1_min_closed_trades']}",
                   "value": n, "pass": n >= th["F1_min_closed_trades"]})
    m = rep["net_per_trade_pct"]["demo_mean"]
    checks.append({"id": "F2", "rule": "mean net per demo trade (actual fills, swap, commission)",
                   "threshold": f"> {th['F2_min_mean_net_pct']}%", "value": m, "pass": m is not None and m > th["F2_min_mean_net_pct"]})
    r = rep["cost_per_trade_pct"]["actual_over_model"]
    checks.append({"id": "F3", "rule": "actual cost / modelled cost", "threshold": f"<= {th['F3_max_cost_ratio']}",
                   "value": r, "pass": r is not None and r <= th["F3_max_cost_ratio"]})
    hashes = {t.get("config_sha256") for t in trades} | {t.get("exit_config_sha256") for t in trades}
    hashes.discard(None)
    same = (not th["F4_config_unchanged"]) or hashes <= {cfg_sha}
    checks.append({"id": "F4", "rule": "config hash unchanged across forward trades", "threshold": "one hash",
                   "value": sorted(h[:12] for h in hashes), "pass": same})
    paper_only = rep["modes"] == ["paper"]
    if n < th["F1_min_closed_trades"]:
        v = "Insufficient evidence"
    elif all(c["pass"] for c in checks):
        v = "Pass"
    else:
        v = "Fail"
    note = "paper fills only: costs are quotes, not broker fills, so F3 is weaker evidence" if paper_only and n else ""
    return {"verdict": v, "checks": checks, "note": note}


def format_report(rep: dict) -> str:
    def f(x, fmt="{:.4f}"):
        return "n/a" if x is None else fmt.format(x)
    s, sl, sw, c, n = (rep["spread_points"], rep["slippage_points_per_side"], rep["swap_pct_per_night"],
                       rep["cost_per_trade_pct"], rep["net_per_trade_pct"])
    fv = rep["forward_verdict"]
    lines = [
        f"Demo trades: {rep['demo_trades']} ({', '.join(rep['modes']) or 'none'}); fills: {rep['fills']}; fill problems: {rep['fill_problems']}",
        "| Item | Backtest assumption | Demo actual (mean / median) |", "|---|---|---|",
        f"| Spread (pts) | {s['model']} | {f(s['actual_mean'], '{:.2f}')} / {f(s['actual_median'], '{:.2f}')} |",
        f"| Slippage per side (pts, adverse +) | {sl['model']} | {f(sl['actual_mean'], '{:.2f}')} / {f(sl['actual_median'], '{:.2f}')} |",
        f"| Swap per night (%) | {f(sw['model'])} | {f(sw['actual_mean'])} |",
        f"| Cost per trade (%) | {f(c['model_mean'])} | {f(c['actual_mean'])} (x{f(c['actual_over_model'], '{:.2f}')}, gap {f(c['gap_pct'], '{:+.4f}')}) |",
        f"| Net per trade (%) | forward log {f(n['forward_log_mean'], '{:+.3f}')} over {n['forward_log_trades']} | demo {f(n['demo_mean'], '{:+.3f}')} (t {f(n['demo_t'], '{:.2f}')}) |",
        "",
        f"Forward verdict: {fv['verdict']}" + (f" ({fv['note']})" if fv["note"] else ""),
    ]
    for ch in fv["checks"]:
        lines.append(f"  {ch['id']} {ch['rule']}: {ch['value']} (needs {ch['threshold']}) -> {'pass' if ch['pass'] else 'no'}")
    return "\n".join(lines)
