# Replay verdict — ote-development (development)

**FAIL** · 2015-01-01 → 2025-01-01 · real XAUUSD M1 prices

| | |
|---|---|
| Trades | 814 (81 a year) |
| Mean R after costs | +0.001 (95% range -0.085 to +0.086), t = 0.02 |
| Winners | 40.0% · profit factor 1.00 |
| Cost | median 7.0% of the stop · mean R with costs × 1.5: -0.034 |
| Random entries (same exits, 1000 runs) | mean -0.065 · bot -0.007 · bot beats 91.3% |
| Exit-model check | correlation with the replayed trades 0.99 (should be > 0.8) |

## Rules

- ✅ I1: at least 300 trades
- ❌ I2: mean R > 0 after costs with t ≥ 3
- ❌ I3: beats ≥ 95% of random-entry runs (same exits)
- ❌ I4: positive in ≥ 2/3 of years (years with ≥ 15 trades)
- ❌ I5: still positive with costs × 1.5

## By year

| Year | Trades | Mean R | t |
|---|---|---|---|
| 2015 | 57 | -0.157 | -1.17 |
| 2016 | 77 | -0.109 | -0.85 |
| 2017 | 26 | +0.110 | 0.46 |
| 2018 | 22 | -0.183 | -0.93 |
| 2019 | 44 | +0.034 | 0.18 |
| 2020 | 128 | +0.247 | 1.97 |
| 2021 | 105 | -0.109 | -0.97 |
| 2022 | 114 | -0.090 | -0.76 |
| 2023 | 86 | -0.060 | -0.46 |
| 2024 | 155 | +0.083 | 0.78 |

## By score

| Score | Trades | Mean R |
|---|---|---|
| 0 | 814 | +0.001 |

## By session

| | Trades | Mean R | Winners |
|---|---|---|---|
| asian_mid | 24 | -0.234 | 29% |
| london | 110 | -0.045 | 33% |
| london_mid | 191 | +0.095 | 38% |
| ny | 309 | -0.072 | 43% |
| ny_close | 35 | +0.051 | 60% |
| ny_open | 79 | +0.227 | 42% |
| pre_london | 44 | +0.048 | 36% |
| tokyo | 22 | -0.298 | 36% |

## By direction

| | Trades | Mean R | Winners |
|---|---|---|---|
| buy | 390 | -0.009 | 41% |
| sell | 424 | +0.010 | 39% |

## By trade type

| | Trades | Mean R | Winners |
|---|---|---|---|
| normal | 814 | +0.001 | 40% |

Median stop: normal $4.52 · sniper — · all $4.52

## By trading cost

| | Trades | Mean R | Winners |
|---|---|---|---|
| cost under 4% of the stop | 76 | -0.063 | 50% |
| 4–6% | 204 | +0.063 | 48% |
| 6–8% | 249 | -0.080 | 33% |
| 8% or more | 285 | +0.044 | 38% |

## By stop distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| stop under $3 | 2 | -0.523 | 0% |
| $3–5 | 490 | -0.009 | 36% |
| $5–8 | 248 | -0.016 | 42% |
| $8 or more | 74 | +0.135 | 59% |

## By stop size in 15-minute ATRs

| | Trades | Mean R | Winners |
|---|---|---|---|
| 0.8–1.2× ATR | 68 | +0.179 | 47% |
| 1.2–1.6× ATR | 236 | -0.115 | 36% |
| 1.6× ATR or more | 510 | +0.030 | 41% |

## How trades ended

- Full stop-outs (−0.85R or worse): 48%
- Scratches (within ±0.15R, mostly breakeven exits): 9%
- Wins of 1R or more: 21% · average win +1.288R · average loss -0.859R
- Losers that first went 1R or more in your favour: 13% of losers

## How far trades went

- Share of trades that were at some point this far in profit: +0.5R 55% · +1R 36% · +1.5R 23% · +2R 15% · +3R 1%
- Winners closed at +1.288R on average; at their best they were +1.601R up (median +1.506R)
- Losers that never got more than +0.3R in profit: 52%
- Targets (median): TP1 +2.278R, final target +3.146R · final target within 1.5R on 0% of trades · reached on 0%

## By final target distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| 1.25–2R | 1 | -0.553 | 0% |
| 2–3R | 21 | +0.073 | 52% |
| 3R or more | 792 | -0.001 | 40% |

## By holding time

| | Trades | Mean R | Winners |
|---|---|---|---|
| held under 1h | 211 | -0.637 | 12% |
| 1–3h | 244 | -0.007 | 35% |
| 3–7.5h | 285 | +0.294 | 54% |
| 7.5h or more (time limit) | 74 | +0.715 | 81% |

## Entries refused (cycles)

- costs #% of the stop: 2341
- within # min of XM's daily break: 1634
- data check: 804
- last hour before the weekend close: 445
- the stop beyond the move's start: 123
- OTE setup missed: 113

Settings: {"cycleMin":3,"spreadMult":1,"slippage":0,"balance":90000,"currency":"ZAR","rate":18,"spreadTable":false,"env":{"V1_STRATEGY":"ote","V1_MAX_LOTS":"0.02"}}
