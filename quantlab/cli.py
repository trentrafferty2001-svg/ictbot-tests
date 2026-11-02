"""Command line: python -m quantlab <command>.

  backtest CONFIG [--data FILE] [--dry-run]   pre-registered backtest -> runs/<id>/...
  costs [--symbol S ...] [--find] [--wait]    read-only XM cost snapshot (logged)
  ibs on|off|status|tick                      Nasdaq IBS demo mode (off by default)
  forward                                     morning forward log (QQQ 5-min), notifies on BUY/SELL
  gap                                         demo fills vs backtest assumptions + forward verdict
  verify RECORD.json                          check a run record against its .sha256
  telegram                                    answer /costs, /ibs on|off|status, /gap in Telegram
  daemon                                      15:55 NY: costs + ibs tick; 08:30 NY: forward; + telegram
"""
import argparse
import datetime as dt
import os
import sys
import time

from . import capture, config, demo, forward, gap, records, state
from .paths import REPO_ROOT
from .timeutil import NY, ny_datetime, parse_hhmm

DEFAULT_CONFIG = REPO_ROOT / "configs" / "ibs_nasdaq_v1.yaml"


def _load_dotenv():
    p = REPO_ROOT / ".env"
    if not p.exists():
        return
    for line in p.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            if v.strip():
                os.environ.setdefault(k.strip(), v.strip())


def cmd_backtest(a):
    from . import runner
    cfg = config.load(a.config)
    try:
        res = runner.run(cfg, a.data, a.dry_run)
    except runner.NotRegistered as e:
        print(e, file=sys.stderr)
        return 2
    except records.RegistrationError as e:
        print(e, file=sys.stderr)
        return 2
    print(res["report"])
    if res["path"]:
        print(f"\nRun record: {res['path']}")
    else:
        print("\nDRY RUN: nothing was written; this is not evidence.")
    return 0


def costs_text(cfg, symbols=None, find=False) -> str:
    from .metaapi import ReadOnlyMetaApi
    ro = ReadOnlyMetaApi()
    lines = []
    if find:
        lines.append("Nasdaq-like symbols on this account: " + ", ".join(capture.find_symbols(ro)))
    for obs, summ in capture.run(cfg, symbols, ro=ro):
        lines.append(capture.format_summary(obs, summ))
    return "\n\n".join(lines)


def cmd_costs(a):
    cfg = config.load(a.config)
    if a.wait:
        t = ny_datetime(dt.datetime.now(NY).date(), parse_hhmm(cfg["timeframe"]["decision_time"]))
        wait = (t - dt.datetime.now(NY)).total_seconds()
        if wait > 0:
            print(f"waiting {wait / 60:.0f} min for {t.isoformat()}")
            time.sleep(wait)
    print(costs_text(cfg, a.symbol, a.find))
    return 0


def ibs_text(cfg, action: str) -> str:
    if action in ("on", "off"):
        s = demo.set_enabled(action == "on", cfg.id, cfg.sha256)
        mode = os.environ.get("QUANTLAB_EXECUTION", "paper")
        msg = f"IBS demo mode {'ON' if s['enabled'] else 'OFF'} ({mode}; real orders: never)."
        if action == "off" and s["position"]:
            msg += " An open demo position will still be closed by the rule and logged."
        return msg
    s = demo.status()
    return (f"IBS demo mode: {'ON' if s['enabled'] else 'OFF'}; execution {os.environ.get('QUANTLAB_EXECUTION', 'paper')}; "
            f"position: {s['position'] or 'none'}; last tick {s['last_tick_date']}")


def cmd_ibs(a):
    cfg = config.load(a.config)
    if a.action == "tick":
        print(demo.tick(cfg.data, cfg.sha256))
    else:
        print(ibs_text(cfg, a.action))
    return 0


def cmd_forward(a):
    cfg = config.load(a.config)
    for r in forward.run(cfg.data, cfg.sha256):
        print(r)
    return 0


def gap_text(cfg) -> str:
    return gap.format_report(gap.report(cfg.data, cfg.sha256))


def cmd_gap(a):
    print(gap_text(config.load(a.config)))
    return 0


def cmd_verify(a):
    ok = records.verify(a.record)
    print("OK" if ok else "MISMATCH: record changed after it was written")
    return 0 if ok else 1


def handle_telegram_command(text: str, cfg) -> str:
    parts = text.strip().split()
    if not parts:
        return ""
    c = parts[0].split("@")[0].lower()
    if c == "/costs":
        return costs_text(cfg)
    if c == "/ibs":
        sub = parts[1].lower() if len(parts) > 1 else "status"
        if sub not in ("on", "off", "status"):
            return "Usage: /ibs on | /ibs off | /ibs status"
        return ibs_text(cfg, sub)
    if c == "/gap":
        return gap_text(cfg)
    return "Commands: /costs, /ibs on, /ibs off, /ibs status, /gap"


