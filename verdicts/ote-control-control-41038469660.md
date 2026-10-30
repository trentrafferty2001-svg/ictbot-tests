# Replay verdict — ote-control (control)

**PASS** · 2019-01-01 → 2024-01-01 · synthetic control data

| | |
|---|---|
| Trades | 298 (149 a year) |
| Mean R after costs | -0.055 (95% range -0.200 to +0.091), t = -0.74 |
| Winners | 36.9% · profit factor 0.91 |
| Cost | median 7.1% of the stop · mean R with costs × 1.5: -0.090 |
| Random entries (same exits, 1000 runs) | mean -0.040 · bot -0.060 · bot beats 38.9% |
| Exit-model check | correlation with the replayed trades 1.00 (should be > 0.8) |

## Rules

- ✅ C1: no "edge" on random data (t < 2)
- ✅ C2: random-entry percentile not extreme (5–95)

## By year

| Year | Trades | Mean R | t |
|---|---|---|---|
| 2019 | 150 | -0.075 | -0.71 |
| 2023 | 148 | -0.034 | -0.32 |

## By score

| Score | Trades | Mean R |
|---|---|---|
| 0 | 298 | -0.055 |

## By session

| | Trades | Mean R | Winners |
|---|---|---|---|
| asian_mid | 2 | -0.155 | 50% |
| london | 58 | -0.250 | 26% |
| london_mid | 88 | +0.030 | 35% |
| ny | 84 | -0.002 | 48% |
| ny_close | 20 | -0.034 | 50% |
| ny_open | 27 | +0.011 | 30% |
| pre_london | 14 | -0.071 | 29% |
| sydney | 1 | -1.000 | 0% |
| tokyo | 4 | -0.407 | 25% |

## By direction

| | Trades | Mean R | Winners |
|---|---|---|---|
| buy | 160 | +0.054 | 43% |
| sell | 138 | -0.180 | 30% |

## By trade type

| | Trades | Mean R | Winners |
|---|---|---|---|
| normal | 298 | -0.055 | 37% |

Median stop: normal $4.44 · sniper — · all $4.44

## By trading cost

| | Trades | Mean R | Winners |
|---|---|---|---|
| cost under 4% of the stop | 11 | +0.293 | 64% |
| 4–6% | 74 | +0.143 | 49% |
| 6–8% | 111 | -0.026 | 38% |
| 8% or more | 102 | -0.266 | 25% |

## By stop distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| $3–5 | 197 | -0.150 | 30% |
| $5–8 | 94 | +0.123 | 48% |
| $8 or more | 7 | +0.245 | 86% |

## By stop size in 15-minute ATRs

| | Trades | Mean R | Winners |
|---|---|---|---|
| 0.8–1.2× ATR | 40 | +0.064 | 33% |
| 1.2–1.6× ATR | 108 | -0.211 | 29% |
| 1.6× ATR or more | 150 | +0.026 | 44% |

## How trades ended

- Full stop-outs (−0.85R or worse): 56%
- Scratches (within ±0.15R, mostly breakeven exits): 4%
- Wins of 1R or more: 23% · average win +1.439R · average loss -0.929R
- Losers that first went 1R or more in your favour: 19% of losers

## How far trades went

- Share of trades that were at some point this far in profit: +0.5R 53% · +1R 40% · +1.5R 27% · +2R 20% · +3R 2%
- Winners closed at +1.439R on average; at their best they were +1.813R up (median +1.918R)
- Losers that never got more than +0.3R in profit: 61%
- Targets (median): TP1 +2.277R, final target +3.147R · final target within 1.5R on 0% of trades · reached on 0%

## By final target distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| 3R or more | 298 | -0.055 | 37% |

## By holding time

| | Trades | Mean R | Winners |
|---|---|---|---|
| held under 1h | 76 | -0.868 | 8% |
| 1–3h | 101 | -0.164 | 30% |
| 3–7.5h | 101 | +0.482 | 56% |
| 7.5h or more (time limit) | 20 | +0.879 | 85% |

## Entries refused (cycles)

- within # min of XM's daily break: 272
- costs #% of the stop: 127
- last hour before the weekend close: 124
- first hour after the weekly open: 60
- OTE setup missed: 36
- the stop beyond the move's start: 35

Settings: {"cycleMin":3,"spreadMult":1,"slippage":0,"balance":90000,"currency":"ZAR","rate":18,"spreadTable":false,"env":{"V1_STRATEGY":"ote","V1_MAX_LOTS":"0.02"}}
