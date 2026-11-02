"""`backtest`: enforce pre-registration, evaluate, write the immutable run record + report."""
import datetime as dt
import json
from pathlib import Path

from . import backtest, report
from .config import Config, git_registration
from .data import load_bars_csv
from .ibs import daily_snapshots
from .paths import REPO_ROOT
from .records import check_id_hash, file_sha256, trial_number, write_record
from .stats import multiple_testing_summary


class NotRegistered(RuntimeError):
    pass


def preflight(cfg: Config, dry_run: bool) -> dict:
    reg = git_registration(cfg)
    problems = []
    if cfg["status"] != "registered":
        problems.append(f"config status is {cfg['status']!r}, not 'registered'")
    if not reg["clean"]:
        problems.append("config is not committed, or has uncommitted changes")
    if problems and not dry_run:
        raise NotRegistered("refusing to run: " + "; ".join(problems) +
                            ". Commit the config with status: registered first (or use --dry-run, which is never recorded).")
    check_id_hash(cfg.id, cfg.sha256)
    return {**reg, "problems": problems}


def run(cfg: Config, data_path=None, dry_run=False, snaps=None) -> dict:
    reg = preflight(cfg, dry_run)
    tf = cfg["timeframe"]
    data_path = Path(data_path or (REPO_ROOT / cfg["market"]["backtest_data_file"]))
    skipped = []
    if snaps is None:
        bars = load_bars_csv(data_path)
        snaps, skipped = daily_snapshots(bars, tf["session_open"], tf["decision_time"],
                                         int(tf.get("backtest_bar_minutes", 1)), float(tf["min_bar_coverage"]))
        data_sha = file_sha256(data_path)
    else:
        data_sha = "in-memory"
    if snaps.empty:
        raise ValueError("no usable daily snapshots in the data")
    ev = backtest.evaluate(snaps, cfg.data)
    hv = backtest.historical_verdict(ev, cfg.data)
    rv = backtest.real_money_verdict(hv["verdict"], None)
    n_trials = trial_number(cfg["multiple_testing"]["prior_trials"], cfg.sha256)
    mt = multiple_testing_summary(ev["periods"]["out_of_sample"]["strategy"].get("t_stat", float("nan")),
                                  n_trials, float(cfg["multiple_testing"]["alpha"]))
    results = {k: {kk: vv for kk, vv in v.items() if kk != "_trades"} for k, v in ev["periods"].items()}
    record = {
        "config_id": cfg.id, "config_path": str(cfg.path.relative_to(REPO_ROOT)) if str(cfg.path).startswith(str(REPO_ROOT)) else str(cfg.path),
        "config_sha256": cfg.sha256, "config": cfg.data, "git": reg,
        "preregistered": not reg["problems"],
        "data_source": cfg["market"].get("backtest_signal_and_price"), "data_file": str(data_path),
        "data_sha256": data_sha, "data_from": str(snaps.index.min()), "data_to": str(snaps.index.max()),
        "skipped_days": len(skipped),
        "trial_number": n_trials, "multiple_testing": mt,
        "results": results, "checks": hv["checks"],
        "historical_verdict": hv["verdict"], "real_money_verdict": rv["verdict"], "real_money_reason": rv["reason"],
    }
    record["run_at_utc"] = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    md = render(record, ev, cfg)
    if dry_run:
        record["dry_run"] = True
        return {"record": record, "report": md, "path": None, "trades": ev}
    path = write_record(record, md)
    return {"record": record, "report": md, "path": path, "trades": ev}


def render(rec: dict, ev: dict, cfg: Config) -> str:
    P = ev["periods"]
    return report.render({
        "config_id": rec["config_id"], "config_path": rec["config_path"], "config_sha256": rec["config_sha256"],
        "config_first_commit": rec["git"].get("first_commit") or "not committed",
        "config_first_commit_date": rec["git"].get("first_commit_date") or "—",
        "preregistered": "yes" if rec["preregistered"] else "**NO: dry run, not evidence** (" + "; ".join(rec["git"]["problems"]) + ")",
        "data_source": rec["data_source"], "data_sha256": rec["data_sha256"],
        "data_from": rec["data_from"], "data_to": rec["data_to"], "run_at_utc": rec["run_at_utc"],
        "trial_number": rec["trial_number"],
        "historical_verdict": rec["historical_verdict"], "real_money_verdict": rec["real_money_verdict"],
        "real_money_reason": rec["real_money_reason"],
        "checks_table": report.checks_table(rec["checks"]),
        "forward_thresholds": report.forward_thresholds(cfg["pass_thresholds"]["forward"]),
        "multiple_testing": report.multiple_testing(rec["multiple_testing"]),
        "results_table": report.results_table(ev),
        "yearly_oos": report.yearly(P["out_of_sample"]["strategy"]),
        "yearly_full": report.yearly(P["full"]["strategy"]),
        "control_count": cfg["random_controls"]["count"],
        "controls": report.controls(ev),
        "costs_section": report.costs_section(ev, cfg["cost_model"]),
        "limits": report.LIMITS,
        "what_would_change": report.what_would_change(rec["historical_verdict"], cfg.data),
        "engineering_status": report.engineering_status(rec["preregistered"]),
        "profitability_status": report.profitability_status(rec["historical_verdict"], rec["real_money_verdict"]),
    })


def dumps(rec: dict) -> str:
    return json.dumps(rec, indent=2, default=str)