def _poll_telegram(cfg, offset, timeout=20):
    import requests
    token, chat = os.environ.get("QUANTLAB_TELEGRAM_TOKEN"), os.environ.get("QUANTLAB_TELEGRAM_CHAT_ID")
    if not token or not chat:
        time.sleep(timeout)
        return offset
    try:
        r = requests.get(f"https://api.telegram.org/bot{token}/getUpdates",
                         params={"offset": offset, "timeout": timeout}, timeout=timeout + 10).json()
    except Exception as e:  # noqa: BLE001
        print(f"telegram poll failed: {e}")
        time.sleep(5)
        return offset
    for u in r.get("result", []):
        offset = u["update_id"] + 1
        m = u.get("message") or {}
        if str(m.get("chat", {}).get("id")) != str(chat):
            continue  # only the owner's chat
        try:
            reply = handle_telegram_command(m.get("text", ""), cfg)
        except Exception as e:  # noqa: BLE001
            reply = f"Error: {type(e).__name__}: {e}"
        if reply:
            requests.post(f"https://api.telegram.org/bot{token}/sendMessage", json={"chat_id": chat, "text": reply[:4000]}, timeout=15)
    return offset


def cmd_telegram(a):
    cfg = config.load(a.config)
    offset = None
    while True:
        offset = _poll_telegram(cfg, offset)


def cmd_daemon(a):
    cfg = config.load(a.config)
    dec = parse_hhmm(cfg["timeframe"]["decision_time"])
    fwd_t = parse_hhmm(a.forward_at)
    offset = None
    while True:
        now = dt.datetime.now(NY)
        runs = state.load("daemon", {"tick": None, "forward": None})
        today = str(now.date())
        if now.weekday() < 5 and runs["tick"] != today and now >= ny_datetime(now.date(), dec) + dt.timedelta(seconds=20):
            if now <= ny_datetime(now.date(), dec) + dt.timedelta(minutes=4):  # never trade a stale signal
                for fn, label in ((lambda: capture.run(cfg.data), "costs"), (lambda: demo.tick(cfg.data, cfg.sha256), "ibs tick")):
                    try:
                        print(label, fn())
                    except Exception as e:  # noqa: BLE001
                        print(f"{label} failed: {type(e).__name__}: {e}")
            runs["tick"] = today
        if runs["forward"] != today and now >= ny_datetime(now.date(), fwd_t):
            try:
                forward.run(cfg.data, cfg.sha256)
            except Exception as e:  # noqa: BLE001
                print(f"forward failed: {type(e).__name__}: {e}")
            runs["forward"] = today
        state.save("daemon", runs)
        offset = _poll_telegram(cfg, offset, timeout=15)


def main(argv=None):
    _load_dotenv()
    p = argparse.ArgumentParser(prog="quantlab", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    b = sub.add_parser("backtest")
    b.add_argument("config")
    b.add_argument("--data")
    b.add_argument("--dry-run", action="store_true")
    b.set_defaults(fn=cmd_backtest)

    for name, fn in (("forward", cmd_forward), ("gap", cmd_gap), ("telegram", cmd_telegram)):
        x = sub.add_parser(name)
        x.add_argument("--config", default=str(DEFAULT_CONFIG))
        x.set_defaults(fn=fn)

    c = sub.add_parser("costs")
    c.add_argument("--config", default=str(DEFAULT_CONFIG))
    c.add_argument("--symbol", action="append")
    c.add_argument("--find", action="store_true", help="also list Nasdaq-like symbol names on the account")
    c.add_argument("--wait", action="store_true", help="wait until the decision time (15:55 NY) first")
    c.set_defaults(fn=cmd_costs)

    i = sub.add_parser("ibs")
    i.add_argument("action", choices=["on", "off", "status", "tick"])
    i.add_argument("--config", default=str(DEFAULT_CONFIG))
    i.set_defaults(fn=cmd_ibs)

    v = sub.add_parser("verify")
    v.add_argument("record")
    v.set_defaults(fn=cmd_verify)

    d = sub.add_parser("daemon")
    d.add_argument("--config", default=str(DEFAULT_CONFIG))
    d.add_argument("--forward-at", default="08:30")
    d.set_defaults(fn=cmd_daemon)

    a = p.parse_args(argv)
    try:
        return a.fn(a)
    except config.ConfigError as e:
        print(f"config error: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
