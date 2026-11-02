import datetime as dt

import numpy as np
import pandas as pd
import pytest

from conftest import synthetic_snaps
from quantlab import backtest
from quantlab.costs import CostModel

ZERO = CostModel(0, 0, 0, 0)


def snaps_from(prices, ibs, start="2026-10-26"):
    days = pd.bdate_range(start, periods=len(prices)).date
    return pd.DataFrame({"price": prices, "ibs": ibs, "high": prices, "low": prices, "atr14_pct": 1.0}, index=days)


def test_rule_trades_and_costs_by_hand():
    # Mon buy (ibs .1), Tue ibs .1 -> hold, Wed sell; Thu buy, Fri none, ... Mon sell
    s = snaps_from([100, 101, 102, 100, 99, 103], [0.1, 0.1, 0.5, 0.1, 0.5, 0.5])
    c = CostModel(spread_points=1.0, slippage_points_per_side=0.0, commission_pct_per_side=0.0, swap_long_annual_pct=36.0)
    tr = backtest.run_rule(s, 0.2, 5, True, c)
    assert len(tr) == 2
    t0 = tr.iloc[0]
    assert t0["days_held"] == 2 and t0["nights"] == 2
    assert t0["gross_pct"] == pytest.approx(2.0)
    assert t0["total_pct"] == pytest.approx(1.0 + 2 * 0.1)
    t1 = tr.iloc[1]
    assert (t1["entry_date"], t1["exit_date"]) == (dt.date(2026, 10, 29), dt.date(2026, 10, 30))
    assert t1["net_pct"] == pytest.approx(-1.0 - 1.0 / 100 * 100 - 0.1)


def test_open_position_at_end_is_not_counted():
    s = snaps_from([100, 101], [0.5, 0.1])
    assert backtest.run_rule(s, 0.2, 5, True, ZERO).empty


def test_max_days_forces_exit():
    s = snaps_from([100] * 8, [0.1] * 8)
    tr = backtest.run_rule(s, 0.2, 3, True, ZERO)
    assert list(tr["days_held"]) == [3, 3]


def test_random_controls_matched_holding_non_overlapping(snaps):
    holds = [1, 2, 1, 3, 1] * 20
    out = backtest.random_controls(snaps, holds, ZERO, 50, seed=7)
    assert len(out["means"]) == 50 and not out["overlap_fallback"]
    again = backtest.random_controls(snaps, holds, ZERO, 50, seed=7)
    assert np.array_equal(out["means"], again["means"])  # deterministic


def test_random_control_placement_never_overlaps():
    # re-implement the placement check directly
    rng = np.random.default_rng(3)
    D, h = 60, np.array([3, 1, 2, 5, 1, 4])
    free = D - int((h + 1).sum())
    for _ in range(500):
        hk = rng.permutation(h)
        cuts = np.sort(rng.choice(free + len(h), size=len(h), replace=False))
        gaps = np.diff(np.concatenate([[-1], cuts])) - 1
        starts = np.cumsum(gaps + np.concatenate([[0], hk[:-1] + 1]))
        ends = starts + hk
        assert starts[0] >= 0 and ends[-1] <= D - 1
        assert np.all(starts[1:] > ends[:-1])


def test_percentile_and_buy_and_hold():
    assert backtest.percentile_of(0.5, np.array([0.0, 0.2, 0.4, 0.6, 1.0])) == 60.0
    s = snaps_from([100, 110, 99], [0.5] * 3)
    bh = backtest.buy_and_hold(s, ZERO)
    assert bh["index_return_pct"] == pytest.approx(-1.0)
    assert bh["index_max_drawdown_pct"] == pytest.approx(10.0)


def test_no_edge_data_does_not_pass(cfg):
    ev = backtest.evaluate(synthetic_snaps(n_days=3000, seed=11, edge=0.0), cfg.data)
    v = backtest.historical_verdict(ev, cfg.data)
    assert v["verdict"] in ("Fail", "Insufficient evidence")
    assert backtest.real_money_verdict(v["verdict"])["verdict"] != "Pass"


def test_large_planted_edge_can_pass_historical_but_never_real_money_alone(cfg):
    ev = backtest.evaluate(synthetic_snaps(n_days=3000, seed=5, edge=1.0), cfg.data)
    v = backtest.historical_verdict(ev, cfg.data)
    assert v["verdict"] == "Pass", v["checks"]
    rm = backtest.real_money_verdict(v["verdict"], None)
    assert rm["verdict"] == "Insufficient evidence"


def test_too_few_trades_is_insufficient(cfg):
    ev = backtest.evaluate(synthetic_snaps(n_days=1700, seed=2), cfg.data)  # OOS barely covered
    v = backtest.historical_verdict(ev, cfg.data)
    assert v["verdict"] == "Insufficient evidence"


def test_metrics_fields_present(cfg):
    ev = backtest.evaluate(synthetic_snaps(n_days=3000, seed=4), cfg.data)
    m = ev["periods"]["out_of_sample"]["strategy"]
    for k in ("trades", "win_rate_pct", "avg_win_pct", "avg_loss_pct", "expectancy_net_pct", "expectancy_net_r",
              "t_stat", "yearly", "max_drawdown_pct", "worst_trade_pct", "exposure_pct_of_days",
              "turnover_x_equity_per_year", "stressed_mean_net_pct", "cost_share_of_gross"):
        assert k in m
    assert ev["periods"]["out_of_sample"]["random_controls"]["count"] == 1000
    assert "cfd_return_pct" in ev["periods"]["out_of_sample"]["buy_and_hold"]
