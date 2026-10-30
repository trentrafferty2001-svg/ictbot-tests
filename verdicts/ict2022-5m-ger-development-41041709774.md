# Replay verdict — ict2022-5m-ger (development) · GER40Cash#

**FAIL** · 2015-01-01 → 2025-01-01 · real XAUUSD M1 prices

| | |
|---|---|
| Trades | 309 (31 a year) |
| Mean R after costs | +0.023 (95% range -0.091 to +0.137), t = 0.40 |
| Winners | 50.8% · profit factor 1.05 |
| Cost | median 6.2% of the stop · mean R with costs × 1.5: -0.008 |
| Random entries (same exits, 1000 runs) | mean -0.049 · bot +0.008 · bot beats 81.7% |
| Exit-model check | correlation with the replayed trades 1.00 (should be > 0.8) |

## Rules

- ✅ I1: at least 300 trades
- ❌ I2: mean R > 0 after costs with t ≥ 3
- ❌ I3: beats ≥ 95% of random-entry runs (same exits)
- ❌ I4: positive in ≥ 2/3 of years (years with ≥ 30 trades)
- ❌ I5: still positive with costs × 1.5

## By year

| Year | Trades | Mean R | t |
|---|---|---|---|
| 2015 | 45 | -0.031 | -0.20 |
| 2016 | 48 | +0.033 | 0.24 |
| 2017 | 24 | +0.224 | 1.06 |
| 2018 | 48 | -0.141 | -1.01 |
| 2019 | 49 | +0.098 | 0.65 |
| 2020 | 23 | +0.303 | 1.28 |
| 2021 | 2 | -1.000 | — |
| 2022 | 2 | -1.000 | — |
| 2023 | 10 | +0.010 | 0.03 |
| 2024 | 58 | +0.010 | 0.07 |

## By score

| Score | Trades | Mean R |
|---|---|---|
| 0 | 309 | +0.023 |

## By session

| | Trades | Mean R | Winners |
|---|---|---|---|
| london | 180 | -0.001 | 50% |
| london_mid | 29 | +0.111 | 55% |
| ny | 59 | -0.108 | 44% |
| ny_open | 39 | +0.269 | 62% |
| pre_london | 2 | -0.008 | 50% |

## By direction

| | Trades | Mean R | Winners |
|---|---|---|---|
| buy | 158 | +0.084 | 54% |
| sell | 151 | -0.040 | 47% |

## By trade type

| | Trades | Mean R | Winners |
|---|---|---|---|
| normal | 309 | +0.023 | 51% |

Median stop: normal $37.30 · sniper — · all $37.30

## By trading cost

| | Trades | Mean R | Winners |
|---|---|---|---|
| cost under 4% of the stop | 42 | +0.338 | 74% |
| 4–6% | 100 | +0.110 | 52% |
| 6–8% | 87 | -0.178 | 40% |
| 8% or more | 80 | -0.032 | 49% |

## By stop distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| $8 or more | 309 | +0.023 | 51% |

## By stop size in 15-minute ATRs

| | Trades | Mean R | Winners |
|---|---|---|---|
| stop under 0.8× ATR | 4 | +0.055 | 50% |
| 0.8–1.2× ATR | 41 | +0.019 | 49% |
| 1.2–1.6× ATR | 83 | -0.090 | 45% |
| 1.6× ATR or more | 181 | +0.076 | 54% |

## How trades ended

- Full stop-outs (−0.85R or worse): 46%
- Scratches (within ±0.15R, mostly breakeven exits): 4%
- Wins of 1R or more: 24% · average win +0.963R · average loss -0.954R
- Losers that first went 1R or more in your favour: 0% of losers

## How far trades went

- Share of trades that were at some point this far in profit: +0.5R 59% · +1R 42% · +1.5R 21% · +2R 0% · +3R 0%
- Winners closed at +0.963R on average; at their best they were +1.365R up (median +1.403R)
- Losers that never got more than +0.3R in profit: 62%
- Targets (median): TP1 +1.000R, final target +2.000R · final target within 1.5R on 0% of trades · reached on 1%

## By final target distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| 1.25–2R | 94 | +0.145 | 59% |
| 2–3R | 215 | -0.030 | 47% |

## By holding time

| | Trades | Mean R | Winners |
|---|---|---|---|
| held under 1h | 111 | -0.436 | 27% |
| 1–3h | 90 | +0.255 | 61% |
| 3–7.5h | 95 | +0.302 | 65% |
| 7.5h or more (time limit) | 13 | +0.303 | 77% |

## Entries refused (cycles)

- costs #% of the stop: 650
- the stop beyond the raid: 55
- price already went through the fair value gap: 18
- ICT # setup missed: 10
- news: 10

Settings: {"market":"ger","symbol":"GER40Cash#","cycleMin":3,"spreadMult":1,"slippage":0,"balance":90000,"currency":"ZAR","rate":18,"spreadTable":false,"env":{"V1_STRATEGY":"ict2022","V1_ICT_TF":"5m","V1_MAX_LOTS":"0.02"}}
