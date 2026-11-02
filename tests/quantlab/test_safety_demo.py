import datetime as dt

import pytest

from conftest import make_day_bars
from quantlab import demo, forward, gap, jsonlog
from quantlab.metaapi import DemoExecutor, ReadOnlyMetaApi, RealAccountRefused
from quantlab.paths import logs_dir
from quantlab.timeutil import NY


class FakeResp:
    def __init__(self, j, code=200):
        self._j, self.status_code, self.text = j, code, str(j)

    def json(self):
        return self._j


class FakeSession:
    """Answers MetaApi GETs; records any POST."""

    def __init__(self, acct_type="ACCOUNT_TRADE_MODE_DEMO", bid=20000.0, ask=20001.5):
        self.posts, self.acct_type, self.bid, self.ask = [], acct_type, bid, ask

    def get(self, url, headers=None, params=None, timeout=None):
        if url.endswith("/account-information"):
            return FakeResp({"type": self.acct_type, "equity": 50000.0, "balance": 50000.0})
        if url.endswith("/specification"):
            return FakeResp({"contractSize": 1.0, "minVolume": 0.1, "volumeStep": 0.1, "tickSize": 0.1,
                             "swapLong": -4.0, "swapShort": 1.0, "swapMode": "SWAP_MODE_CURRENCY_SYMBOL",
                             "swapRollover3Days": "FRIDAY"})
        if url.endswith("/current-price"):
            return FakeResp({"bid": self.bid, "ask": self.ask})
        if url.endswith("/positions"):
            return FakeResp([{"id": "P1", "openPrice": self.ask + 0.5}])
        if "/history-deals/position/" in url:
            return FakeResp([{"entryType": "DEAL_ENTRY_IN", "price": self.ask, "swap": 0, "commission": 0},
                             {"entryType": "DEAL_ENTRY_OUT", "price": self.bid - 0.3, "swap": -4.0, "commission": 0}])
        if "/history-deals/time/" in url:
            return FakeResp([])
        if url.endswith("/symbols"):
            return FakeResp(["US100Cash#", "GER40Cash#", "GOLD#"])
        raise AssertionError(url)

    def post(self, url, headers=None, json=None, timeout=None):
        self.posts.append(json)
        return FakeResp({"numericCode": 10009, "stringCode": "TRADE_RETCODE_DONE", "positionId": "P1"})


def test_read_only_client_has_no_write_methods():
    for name in dir(ReadOnlyMetaApi):
        assert not any(w in name.lower() for w in ("post", "put", "delete", "trade", "buy", "sell", "close", "order"))


def test_demo_executor_refuses_real_account():
    s = FakeSession(acct_type="ACCOUNT_TRADE_MODE_REAL")
    ro = ReadOnlyMetaApi("t", "ACC", session=s)
    with pytest.raises(RealAccountRefused):
        DemoExecutor(ro, demo_account_id="ACC").buy("US100Cash#", 0.1)
    assert s.posts == []


def test_demo_executor_refuses_when_demo_id_not_designated():
    s = FakeSession()
    ro = ReadOnlyMetaApi("t", "ACC", session=s)
    with pytest.raises(RealAccountRefused):
        DemoExecutor(ro, demo_account_id="").buy("US100Cash#", 0.1)
    with pytest.raises(RealAccountRefused):
        DemoExecutor(ro, demo_account_id="OTHER").buy("US100Cash#", 0.1)
    assert s.posts == []


def test_size_volume_never_exceeds_1x():
    v = demo.size_volume(50000, 20000, 1.0, 0.1, 0.1)
    assert v == 2.5 and v * 20000 <= 50000
    assert demo.size_volume(1000, 20000, 1.0, 0.1, 0.1) is None  # min lot would need 2x


def _bars_fetch(ibs_by_day):
    def fetch(day):
        lo, hi = 100.0, 110.0
        return make_day_bars(day, hi, lo, lo + ibs_by_day[day] * (hi - lo))
    return fetch


def test_demo_off_by_default_logs_signal_but_no_fill(cfg):
    day = dt.date(2026, 11, 3)
    assert demo.status()["enabled"] is False
    s = FakeSession()
    r = demo.tick(cfg.data, cfg.sha256, now=dt.datetime(2026, 11, 3, 15, 55, 30, tzinfo=NY),
                  fetch=_bars_fetch({day: 0.1}), ro=ReadOnlyMetaApi("t", "ACC", session=s), notify=lambda m: None)
    assert r["action"] == "BUY" and "not executed" in r["executed"]
    assert s.posts == [] and demo.status()["position"] is None
    assert jsonlog.read_jsonl(logs_dir() / "ibs_signals")[0]["action"] == "BUY"


