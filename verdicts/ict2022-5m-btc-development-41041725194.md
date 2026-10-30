# Replay verdict — ict2022-5m-btc (development) · BTCUSD#

**TOO FEW TRADES** · 2015-01-01 → 2025-01-01 · real XAUUSD M1 prices

| | |
|---|---|
| Trades | 21 (7 a year) |
| Mean R after costs | +0.314 (95% range -0.179 to +0.807), t = 1.25 |
| Winners | 57.1% · profit factor 1.80 |
| Cost | median 9.1% of the stop · mean R with costs × 1.5: +0.274 |
| Random entries (same exits, 0 runs) | mean — · bot — · bot beats —% |
| Exit-model check | correlation with the replayed trades 0.99 (should be > 0.8) |

## Rules

- ❌ I1: at least 300 trades
- ❌ I2: mean R > 0 after costs with t ≥ 3
- ❌ I3: beats ≥ 95% of random-entry runs (same exits)
- ❌ I4: positive in ≥ 2/3 of years (years with ≥ 30 trades)
- ✅ I5: still positive with costs × 1.5

## By year

| Year | Trades | Mean R | t |
|---|---|---|---|
| 2017 | 2 | +0.861 | 2.89 |
| 2021 | 11 | +0.088 | 0.25 |
| 2024 | 8 | +0.487 | 1.07 |

## By score

| Score | Trades | Mean R |
|---|---|---|
| 0 | 21 | +0.314 |

## By session

| | Trades | Mean R | Winners |
|---|---|---|---|
| london | 4 | +0.014 | 50% |
| london_mid | 4 | -0.818 | 0% |
| ny | 5 | +0.178 | 60% |
| ny_open | 7 | +1.193 | 86% |
| pre_london | 1 | +0.563 | 100% |

## By direction

| | Trades | Mean R | Winners |
|---|---|---|---|
| buy | 15 | +0.342 | 60% |
| sell | 6 | +0.243 | 50% |

## By trade type

| | Trades | Mean R | Winners |
|---|---|---|---|
| normal | 21 | +0.314 | 57% |

Median stop: normal $771.49 · sniper — · all $771.49

## By trading cost

| | Trades | Mean R | Winners |
|---|---|---|---|
| cost under 4% of the stop | 1 | -1.000 | 0% |
| 4–6% | 3 | +1.303 | 100% |
| 6–8% | 3 | -0.103 | 33% |
| 8% or more | 14 | +0.285 | 57% |

## By stop distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| $8 or more | 21 | +0.314 | 57% |

## By stop size in 15-minute ATRs

| | Trades | Mean R | Winners |
|---|---|---|---|
| 1.2–1.6× ATR | 3 | +1.425 | 100% |
| 1.6× ATR or more | 18 | +0.129 | 50% |

## How trades ended

- Full stop-outs (−0.85R or worse): 38%
- Scratches (within ±0.15R, mostly breakeven exits): 0%
- Wins of 1R or more: 38% · average win +1.239R · average loss -0.919R
- Losers that first went 1R or more in your favour: 0% of losers

## How far trades went

- Share of trades that were at some point this far in profit: +0.5R 67% · +1R 52% · +1.5R 29% · +2R 0% · +3R 0%
- Winners closed at +1.239R on average; at their best they were +1.502R up (median +1.572R)
- Losers that never got more than +0.3R in profit: 78%
- Targets (median): TP1 +1.000R, final target +2.000R · final target within 1.5R on 0% of trades · reached on 10%

## By final target distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| 1.25–2R | 11 | +0.069 | 45% |
| 2–3R | 10 | +0.583 | 70% |

## By holding time

| | Trades | Mean R | Winners |
|---|---|---|---|
| held under 1h | 7 | +0.243 | 43% |
| 1–3h | 7 | +0.054 | 43% |
| 3–7.5h | 7 | +0.645 | 86% |

## Entries refused (cycles)

- data check: 1630
- costs #% of the stop: 710
- ICT # setup missed: 188
- the stop beyond the raid: 48
- news: 19
- price already went through the fair value gap: 8

Settings: {"market":"btc","symbol":"BTCUSD#","cycleMin":3,"spreadMult":1,"slippage":0,"balance":90000,"currency":"ZAR","rate":18,"spreadTable":false,"env":{"V1_STRATEGY":"ict2022","V1_ICT_TF":"5m","V1_MAX_LOTS":"0.02"}}
