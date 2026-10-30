# Replay verdict — silverbullet-development (development)

**FAIL** · 2015-01-01 → 2025-01-01 · real XAUUSD M1 prices

| | |
|---|---|
| Trades | 348 (35 a year) |
| Mean R after costs | -0.101 (95% range -0.213 to +0.010), t = -1.78 |
| Winners | 44.8% · profit factor 0.81 |
| Cost | median 8.0% of the stop · mean R with costs × 1.5: -0.140 |
| Random entries (same exits, 1000 runs) | mean -0.060 · bot -0.102 · bot beats 24.2% |
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
| 2015 | 11 | -0.345 | -1.29 |
| 2016 | 17 | +0.286 | 0.97 |
| 2017 | 4 | +0.479 | 3.66 |
| 2018 | 6 | -0.001 | -0.00 |
| 2019 | 8 | +0.030 | 0.09 |
| 2020 | 88 | -0.173 | -1.50 |
| 2021 | 49 | -0.031 | -0.22 |
| 2022 | 52 | -0.080 | -0.55 |
| 2023 | 34 | -0.039 | -0.17 |
| 2024 | 79 | -0.206 | -1.79 |

## By score

| Score | Trades | Mean R |
|---|---|---|
| 0 | 348 | -0.101 |

## By session

| | Trades | Mean R | Winners |
|---|---|---|---|
| london | 84 | -0.141 | 40% |
| ny | 263 | -0.085 | 46% |
| ny_close | 1 | -1.000 | 0% |

## By direction

| | Trades | Mean R | Winners |
|---|---|---|---|
| buy | 161 | -0.056 | 48% |
| sell | 187 | -0.140 | 42% |

## By trade type

| | Trades | Mean R | Winners |
|---|---|---|---|
| normal | 348 | -0.101 | 45% |

Median stop: normal $3.84 · sniper — · all $3.84

## By trading cost

| | Trades | Mean R | Winners |
|---|---|---|---|
| cost under 4% of the stop | 8 | +0.182 | 63% |
| 4–6% | 51 | -0.302 | 35% |
| 6–8% | 112 | +0.005 | 50% |
| 8% or more | 177 | -0.124 | 44% |

## By stop distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| stop under $3 | 2 | -0.055 | 50% |
| $3–5 | 287 | -0.070 | 46% |
| $5–8 | 52 | -0.336 | 33% |
| $8 or more | 7 | +0.351 | 71% |

## By stop size in 15-minute ATRs

| | Trades | Mean R | Winners |
|---|---|---|---|
| stop under 0.8× ATR | 75 | -0.012 | 45% |
| 0.8–1.2× ATR | 145 | -0.140 | 45% |
| 1.2–1.6× ATR | 97 | -0.226 | 39% |
| 1.6× ATR or more | 31 | +0.252 | 61% |

## How trades ended

- Full stop-outs (−0.85R or worse): 52%
- Scratches (within ±0.15R, mostly breakeven exits): 2%
- Wins of 1R or more: 15% · average win +0.959R · average loss -0.963R
- Losers that first went 1R or more in your favour: 1% of losers

## How far trades went

- Share of trades that were at some point this far in profit: +0.5R 53% · +1R 35% · +1.5R 20% · +2R 11% · +3R 3%
- Winners closed at +0.945R on average; at their best they were +1.603R up (median +1.371R)
- Losers that never got more than +0.3R in profit: 65%
- Targets (median): TP1 +1.000R, final target +3.730R · final target within 1.5R on 0% of trades · reached on 0%

## By final target distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| 2–3R | 101 | -0.082 | 47% |
| 3R or more | 247 | -0.110 | 44% |

## By holding time

| | Trades | Mean R | Winners |
|---|---|---|---|
| held under 1h | 182 | -0.474 | 29% |
| 1–3h | 104 | +0.178 | 57% |
| 3–7.5h | 62 | +0.523 | 73% |

## Entries refused (cycles)

- costs #% of the stop: 4684
- price already went through the fair value gap: 274
- Silver Bullet setup missed: 230
- the Asian low is only #R away with the spread: 48
- the Asian high is only #R away with the spread: 40
- the New York morning low is only #R away with the : 31

Settings: {"cycleMin":3,"spreadMult":1,"slippage":0,"balance":90000,"currency":"ZAR","rate":18,"spreadTable":false,"env":{"V1_STRATEGY":"silverbullet","V1_MAX_LOTS":"0.02"}}
