import pytest

from test_safety_demo import FakeSession
from quantlab import capture, cli, jsonlog
from quantlab.metaapi import ReadOnlyMetaApi
from quantlab.paths import logs_dir


def test_costs_snapshot_is_logged_and_read_only(cfg):
    s = FakeSession(bid=20000.0, ask=20001.2)
    ro = ReadOnlyMetaApi("t", "ACC", session=s)
    assert capture.find_symbols(ro) == ["US100Cash#"]
    [(obs, summ)] = capture.run(cfg.data, ro=ro)
    assert s.posts == []
    assert obs["symbol"] == "US100Cash#" and obs["spread_points"] == pytest.approx(1.2)
    assert obs["swap_long_pct_per_night"] == pytest.approx(-4.0 / 20000.6 * 100)
    assert obs["min_volume"] == 0.1 and obs["contract_size"] == 1.0
    one = summ["1_night"]
    assert one["swap_pct"] == pytest.approx(4.0 / 20000.6 * 100)
    assert one["total_pct"] == pytest.approx(one["spread_pct"] + one["slippage_pct"] + one["commission_pct"] + one["swap_pct"])
    assert summ["3_night"]["swap_pct"] == pytest.approx(3 * one["swap_pct"])
    logged = jsonlog.read_jsonl(logs_dir() / "cost_observations")
    assert len(logged) == 1 and "logged_at_utc" in logged[0]
    assert (logs_dir() / "cost_observations.csv").exists()
    assert "US100Cash#" in capture.format_summary(obs, summ)


def test_telegram_commands(cfg):
    assert "ON" in cli.handle_telegram_command("/ibs on", cfg)
    assert "OFF" in cli.handle_telegram_command("/ibs@mybot off", cfg)
    assert "Usage" in cli.handle_telegram_command("/ibs maybe", cfg)
    assert "Commands" in cli.handle_telegram_command("/buy", cfg)
    assert "Forward verdict" in cli.handle_telegram_command("/gap", cfg)
