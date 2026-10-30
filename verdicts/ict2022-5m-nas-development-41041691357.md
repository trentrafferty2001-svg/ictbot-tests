# Replay verdict — ict2022-5m-nas (development) · US100Cash#

**FAIL** · 2015-01-01 → 2025-01-01 · real XAUUSD M1 prices

| | |
|---|---|
| Trades | 358 (36 a year) |
| Mean R after costs | -0.027 (95% range -0.136 to +0.082), t = -0.48 |
| Winners | 49.2% · profit factor 0.95 |
| Cost | median 6.0% of the stop · mean R with costs × 1.5: -0.056 |
| Random entries (same exits, 1000 runs) | mean -0.049 · bot -0.033 · bot beats 58.4% |
| Exit-model check | correlation with the replayed trades 0.99 (should be > 0.8) |

## Rules

- ✅ I1: at least 300 trades
- ❌ I2: mean R > 0 after costs with t ≥ 3
- ❌ I3: beats ≥ 95% of random-entry runs (same exits)
- ❌ I4: positive in ≥ 2/3 of years (years with ≥ 30 trades)
- ❌ I5: still positive with costs × 1.5

## By year

| Year | Trades | Mean R | t |
|---|---|---|---|
| 2015 | 10 | -0.049 | -0.15 |
| 2016 | 9 | +0.583 | 2.01 |
| 2017 | 5 | -0.570 | -1.33 |
| 2018 | 20 | -0.150 | -0.60 |
| 2019 | 25 | +0.150 | 0.74 |
| 2020 | 47 | +0.017 | 0.11 |
| 2021 | 51 | -0.199 | -1.47 |
| 2022 | 85 | +0.045 | 0.41 |
| 2023 | 46 | -0.187 | -1.08 |
| 2024 | 60 | +0.032 | 0.22 |

## By score

| Score | Trades | Mean R |
|---|---|---|
| 0 | 358 | -0.027 |

## By session

| | Trades | Mean R | Winners |
|---|---|---|---|
| london | 76 | -0.101 | 46% |
| london_mid | 29 | -0.119 | 41% |
| ny | 164 | +0.048 | 52% |
| ny_open | 88 | -0.060 | 50% |
| pre_london | 1 | -1.000 | 0% |

## By direction

| | Trades | Mean R | Winners |
|---|---|---|---|
| buy | 184 | -0.020 | 50% |
| sell | 174 | -0.034 | 48% |

## By trade type

| | Trades | Mean R | Winners |
|---|---|---|---|
| normal | 358 | -0.027 | 49% |

Median stop: normal $42.00 · sniper — · all $42.00

## By trading cost

| | Trades | Mean R | Winners |
|---|---|---|---|
| cost under 4% of the stop | 111 | +0.150 | 57% |
| 4–6% | 73 | -0.014 | 52% |
| 6–8% | 83 | -0.212 | 41% |
| 8% or more | 91 | -0.084 | 45% |

## By stop distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| $8 or more | 358 | -0.027 | 49% |

## By stop size in 15-minute ATRs

| | Trades | Mean R | Winners |
|---|---|---|---|
| stop under 0.8× ATR | 3 | -1.000 | 0% |
| 0.8–1.2× ATR | 34 | +0.120 | 59% |
| 1.2–1.6× ATR | 72 | +0.112 | 57% |
| 1.6× ATR or more | 249 | -0.075 | 46% |

## How trades ended

- Full stop-outs (−0.85R or worse): 49%
- Scratches (within ±0.15R, mostly breakeven exits): 2%
- Wins of 1R or more: 23% · average win +0.972R · average loss -0.992R
- Losers that first went 1R or more in your favour: 0% of losers

## How far trades went

- Share of trades that were at some point this far in profit: +0.5R 57% · +1R 41% · +1.5R 22% · +2R 0% · +3R 0%
- Winners closed at +0.982R on average; at their best they were +1.367R up (median +1.449R)
- Losers that never got more than +0.3R in profit: 68%
- Targets (median): TP1 +1.000R, final target +2.000R · final target within 1.5R on 0% of trades · reached on 1%

## By final target distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| 1.25–2R | 185 | -0.003 | 50% |
| 2–3R | 173 | -0.052 | 49% |

## By holding time

| | Trades | Mean R | Winners |
|---|---|---|---|
| held under 1h | 163 | -0.324 | 35% |
| 1–3h | 111 | +0.159 | 59% |
| 3–7.5h | 83 | +0.283 | 64% |
| 7.5h or more (time limit) | 1 | +2.092 | 100% |

## Entries refused (cycles)

- costs #% of the stop: 1021
- the stop beyond the raid: 93
- price already went through the fair value gap: 39
- news: 25
- ICT # setup missed: 6

Settings: {"market":"nas","symbol":"US100Cash#","cycleMin":3,"spreadMult":1,"slippage":0,"balance":90000,"currency":"ZAR","rate":18,"spreadTable":false,"env":{"V1_STRATEGY":"ict2022","V1_ICT_TF":"5m","V1_MAX_LOTS":"0.02"}}
