# Replay verdict — control-ict5-nas (control) · US100Cash#

**PASS** · 2019-01-01 → 2024-01-01 · synthetic control data

| | |
|---|---|
| Trades | 80 (40 a year) |
| Mean R after costs | -0.011 (95% range -0.251 to +0.228), t = -0.09 |
| Winners | 46.3% · profit factor 0.98 |
| Cost | median 8.2% of the stop · mean R with costs × 1.5: -0.050 |
| Random entries (same exits, 1000 runs) | mean -0.082 · bot -0.011 · bot beats 72.0% |
| Exit-model check | correlation with the replayed trades 1.00 (should be > 0.8) |

## Rules

- ✅ C1: no "edge" on random data (t < 2)
- ✅ C2: random-entry percentile not extreme (5–95)

## By year

| Year | Trades | Mean R | t |
|---|---|---|---|
| 2019 | 47 | -0.308 | -2.05 |
| 2023 | 33 | +0.411 | 2.24 |

## By score

| Score | Trades | Mean R |
|---|---|---|
| 0 | 80 | -0.011 |

## By session

| | Trades | Mean R | Winners |
|---|---|---|---|
| london | 41 | +0.052 | 49% |
| london_mid | 7 | +0.021 | 43% |
| ny | 22 | -0.007 | 50% |
| ny_open | 10 | -0.303 | 30% |

## By direction

| | Trades | Mean R | Winners |
|---|---|---|---|
| buy | 43 | +0.251 | 58% |
| sell | 37 | -0.317 | 32% |

## By trade type

| | Trades | Mean R | Winners |
|---|---|---|---|
| normal | 80 | -0.011 | 46% |

Median stop: normal $34.79 · sniper — · all $34.79

## By trading cost

| | Trades | Mean R | Winners |
|---|---|---|---|
| cost under 4% of the stop | 2 | -1.000 | 0% |
| 4–6% | 11 | -0.030 | 45% |
| 6–8% | 21 | -0.018 | 48% |
| 8% or more | 46 | +0.039 | 48% |

## By stop distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| $8 or more | 80 | -0.011 | 46% |

## By stop size in 15-minute ATRs

| | Trades | Mean R | Winners |
|---|---|---|---|
| stop under 0.8× ATR | 1 | -1.000 | 0% |
| 0.8–1.2× ATR | 14 | -0.229 | 43% |
| 1.2–1.6× ATR | 24 | -0.052 | 42% |
| 1.6× ATR or more | 41 | +0.111 | 51% |

## How trades ended

- Full stop-outs (−0.85R or worse): 53%
- Scratches (within ±0.15R, mostly breakeven exits): 0%
- Wins of 1R or more: 25% · average win +1.130R · average loss -0.993R
- Losers that first went 1R or more in your favour: 0% of losers

## How far trades went

- Share of trades that were at some point this far in profit: +0.5R 54% · +1R 46% · +1.5R 34% · +2R 0% · +3R 0%
- Winners closed at +1.130R on average; at their best they were +1.638R up (median +1.679R)
- Losers that never got more than +0.3R in profit: 72%
- Targets (median): TP1 +1.000R, final target +2.000R · final target within 1.5R on 0% of trades · reached on 1%

## By final target distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| 1.25–2R | 33 | -0.217 | 36% |
| 2–3R | 47 | +0.133 | 53% |

## By holding time

| | Trades | Mean R | Winners |
|---|---|---|---|
| held under 1h | 28 | -0.607 | 18% |
| 1–3h | 40 | +0.219 | 57% |
| 3–7.5h | 11 | +0.729 | 82% |
| 7.5h or more (time limit) | 1 | -0.715 | 0% |

## Entries refused (cycles)

- costs #% of the stop: 188
- price already went through the fair value gap: 8
- the stop beyond the raid: 2
- news: 2
- ICT # setup missed: 1

Settings: {"market":"nas","symbol":"US100Cash#","cycleMin":3,"spreadMult":1,"slippage":0,"balance":90000,"currency":"ZAR","rate":18,"spreadTable":false,"env":{"V1_STRATEGY":"ict2022","V1_ICT_TF":"5m","V1_MAX_LOTS":"0.02"}}
