# Replay verdict — silverbullet-btc (development) · BTCUSD#

**TOO FEW TRADES** · 2015-01-01 → 2025-01-01 · real XAUUSD M1 prices

| | |
|---|---|
| Trades | 11 (4 a year) |
| Mean R after costs | +0.231 (95% range -0.388 to +0.849), t = 0.73 |
| Winners | 63.6% · profit factor 1.63 |
| Cost | median 8.9% of the stop · mean R with costs × 1.5: +0.189 |
| Random entries (same exits, 0 runs) | mean — · bot — · bot beats —% |
| Exit-model check | correlation with the replayed trades 1.00 (should be > 0.8) |

## Rules

- ❌ I1: at least 300 trades
- ❌ I2: mean R > 0 after costs with t ≥ 3
- ❌ I3: beats ≥ 95% of random-entry runs (same exits)
- ❌ I4: positive in ≥ 2/3 of years (years with ≥ 15 trades)
- ✅ I5: still positive with costs × 1.5

## By year

| Year | Trades | Mean R | t |
|---|---|---|---|
| 2021 | 4 | -0.141 | -0.28 |
| 2022 | 1 | +0.448 | — |
| 2024 | 6 | +0.442 | 0.91 |

## By score

| Score | Trades | Mean R |
|---|---|---|
| 0 | 11 | +0.231 |

## By session

| | Trades | Mean R | Winners |
|---|---|---|---|
| london | 2 | -1.000 | 0% |
| ny | 9 | +0.504 | 78% |

## By direction

| | Trades | Mean R | Winners |
|---|---|---|---|
| buy | 8 | +0.002 | 50% |
| sell | 3 | +0.842 | 100% |

## By trade type

| | Trades | Mean R | Winners |
|---|---|---|---|
| normal | 11 | +0.231 | 64% |

Median stop: normal $783.00 · sniper — · all $783.00

## By trading cost

| | Trades | Mean R | Winners |
|---|---|---|---|
| 4–6% | 1 | +0.527 | 100% |
| 6–8% | 4 | -0.273 | 50% |
| 8% or more | 6 | +0.517 | 67% |

## By stop distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| $8 or more | 11 | +0.231 | 64% |

## By stop size in 15-minute ATRs

| | Trades | Mean R | Winners |
|---|---|---|---|
| 0.8–1.2× ATR | 4 | -0.253 | 50% |
| 1.2–1.6× ATR | 3 | +1.265 | 100% |
| 1.6× ATR or more | 4 | -0.061 | 50% |

## How trades ended

- Full stop-outs (−0.85R or worse): 36%
- Scratches (within ±0.15R, mostly breakeven exits): 0%
- Wins of 1R or more: 27% · average win +0.934R · average loss -1.000R
- Losers that first went 1R or more in your favour: 0% of losers

## How far trades went

- Share of trades that were at some point this far in profit: +0.5R 73% · +1R 45% · +1.5R 27% · +2R 9% · +3R 0%
- Winners closed at +0.934R on average; at their best they were +1.514R up (median +1.433R)
- Losers that never got more than +0.3R in profit: 75%
- Targets (median): TP1 +1.000R, final target +2.466R · final target within 1.5R on 0% of trades · reached on 0%

## By final target distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| 1.25–2R | 2 | +0.878 | 100% |
| 2–3R | 6 | +0.069 | 50% |
| 3R or more | 3 | +0.123 | 67% |

## By holding time

| | Trades | Mean R | Winners |
|---|---|---|---|
| held under 1h | 7 | +0.179 | 57% |
| 1–3h | 2 | -0.236 | 50% |
| 3–7.5h | 2 | +0.878 | 100% |

## Entries refused (cycles)

- data check: 7297
- costs #% of the stop: 2721
- Silver Bullet setup missed: 1794
- the Asian high is only #R away with the spread: 356
- the New York morning high is only #R away with the: 252
- the Asian low is only #R away with the spread: 247

Settings: {"market":"btc","symbol":"BTCUSD#","cycleMin":3,"spreadMult":1,"slippage":0,"balance":90000,"currency":"ZAR","rate":18,"spreadTable":false,"env":{"V1_STRATEGY":"silverbullet","V1_MAX_LOTS":"0.02"}}
