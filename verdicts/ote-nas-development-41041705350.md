# Replay verdict — ote-nas (development) · US100Cash#

**FAIL** · 2015-01-01 → 2025-01-01 · real XAUUSD M1 prices

| | |
|---|---|
| Trades | 638 (64 a year) |
| Mean R after costs | -0.119 (95% range -0.216 to -0.022), t = -2.41 |
| Winners | 33.1% · profit factor 0.80 |
| Cost | median 5.5% of the stop · mean R with costs × 1.5: -0.148 |
| Random entries (same exits, 1000 runs) | mean -0.074 · bot -0.123 · bot beats 20.6% |
| Exit-model check | correlation with the replayed trades 0.96 (should be > 0.8) |

## Rules

- ✅ I1: at least 300 trades
- ❌ I2: mean R > 0 after costs with t ≥ 3
- ❌ I3: beats ≥ 95% of random-entry runs (same exits)
- ❌ I4: positive in ≥ 2/3 of years (years with ≥ 15 trades)
- ❌ I5: still positive with costs × 1.5

## By year

| Year | Trades | Mean R | t |
|---|---|---|---|
| 2015 | 12 | -0.178 | -0.47 |
| 2016 | 7 | +0.138 | 0.24 |
| 2017 | 4 | -0.578 | -3.86 |
| 2018 | 49 | -0.039 | -0.21 |
| 2019 | 37 | -0.067 | -0.42 |
| 2020 | 125 | -0.088 | -0.76 |
| 2021 | 104 | -0.189 | -1.55 |
| 2022 | 124 | +0.113 | 0.89 |
| 2023 | 76 | -0.372 | -3.05 |
| 2024 | 100 | -0.235 | -1.96 |

## By score

| Score | Trades | Mean R |
|---|---|---|
| 0 | 638 | -0.119 |

## By session

| | Trades | Mean R | Winners |
|---|---|---|---|
| asian_mid | 3 | +0.233 | 33% |
| london | 42 | -0.313 | 29% |
| london_mid | 75 | -0.299 | 20% |
| ny | 348 | -0.034 | 37% |
| ny_close | 75 | -0.232 | 33% |
| ny_open | 70 | -0.172 | 26% |
| pre_london | 10 | +0.276 | 40% |
| sydney | 2 | -0.358 | 50% |
| tokyo | 13 | -0.169 | 54% |

## By direction

| | Trades | Mean R | Winners |
|---|---|---|---|
| buy | 267 | -0.098 | 34% |
| sell | 371 | -0.135 | 33% |

## By trade type

| | Trades | Mean R | Winners |
|---|---|---|---|
| normal | 638 | -0.119 | 33% |

Median stop: normal $44.75 · sniper — · all $44.75

## By trading cost

| | Trades | Mean R | Winners |
|---|---|---|---|
| cost under 4% of the stop | 189 | +0.052 | 41% |
| 4–6% | 176 | -0.122 | 32% |
| 6–8% | 140 | -0.278 | 28% |
| 8% or more | 133 | -0.193 | 28% |

## By stop distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| $8 or more | 638 | -0.119 | 33% |

## By stop size in 15-minute ATRs

| | Trades | Mean R | Winners |
|---|---|---|---|
| stop under 0.8× ATR | 6 | -0.490 | 17% |
| 0.8–1.2× ATR | 116 | +0.118 | 43% |
| 1.2–1.6× ATR | 238 | -0.097 | 34% |
| 1.6× ATR or more | 278 | -0.230 | 29% |

## How trades ended

- Full stop-outs (−0.85R or worse): 55%
- Scratches (within ±0.15R, mostly breakeven exits): 7%
- Wins of 1R or more: 19% · average win +1.432R · average loss -0.886R
- Losers that first went 1R or more in your favour: 13% of losers

## How far trades went

- Share of trades that were at some point this far in profit: +0.5R 50% · +1R 33% · +1.5R 23% · +2R 14% · +3R 1%
- Winners closed at +1.437R on average; at their best they were +1.716R up (median +1.752R)
- Losers that never got more than +0.3R in profit: 57%
- Targets (median): TP1 +2.279R, final target +2.939R · final target within 1.5R on 0% of trades · reached on 0%

## By final target distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| 1.25–2R | 48 | -0.232 | 33% |
| 2–3R | 294 | -0.253 | 27% |
| 3R or more | 296 | +0.031 | 39% |

## By holding time

| | Trades | Mean R | Winners |
|---|---|---|---|
| held under 1h | 250 | -0.667 | 11% |
| 1–3h | 216 | -0.031 | 38% |
| 3–7.5h | 153 | +0.621 | 59% |
| 7.5h or more (time limit) | 19 | +0.123 | 63% |

## Entries refused (cycles)

- within # min of XM's daily break: 2611
- costs #% of the stop: 2492
- data check: 1875
- the stop beyond the move's start: 787
- last hour before the weekend close: 523
- OTE setup missed: 148

Settings: {"market":"nas","symbol":"US100Cash#","cycleMin":3,"spreadMult":1,"slippage":0,"balance":90000,"currency":"ZAR","rate":18,"spreadTable":false,"env":{"V1_STRATEGY":"ote","V1_MAX_LOTS":"0.02"}}
