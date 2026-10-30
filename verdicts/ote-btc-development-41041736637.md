# Replay verdict — ote-btc (development) · BTCUSD#

**TOO FEW TRADES** · 2015-01-01 → 2025-01-01 · real XAUUSD M1 prices

| | |
|---|---|
| Trades | 102 (20 a year) |
| Mean R after costs | -0.199 (95% range -0.391 to -0.007), t = -2.03 |
| Winners | 37.3% · profit factor 0.62 |
| Cost | median 8.0% of the stop · mean R with costs × 1.5: -0.237 |
| Random entries (same exits, 0 runs) | mean — · bot — · bot beats —% |
| Exit-model check | correlation with the replayed trades 0.98 (should be > 0.8) |

## Rules

- ❌ I1: at least 300 trades
- ❌ I2: mean R > 0 after costs with t ≥ 3
- ❌ I3: beats ≥ 95% of random-entry runs (same exits)
- ❌ I4: positive in ≥ 2/3 of years (years with ≥ 15 trades)
- ❌ I5: still positive with costs × 1.5

## By year

| Year | Trades | Mean R | t |
|---|---|---|---|
| 2017 | 2 | +0.857 | 0.50 |
| 2021 | 54 | -0.313 | -2.49 |
| 2022 | 7 | +0.415 | 1.19 |
| 2023 | 1 | -0.182 | — |
| 2024 | 38 | -0.205 | -1.26 |

## By score

| Score | Trades | Mean R |
|---|---|---|
| 0 | 102 | -0.199 |

## By session

| | Trades | Mean R | Winners |
|---|---|---|---|
| asian_mid | 2 | -0.064 | 50% |
| london | 12 | -0.320 | 33% |
| london_mid | 16 | -0.258 | 31% |
| ny | 44 | -0.238 | 34% |
| ny_close | 7 | +0.050 | 57% |
| ny_open | 5 | -0.423 | 40% |
| pre_london | 9 | +0.265 | 67% |
| sydney | 1 | -0.642 | 0% |
| tokyo | 6 | -0.283 | 17% |

## By direction

| | Trades | Mean R | Winners |
|---|---|---|---|
| buy | 38 | -0.050 | 45% |
| sell | 64 | -0.287 | 33% |

## By trade type

| | Trades | Mean R | Winners |
|---|---|---|---|
| normal | 102 | -0.199 | 37% |

Median stop: normal $884.23 · sniper — · all $884.23

## By trading cost

| | Trades | Mean R | Winners |
|---|---|---|---|
| cost under 4% of the stop | 6 | -0.120 | 50% |
| 4–6% | 14 | -0.064 | 43% |
| 6–8% | 33 | -0.144 | 39% |
| 8% or more | 49 | -0.284 | 33% |

## By stop distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| $8 or more | 102 | -0.199 | 37% |

## By stop size in 15-minute ATRs

| | Trades | Mean R | Winners |
|---|---|---|---|
| 0.8–1.2× ATR | 1 | +0.135 | 100% |
| 1.2–1.6× ATR | 16 | +0.243 | 50% |
| 1.6× ATR or more | 85 | -0.286 | 34% |

## How trades ended

- Full stop-outs (−0.85R or worse): 47%
- Scratches (within ±0.15R, mostly breakeven exits): 10%
- Wins of 1R or more: 12% · average win +0.877R · average loss -0.838R
- Losers that first went 1R or more in your favour: 11% of losers

## How far trades went

- Share of trades that were at some point this far in profit: +0.5R 51% · +1R 27% · +1.5R 13% · +2R 8% · +3R 0%
- Winners closed at +0.877R on average; at their best they were +1.213R up (median +1.061R)
- Losers that never got more than +0.3R in profit: 45%
- Targets (median): TP1 +2.203R, final target +2.342R · final target within 1.5R on 0% of trades · reached on 1%

## By final target distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| 1.25–2R | 20 | -0.416 | 35% |
| 2–3R | 71 | -0.215 | 35% |
| 3R or more | 11 | +0.302 | 55% |

## By holding time

| | Trades | Mean R | Winners |
|---|---|---|---|
| held under 1h | 15 | -0.857 | 7% |
| 1–3h | 32 | -0.525 | 25% |
| 3–7.5h | 37 | +0.164 | 49% |
| 7.5h or more (time limit) | 18 | +0.184 | 61% |

## Entries refused (cycles)

- data check: 106199
- within # min of XM's daily break: 4585
- costs #% of the stop: 3584
- first hour after the weekly open: 3098
- last hour before the weekend close: 903
- OTE setup missed: 724

Settings: {"market":"btc","symbol":"BTCUSD#","cycleMin":3,"spreadMult":1,"slippage":0,"balance":90000,"currency":"ZAR","rate":18,"spreadTable":false,"env":{"V1_STRATEGY":"ote","V1_MAX_LOTS":"0.02"}}
