import math

import numpy as np
import pytest

from quantlab import stats
from quantlab.costs import CostModel, cost_share_of_gross, pct_to_r, swap_to_pct_per_night


def cm(**kw):
    d = dict(spread_points=1.5, slippage_points_per_side=0.5, commission_pct_per_side=0.0,
             swap_long_annual_pct=7.2, swap_day_count=360)
    d.update(kw)
    return CostModel(**d)


def test_cost_breakdown_one_night():
    b = cm().breakdown_pct(20000, 1)
    assert b["spread_pct"] == pytest.approx(1.5 / 20000 * 100)
    assert b["slippage_pct"] == pytest.approx(1.0 / 20000 * 100)
    assert b["swap_pct"] == pytest.approx(0.02)
    assert b["total_pct"] == pytest.approx(0.0075 + 0.005 + 0.02)


def test_weekend_swap_is_three_nights_and_stress_scales_everything():
    c = cm()
    assert c.breakdown_pct(20000, 3)["swap_pct"] == pytest.approx(0.06)
    assert c.stressed(1.5).total_pct(20000, 1) == pytest.approx(1.5 * c.total_pct(20000, 1))


def test_cost_in_r_and_share_of_gross():
    assert pct_to_r(0.05, 1.25) == pytest.approx(0.04)
    assert pct_to_r(0.05, 0) is None
    assert cost_share_of_gross(0.20, 0.05) == pytest.approx(0.25)
    assert cost_share_of_gross(-0.1, 0.05) is None


def test_swap_mode_conversions():
    pct, _ = swap_to_pct_per_night(-40.0, "SWAP_MODE_POINTS", price=20000, contract_size=1, tick_size=0.1)
    assert pct == pytest.approx(-40 * 0.1 / 20000 * 100)
    pct, _ = swap_to_pct_per_night(-4.0, "SWAP_MODE_CURRENCY_SYMBOL", price=20000, contract_size=1)
    assert pct == pytest.approx(-0.02)
    pct, _ = swap_to_pct_per_night(-7.2, "SWAP_MODE_INTEREST_CURRENT", price=20000, contract_size=1)
    assert pct == pytest.approx(-0.02)
    pct, note = swap_to_pct_per_night(-1, "SWAP_MODE_WEIRD", 1, 1)
    assert pct is None and "unhandled" in note


def test_t_stat_and_drawdown():
    x = np.array([1.0, -0.5, 2.0, 0.5])
    assert stats.t_stat(x) == pytest.approx(x.mean() / (x.std(ddof=1) / 2))
    eq = stats.equity_curve([10, -50, 20])
    assert stats.max_drawdown_pct(eq) == pytest.approx(50.0)
    assert stats.compounded_pct([10, 10]) == pytest.approx(21.0)


def test_multiple_testing_bar_rises_with_trials():
    assert stats.bonferroni_t(1) == pytest.approx(1.6449, abs=1e-3)
    assert stats.bonferroni_t(62) > 3.0
    s = stats.multiple_testing_summary(2.5, 62)
    assert s["p_bonferroni"] > 0.05 and "weaker" in s["warning"]
    assert math.isnan(stats.t_stat([1.0]))
