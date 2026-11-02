# quantlab: cost capture, pre-registered backtests, Nasdaq IBS demo mode

quantlab measures. It doesn't promise anything. It keeps two tracks apart:

- **Engineering:** does the machinery work? (tests, logs, records)
- **Evidence:** does a rule survive costs, out of sample, against random entries?
  The only verdicts are **Pass**, **Fail** and **Insufficient evidence**, judged
  against thresholds written in a config *before* the run.

Python only. The JS replay in `tools/replay/` (the ICT tests) is separate and unchanged.
No ICT logic is added or tuned here.

## Commands

```bash
make install                 # pip install -r requirements.txt
make test                    # python3 -m pytest -q   (synthetic data, no network, no keys)

cp .env.example .env         # then fill in your own keys; .env is git-ignored

# Data for the backtest: Nasdaq 100 1-minute bars, 2014-11 .. 2026-10 (HistData/Dukascopy)
make data                    # = python3 tools/replay/fetch_data.py --instrument nsxusd --from 2014-11-01 --to 2026-10-31 --name ibs

# Backtest (refuses to run unless the config has status: registered, is committed and unmodified)
python3 -m quantlab backtest configs/ibs_nasdaq_v1.yaml
python3 -m quantlab backtest configs/ibs_nasdaq_v1.yaml --dry-run     # prints only; never recorded, never evidence
python3 -m quantlab verify runs/ibs-nasdaq-v1/<stamp>-<hash>.json    # tamper check

# Costs (read-only; GET requests only)
python3 -m quantlab costs --find            # also lists Nasdaq-like symbol names on the account
python3 -m quantlab costs --wait            # wait until 15:55 New York, then snapshot
python3 -m quantlab costs --symbol US100Cash# --symbol GER40Cash#

# Nasdaq IBS demo mode (off by default)
python3 -m quantlab ibs on | off | status
python3 -m quantlab ibs tick                # run once at 15:55 NY (the daemon does this for you)

# Forward log (each morning: what the rule did at 15:55 NY yesterday, QQQ 5-minute)
python3 -m quantlab forward

# Demo fills vs backtest assumptions, and the forward verdict (F1-F4)
python3 -m quantlab gap

# Everything on a schedule + Telegram commands /costs, /ibs on, /ibs off, /ibs status, /gap
python3 -m quantlab daemon                  # 15:55:20 NY: costs + ibs tick; 08:30 NY: forward
python3 -m quantlab telegram                # Telegram commands only
```

Use a **separate Telegram bot** (`QUANTLAB_TELEGRAM_TOKEN`) from the live bot: two
programs can't both read one bot's messages. Only messages from
`QUANTLAB_TELEGRAM_CHAT_ID` are answered.

## Files

| Path | What it does |
|---|---|
| `configs/ibs_nasdaq_v1.yaml` | The pre-registered Nasdaq IBS test: rule, costs, split, thresholds, controls |
| `templates/verdict_template.md` | Verdict report template (filled for every run) |
| `quantlab/config.py` | Loads and validates configs (required fields; refuses leverage > 1x, >1 position, < 1,000 controls); SHA-256; git registration check |
| `quantlab/ibs.py` | 15:55 snapshot from intraday bars, IBS, and `decide()`: the single rule used by backtest, forward log and demo |
| `quantlab/costs.py` | Cost model per trade in % and R; MT5 swap-mode conversion; share of gross edge |
| `quantlab/backtest.py` | Rule walk, metrics, 1,000 random-entry controls (matched holding), buy-and-hold, historical verdict, real-money verdict |
| `quantlab/stats.py` | t-stat, drawdown, compounding, multiple-testing (Bonferroni) summary |
| `quantlab/records.py` | Immutable run records (`open(...,'x')`, read-only, `.sha256` sidecar), `runs/INDEX.csv`, trial count, id/hash lock |
| `quantlab/runner.py` | `backtest` command: pre-registration preflight, evaluation, report, record |
| `quantlab/report.py` | Renders the verdict template |
| `quantlab/metaapi.py` | `ReadOnlyMetaApi` (GET only) and `DemoExecutor` (refuses anything but a verified demo account) |
| `quantlab/capture.py` | `costs`: spread, swap, commission, contract size, min volume, symbol names; logs observations |
| `quantlab/demo.py` | IBS demo mode: on/off switch, 15:55 tick, signal/fill/trade logs, 1x sizing |
| `quantlab/forward.py` | Morning forward log on QQQ 5-minute bars; notifies only on BUY/SELL |
| `quantlab/gap.py` | Demo fills vs backtest assumptions; forward verdict F1-F4 |
| `quantlab/data.py` | Loads minute files (fetch_data.py format); QQQ 5-minute bars from Twelve Data |
| `quantlab/cli.py` | Command line, Telegram command handler, daemon |
| `quantlab/jsonlog.py`, `state.py`, `paths.py`, `timeutil.py`, `notify.py` | Append-only CSV+JSONL logs, state files, paths, New York clock, Telegram send |
| `tests/quantlab/` | 50 tests: rule, costs, controls, verdicts, records, safety (no real orders), demo, forward, gap, capture |
| `runs/` | Run records (committed). Never edit; a changed config is a new id |
| `research/STATUS.md` | Engineering status and profitability status, kept separately |

