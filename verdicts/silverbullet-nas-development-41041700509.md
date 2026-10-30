# Replay verdict — silverbullet-nas (development) · US100Cash#

**FAIL** · 2015-01-01 → 2025-01-01 · real XAUUSD M1 prices

| | |
|---|---|
| Trades | 789 (79 a year) |
| Mean R after costs | -0.012 (95% range -0.089 to +0.066), t = -0.29 |
| Winners | 48.5% · profit factor 0.98 |
| Cost | median 6.3% of the stop · mean R with costs × 1.5: -0.043 |
| Random entries (same exits, 1000 runs) | mean -0.060 · bot -0.019 · bot beats 77.5% |
| Exit-model check | correlation with the replayed trades 0.98 (should be > 0.8) |

## Rules

- ✅ I1: at least 300 trades
- ❌ I2: mean R > 0 after costs with t ≥ 3
- ❌ I3: beats ≥ 95% of random-entry runs (same exits)
- ❌ I4: positive in ≥ 2/3 of years (years with ≥ 15 trades)
- ❌ I5: still positive with costs × 1.5

## By year

| Year | Trades | Mean R | t |
|---|---|---|---|
| 2015 | 5 | -0.158 | -0.30 |
| 2016 | 2 | +1.127 | 3.31 |
| 2017 | 2 | +0.133 | 0.33 |
| 2018 | 43 | +0.115 | 0.70 |
| 2019 | 17 | +0.153 | 0.63 |
| 2020 | 146 | -0.068 | -0.72 |
| 2021 | 143 | -0.114 | -1.29 |
| 2022 | 204 | +0.015 | 0.18 |
| 2023 | 92 | -0.033 | -0.29 |
| 2024 | 135 | +0.058 | 0.64 |

## By score

| Score | Trades | Mean R |
|---|---|---|
| 0 | 789 | -0.012 |

## By session

| | Trades | Mean R | Winners |
|---|---|---|---|
| london | 61 | -0.032 | 49% |
| ny | 719 | -0.005 | 49% |
| ny_close | 9 | -0.431 | 33% |

## By direction

| | Trades | Mean R | Winners |
|---|---|---|---|
| buy | 412 | -0.045 | 48% |
| sell | 377 | +0.025 | 50% |

## By trade type

| | Trades | Mean R | Winners |
|---|---|---|---|
| normal | 789 | -0.012 | 49% |

Median stop: normal $33.21 · sniper — · all $33.21

## By trading cost

| | Trades | Mean R | Winners |
|---|---|---|---|
| cost under 4% of the stop | 131 | -0.081 | 46% |
| 4–6% | 226 | +0.061 | 51% |
| 6–8% | 221 | +0.035 | 51% |
| 8% or more | 211 | -0.095 | 45% |

## By stop distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| $8 or more | 789 | -0.012 | 49% |

## By stop size in 15-minute ATRs

| | Trades | Mean R | Winners |
|---|---|---|---|
| stop under 0.8× ATR | 246 | -0.126 | 44% |
| 0.8–1.2× ATR | 298 | +0.048 | 51% |
| 1.2–1.6× ATR | 156 | +0.062 | 52% |
| 1.6× ATR or more | 89 | -0.022 | 47% |

## How trades ended

- Full stop-outs (−0.85R or worse): 50%
- Scratches (within ±0.15R, mostly breakeven exits): 1%
- Wins of 1R or more: 20% · average win +1.025R · average loss -0.989R
- Losers that first went 1R or more in your favour: 0% of losers

## How far trades went

- Share of trades that were at some point this far in profit: +0.5R 57% · +1R 40% · +1.5R 26% · +2R 15% · +3R 4%
- Winners closed at +1.025R on average; at their best they were +1.763R up (median +1.571R)
- Losers that never got more than +0.3R in profit: 70%
- Targets (median): TP1 +1.000R, final target +3.580R · final target within 1.5R on 0% of trades · reached on 1%

## By final target distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| 1.25–2R | 14 | +0.300 | 57% |
| 2–3R | 244 | -0.005 | 48% |
| 3R or more | 531 | -0.023 | 48% |

## By holding time

| | Trades | Mean R | Winners |
|---|---|---|---|
| held under 1h | 552 | -0.312 | 36% |
| 1–3h | 197 | +0.679 | 78% |
| 3–7.5h | 40 | +0.734 | 75% |

## Entries refused (cycles)

- costs #% of the stop: 3378
- price already went through the fair value gap: 272
- Silver Bullet setup missed: 228
- the Asian low is only #R away with the spread: 122
- the Asian high is only #R away with the spread: 101
- the previous day high is only #R away with the spr: 73

Settings: {"market":"nas","symbol":"US100Cash#","cycleMin":3,"spreadMult":1,"slippage":0,"balance":90000,"currency":"ZAR","rate":18,"spreadTable":false,"env":{"V1_STRATEGY":"silverbullet","V1_MAX_LOTS":"0.02"}}
