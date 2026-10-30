# Replay verdict — ict2022-15m-nas (development) · US100Cash#

**TOO FEW TRADES** · 2015-01-01 → 2025-01-01 · real XAUUSD M1 prices

| | |
|---|---|
| Trades | 228 (23 a year) |
| Mean R after costs | -0.087 (95% range -0.215 to +0.041), t = -1.33 |
| Winners | 45.6% · profit factor 0.83 |
| Cost | median 4.9% of the stop · mean R with costs × 1.5: -0.113 |
| Random entries (same exits, 1000 runs) | mean -0.038 · bot -0.086 · bot beats 22.6% |
| Exit-model check | correlation with the replayed trades 0.99 (should be > 0.8) |

## Rules

- ❌ I1: at least 300 trades
- ❌ I2: mean R > 0 after costs with t ≥ 3
- ❌ I3: beats ≥ 95% of random-entry runs (same exits)
- ❌ I4: positive in ≥ 2/3 of years (years with ≥ 30 trades)
- ❌ I5: still positive with costs × 1.5

## By year

| Year | Trades | Mean R | t |
|---|---|---|---|
| 2015 | 10 | -0.253 | -0.87 |
| 2016 | 7 | +0.172 | 0.48 |
| 2017 | 6 | -0.518 | -1.46 |
| 2018 | 15 | -0.130 | -0.52 |
| 2019 | 16 | +0.212 | 0.84 |
| 2020 | 28 | -0.107 | -0.56 |
| 2021 | 39 | -0.062 | -0.37 |
| 2022 | 43 | -0.093 | -0.60 |
| 2023 | 22 | -0.340 | -1.78 |
| 2024 | 42 | +0.001 | 0.01 |

## By score

| Score | Trades | Mean R |
|---|---|---|
| 0 | 228 | -0.087 |

## By session

| | Trades | Mean R | Winners |
|---|---|---|---|
| london | 43 | -0.169 | 42% |
| london_mid | 30 | -0.082 | 43% |
| ny | 126 | -0.086 | 46% |
| ny_open | 29 | +0.023 | 52% |

## By direction

| | Trades | Mean R | Winners |
|---|---|---|---|
| buy | 115 | -0.022 | 47% |
| sell | 113 | -0.153 | 44% |

## By trade type

| | Trades | Mean R | Winners |
|---|---|---|---|
| normal | 228 | -0.087 | 46% |

Median stop: normal $49.51 · sniper — · all $49.51

## By trading cost

| | Trades | Mean R | Winners |
|---|---|---|---|
| cost under 4% of the stop | 81 | +0.122 | 56% |
| 4–6% | 54 | -0.283 | 37% |
| 6–8% | 44 | -0.254 | 39% |
| 8% or more | 49 | -0.066 | 45% |

## By stop distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| $8 or more | 228 | -0.087 | 46% |

## By stop size in 15-minute ATRs

| | Trades | Mean R | Winners |
|---|---|---|---|
| 0.8–1.2× ATR | 4 | -0.624 | 25% |
| 1.2–1.6× ATR | 21 | -0.433 | 29% |
| 1.6× ATR or more | 203 | -0.041 | 48% |

## How trades ended

- Full stop-outs (−0.85R or worse): 48%
- Scratches (within ±0.15R, mostly breakeven exits): 3%
- Wins of 1R or more: 23% · average win +0.924R · average loss -0.935R
- Losers that first went 1R or more in your favour: 0% of losers

## How far trades went

- Share of trades that were at some point this far in profit: +0.5R 50% · +1R 32% · +1.5R 14% · +2R 0% · +3R 0%
- Winners closed at +0.924R on average; at their best they were +1.237R up (median +1.262R)
- Losers that never got more than +0.3R in profit: 76%
- Targets (median): TP1 +1.000R, final target +2.000R · final target within 1.5R on 0% of trades · reached on 1%

## By final target distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| 1.25–2R | 150 | -0.073 | 45% |
| 2–3R | 78 | -0.114 | 47% |

## By holding time

| | Trades | Mean R | Winners |
|---|---|---|---|
| held under 1h | 78 | -0.448 | 28% |
| 1–3h | 61 | -0.092 | 44% |
| 3–7.5h | 87 | +0.215 | 61% |
| 7.5h or more (time limit) | 2 | +0.979 | 100% |

## Entries refused (cycles)

- costs #% of the stop: 468
- the stop beyond the raid: 205
- news: 11
- price already went through the fair value gap: 7

Settings: {"market":"nas","symbol":"US100Cash#","cycleMin":3,"spreadMult":1,"slippage":0,"balance":90000,"currency":"ZAR","rate":18,"spreadTable":false,"env":{"V1_STRATEGY":"ict2022","V1_ICT_TF":"15m","V1_MAX_LOTS":"0.02"}}