Logs and state go to `quantlab_data/` (git-ignored; `QUANTLAB_HOME` moves it):
`logs/cost_observations`, `logs/ibs_signals`, `logs/ibs_fills`, `logs/ibs_demo_trades`,
`logs/ibs_switch`, `logs/forward_log`, `logs/forward_trades` (each as `.csv` and `.jsonl`).
These are the forward evidence, so back them up. Don't edit them.

## Cost-capture schema (`logs/cost_observations.{csv,jsonl}`, one row per symbol per snapshot)

| Field | Meaning |
|---|---|
| `logged_at_utc` | When the row was written (UTC, ISO 8601) |
| `symbol` | Broker symbol, e.g. `US100Cash#` |
| `taken_at_ny`, `target_time_ny`, `minutes_from_target` | When the quote was read (New York) vs the 15:55 target |
| `broker_time` | Quote time reported by MetaApi |
| `bid`, `ask`, `spread_points`, `spread_pct` | Quote and spread (points and % of mid) |
| `contract_size`, `tick_size`, `min_volume`, `max_volume`, `volume_step`, `min_notional` | Symbol specification; `min_notional` = min volume × mid × contract size |
| `swap_mode`, `swap_long`, `swap_short`, `swap_rollover_3days` | Raw MT5 swap figures and the triple-swap day |
| `swap_long_pct_per_night`, `swap_short_pct_per_night`, `swap_conversion` | Swap as % of notional per night (negative = you pay) and how it was converted |
| `commission_per_lot`, `commission_deals_seen`, `commission_pct_per_side` | Mean commission per lot from this account's last 30 days of deals in the symbol (empty if none) |

Slippage is observed on fills (`logs/ibs_fills`: `quote_bid`, `quote_ask`, `spread_points`,
`intended_price`, `model_fill_price`, `fill_price`, `slippage_points` with adverse = positive).
`costs` prints cost per round trip (1 night and a 3-night weekend) in % and R,
measured vs modelled, and the share of the latest backtest's gross edge that it takes.

## Safety rules built into the code

- `ReadOnlyMetaApi` has no method that can change the account (a test checks this).
- `DemoExecutor` checks before **every** order that MetaApi reports `ACCOUNT_TRADE_MODE_DEMO`
  and that `QUANTLAB_DEMO_ACC_ID == META_ACC_ID`. There is no flag for real orders.
- Default execution is `paper`: no orders at all; fills are the quoted ask/bid.
- Volume is the largest step with notional ≤ 1× equity; if even the minimum volume needs
  more, the trade is refused and logged (`REFUSED_LEVERAGE`).
- One position, no adding, no averaging down, no grid, no martingale (`decide()` has no
  action that increases size; config validation refuses `max_positions != 1`).
- The daemon never acts on a signal more than 4 minutes after 15:55.

## Pre-registration workflow

1. Write a config. Commit it with `status: draft`. Review it.
2. Change `status: registered` and commit. **No run has happened yet.**
3. `python3 -m quantlab backtest <config>`. The record and report go to `runs/<id>/`. Commit them.
4. Any change afterwards (rule, costs, split, threshold) is a new file with a new `id`.
   The old record stays. The trial count goes up by one.
5. Real money is decided by the owner, only after a historical Pass **and** a forward Pass.
   quantlab never switches it on.
