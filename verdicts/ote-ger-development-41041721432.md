# Replay verdict — ote-ger (development) · GER40Cash#

**FAIL** · 2015-01-01 → 2025-01-01 · real XAUUSD M1 prices

| | |
|---|---|
| Trades | 534 (53 a year) |
| Mean R after costs | -0.047 (95% range -0.147 to +0.054), t = -0.91 |
| Winners | 38.4% · profit factor 0.91 |
| Cost | median 6.2% of the stop · mean R with costs × 1.5: -0.077 |
| Random entries (same exits, 1000 runs) | mean -0.087 · bot -0.043 · bot beats 79.9% |
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
| 2015 | 81 | -0.020 | -0.14 |
| 2016 | 65 | -0.064 | -0.48 |
| 2017 | 49 | +0.090 | 0.54 |
| 2018 | 92 | +0.089 | 0.66 |
| 2019 | 63 | -0.050 | -0.34 |
| 2020 | 56 | -0.349 | -2.77 |
| 2021 | 7 | +0.009 | 0.02 |
| 2022 | 17 | -0.323 | -1.52 |
| 2023 | 11 | +0.528 | 1.11 |
| 2024 | 93 | -0.100 | -0.78 |

## By score

| Score | Trades | Mean R |
|---|---|---|
| 0 | 534 | -0.047 |

## By session

| | Trades | Mean R | Winners |
|---|---|---|---|
| asian_mid | 2 | -0.225 | 50% |
| london | 92 | -0.093 | 29% |
| london_mid | 179 | -0.106 | 37% |
| ny | 179 | -0.094 | 40% |
| ny_close | 11 | -0.189 | 27% |
| ny_open | 68 | +0.345 | 51% |
| pre_london | 2 | -0.316 | 50% |
| tokyo | 1 | -1.000 | 0% |

## By direction

| | Trades | Mean R | Winners |
|---|---|---|---|
| buy | 239 | +0.024 | 42% |
| sell | 295 | -0.104 | 36% |

## By trade type

| | Trades | Mean R | Winners |
|---|---|---|---|
| normal | 534 | -0.047 | 38% |

Median stop: normal $38.98 · sniper — · all $38.98

## By trading cost

| | Trades | Mean R | Winners |
|---|---|---|---|
| cost under 4% of the stop | 93 | -0.055 | 46% |
| 4–6% | 159 | +0.035 | 42% |
| 6–8% | 166 | -0.063 | 36% |
| 8% or more | 116 | -0.128 | 31% |

## By stop distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| $8 or more | 534 | -0.047 | 38% |

## By stop size in 15-minute ATRs

| | Trades | Mean R | Winners |
|---|---|---|---|
| 0.8–1.2× ATR | 50 | +0.161 | 38% |
| 1.2–1.6× ATR | 138 | -0.036 | 36% |
| 1.6× ATR or more | 346 | -0.081 | 40% |

## How trades ended

- Full stop-outs (−0.85R or worse): 47%
- Scratches (within ±0.15R, mostly breakeven exits): 6%
- Wins of 1R or more: 19% · average win +1.235R · average loss -0.845R
- Losers that first went 1R or more in your favour: 7% of losers

## How far trades went

- Share of trades that were at some point this far in profit: +0.5R 55% · +1R 33% · +1.5R 20% · +2R 12% · +3R 1%
- Winners closed at +1.235R on average; at their best they were +1.583R up (median +1.486R)
- Losers that never got more than +0.3R in profit: 53%
- Targets (median): TP1 +2.260R, final target +2.680R · final target within 1.5R on 0% of trades · reached on 1%

## By final target distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| 1.25–2R | 49 | -0.139 | 41% |
| 2–3R | 314 | -0.098 | 39% |
| 3R or more | 171 | +0.074 | 37% |

## By holding time

| | Trades | Mean R | Winners |
|---|---|---|---|
| held under 1h | 125 | -0.858 | 5% |
| 1–3h | 146 | -0.239 | 25% |
| 3–7.5h | 209 | +0.314 | 55% |
| 7.5h or more (time limit) | 54 | +0.954 | 89% |

## Entries refused (cycles)

- data check: 14373
- costs #% of the stop: 1654
- within # min of XM's daily break: 1303
- the stop beyond the move's start: 684
- last hour before the weekend close: 529
- first hour after the weekly open: 139

Settings: {"market":"ger","symbol":"GER40Cash#","cycleMin":3,"spreadMult":1,"slippage":0,"balance":90000,"currency":"ZAR","rate":18,"spreadTable":false,"env":{"V1_STRATEGY":"ote","V1_MAX_LOTS":"0.02"}}
