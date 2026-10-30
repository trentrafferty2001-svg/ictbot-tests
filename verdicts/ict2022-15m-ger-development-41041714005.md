# Replay verdict — ict2022-15m-ger (development) · GER40Cash#

**TOO FEW TRADES** · 2015-01-01 → 2025-01-01 · real XAUUSD M1 prices

| | |
|---|---|
| Trades | 210 (21 a year) |
| Mean R after costs | +0.066 (95% range -0.060 to +0.192), t = 1.02 |
| Winners | 51.0% · profit factor 1.17 |
| Cost | median 5.3% of the stop · mean R with costs × 1.5: +0.038 |
| Random entries (same exits, 1000 runs) | mean -0.058 · bot +0.055 · bot beats 96.2% |
| Exit-model check | correlation with the replayed trades 0.99 (should be > 0.8) |

## Rules

- ❌ I1: at least 300 trades
- ❌ I2: mean R > 0 after costs with t ≥ 3
- ✅ I3: beats ≥ 95% of random-entry runs (same exits)
- ✅ I4: positive in ≥ 2/3 of years (years with ≥ 30 trades)
- ✅ I5: still positive with costs × 1.5

## By year

| Year | Trades | Mean R | t |
|---|---|---|---|
| 2015 | 26 | +0.208 | 1.01 |
| 2016 | 25 | +0.063 | 0.43 |
| 2017 | 16 | -0.077 | -0.35 |
| 2018 | 28 | +0.081 | 0.46 |
| 2019 | 36 | +0.020 | 0.13 |
| 2020 | 13 | -0.485 | -2.17 |
| 2021 | 4 | -0.103 | -1.09 |
| 2022 | 16 | +0.410 | 1.94 |
| 2023 | 8 | +0.077 | 0.20 |
| 2024 | 38 | +0.122 | 0.72 |

## By score

| Score | Trades | Mean R |
|---|---|---|
| 0 | 210 | +0.066 |

## By session

| | Trades | Mean R | Winners |
|---|---|---|---|
| london | 100 | +0.130 | 54% |
| london_mid | 40 | +0.214 | 57% |
| ny | 62 | -0.108 | 44% |
| ny_open | 8 | -0.120 | 38% |

## By direction

| | Trades | Mean R | Winners |
|---|---|---|---|
| buy | 94 | +0.120 | 54% |
| sell | 116 | +0.022 | 48% |

## By trade type

| | Trades | Mean R | Winners |
|---|---|---|---|
| normal | 210 | +0.066 | 51% |

Median stop: normal $43.74 · sniper — · all $43.74

## By trading cost

| | Trades | Mean R | Winners |
|---|---|---|---|
| cost under 4% of the stop | 57 | +0.170 | 58% |
| 4–6% | 70 | -0.002 | 46% |
| 6–8% | 47 | -0.167 | 38% |
| 8% or more | 36 | +0.336 | 67% |

## By stop distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| $8 or more | 210 | +0.066 | 51% |

## By stop size in 15-minute ATRs

| | Trades | Mean R | Winners |
|---|---|---|---|
| 0.8–1.2× ATR | 2 | +0.275 | 50% |
| 1.2–1.6× ATR | 22 | +0.186 | 59% |
| 1.6× ATR or more | 186 | +0.049 | 50% |

## How trades ended

- Full stop-outs (−0.85R or worse): 34%
- Scratches (within ±0.15R, mostly breakeven exits): 7%
- Wins of 1R or more: 22% · average win +0.887R · average loss -0.787R
- Losers that first went 1R or more in your favour: 0% of losers

## How far trades went

- Share of trades that were at some point this far in profit: +0.5R 60% · +1R 33% · +1.5R 18% · +2R 0% · +3R 0%
- Winners closed at +0.887R on average; at their best they were +1.230R up (median +1.309R)
- Losers that never got more than +0.3R in profit: 64%
- Targets (median): TP1 +1.000R, final target +1.910R · final target within 1.5R on 0% of trades · reached on 2%

## By final target distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| 1.25–2R | 137 | +0.067 | 52% |
| 2–3R | 73 | +0.063 | 49% |

## By holding time

| | Trades | Mean R | Winners |
|---|---|---|---|
| held under 1h | 27 | -0.192 | 37% |
| 1–3h | 53 | +0.019 | 51% |
| 3–7.5h | 93 | +0.152 | 57% |
| 7.5h or more (time limit) | 37 | +0.105 | 46% |

## Entries refused (cycles)

- costs #% of the stop: 202
- the stop beyond the raid: 159
- news: 7
- price already went through the fair value gap: 3

Settings: {"market":"ger","symbol":"GER40Cash#","cycleMin":3,"spreadMult":1,"slippage":0,"balance":90000,"currency":"ZAR","rate":18,"spreadTable":false,"env":{"V1_STRATEGY":"ict2022","V1_ICT_TF":"15m","V1_MAX_LOTS":"0.02"}}