def test_demo_paper_round_trip_logs_fills_and_trade(cfg, monkeypatch):
    monkeypatch.setenv("QUANTLAB_EXECUTION", "paper")
    demo.set_enabled(True, cfg.id, cfg.sha256)
    d1, d2 = dt.date(2026, 11, 3), dt.date(2026, 11, 4)
    s = FakeSession()
    ro = ReadOnlyMetaApi("t", "ACC", session=s)
    fetch = _bars_fetch({d1: 0.1, d2: 0.7})
    msgs = []
    demo.tick(cfg.data, cfg.sha256, now=dt.datetime(2026, 11, 3, 15, 55, 30, tzinfo=NY), fetch=fetch, ro=ro,
              notify=msgs.append, paper_equity=50000)
    assert demo.status()["position"]["entry_fill"] == 20001.5
    demo.tick(cfg.data, cfg.sha256, now=dt.datetime(2026, 11, 4, 15, 55, 30, tzinfo=NY), fetch=fetch, ro=ro,
              notify=msgs.append)
    assert s.posts == []  # paper: no orders at all
    trades = jsonlog.read_jsonl(logs_dir() / "ibs_demo_trades")
    assert len(trades) == 1 and trades[0]["nights"] == 1
    t = trades[0]
    assert t["actual_cost_pct"] == pytest.approx(t["mid_to_mid_pct"] - t["net_pct"])
    assert len(msgs) == 2
    rep = gap.report(cfg.data, cfg.sha256)
    assert rep["demo_trades"] == 1 and rep["forward_verdict"]["verdict"] == "Insufficient evidence"
    assert "paper" in rep["forward_verdict"]["note"]


def test_demo_metaapi_mode_places_demo_orders_only(cfg, monkeypatch):
    monkeypatch.setenv("QUANTLAB_EXECUTION", "metaapi_demo")
    demo.set_enabled(True, cfg.id, cfg.sha256)
    d1, d2 = dt.date(2026, 11, 3), dt.date(2026, 11, 4)
    s = FakeSession()
    ro = ReadOnlyMetaApi("t", "ACC", session=s)
    ex = DemoExecutor(ro, demo_account_id="ACC")
    fetch = _bars_fetch({d1: 0.1, d2: 0.7})
    demo.tick(cfg.data, cfg.sha256, now=dt.datetime(2026, 11, 3, 15, 55, 30, tzinfo=NY), fetch=fetch, ro=ro,
              executor=ex, notify=lambda m: None)
    demo.tick(cfg.data, cfg.sha256, now=dt.datetime(2026, 11, 4, 15, 55, 30, tzinfo=NY), fetch=fetch, ro=ro,
              executor=ex, notify=lambda m: None)
    assert [p["actionType"] for p in s.posts] == ["ORDER_TYPE_BUY", "POSITION_CLOSE_ID"]
    assert s.posts[0]["volume"] == 2.4  # 1x of 50,000 equity at 20,001.5 -> 2.49 -> step 0.1
    t = jsonlog.read_jsonl(logs_dir() / "ibs_demo_trades")[0]
    assert t["swap_commission_source"] == "broker deals"
    assert t["entry_slippage_points"] == pytest.approx(0.5)
    assert t["exit_slippage_points"] == pytest.approx(0.3)


def test_demo_metaapi_mode_on_real_account_never_posts(cfg, monkeypatch):
    monkeypatch.setenv("QUANTLAB_EXECUTION", "metaapi_demo")
    demo.set_enabled(True, cfg.id, cfg.sha256)
    d1 = dt.date(2026, 11, 3)
    s = FakeSession(acct_type="ACCOUNT_TRADE_MODE_REAL")
    ro = ReadOnlyMetaApi("t", "ACC", session=s)
    r = demo.tick(cfg.data, cfg.sha256, now=dt.datetime(2026, 11, 3, 15, 55, 30, tzinfo=NY),
                  fetch=_bars_fetch({d1: 0.1}), ro=ro, executor=DemoExecutor(ro, "ACC"), notify=lambda m: None)
    assert s.posts == [] and r["fill"]["status"] == "ERROR" and demo.status()["position"] is None


def test_forward_log_notifies_only_on_buy_sell(cfg):
    days = {dt.date(2026, 11, 3): 0.1, dt.date(2026, 11, 4): 0.15, dt.date(2026, 11, 5): 0.6, dt.date(2026, 11, 6): 0.5}
    msgs = []
    rows = forward.run(cfg.data, cfg.sha256, now=dt.datetime(2026, 11, 9, 8, 30, tzinfo=NY),
                       fetch=_bars_fetch(days), notify=msgs.append)
    assert [r["action"] for r in rows] == ["BUY", "HOLD", "SELL", "NONE"]
    assert len(msgs) == 2 and "BUY" in msgs[0] and "SELL" in msgs[1]
    again = forward.run(cfg.data, cfg.sha256, now=dt.datetime(2026, 11, 9, 9, 0, tzinfo=NY),
                        fetch=_bars_fetch(days), notify=msgs.append)
    assert again == []  # idempotent
    ft = jsonlog.read_jsonl(logs_dir() / "forward_trades")
    assert len(ft) == 1 and ft[0]["nights"] == 2


def test_forward_ignores_days_before_forward_start(cfg):
    rows = forward.run(cfg.data, cfg.sha256, now=dt.datetime(2026, 11, 3, 8, 30, tzinfo=NY),
                       fetch=_bars_fetch({}), notify=lambda m: None)
    assert rows == []
