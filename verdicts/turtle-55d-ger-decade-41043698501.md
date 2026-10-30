# Replay verdict — turtle-55d-ger (decade) · EA strategy turtle-55d · GER40Cash#

**TOO FEW TRADES** · 2015-01-01 → 2025-01-01 · real XAUUSD M1 prices

| | |
|---|---|
| Trades | 48 (5 a year) |
| Mean R after costs | +1.888 (95% range -2.959 to +6.734), t = 0.76 |
| Winners | 27.1% · profit factor 3.07 |
| Cost | median 2.1% of the stop · mean R with costs × 1.5: +1.752 |
| Overnight swap | mean -0.243R a trade · 98% of trades held overnight |
| Random entries (same exits, 1000 runs) | mean +1.074 · bot +1.888 · bot beats 53.0% |
| Exit-model check | correlation with the replayed trades 1.00 (should be > 0.8) |

## Rules

- ❌ P1: at least 100 trades (all markets)
- ❌ P2: mean R > 0 after costs and swaps with t ≥ 2.5
- ❌ P3: beats ≥ 95% of random-entry runs (same exits)
- ❌ P4: positive in ≥ 60% of years (years with ≥ 10 trades)
- ✅ P5: still positive with costs and swaps × 1.5

## By year

| Year | Trades | Mean R | t |
|---|---|---|---|
| 2015 | 5 | -0.131 | -0.19 |
| 2016 | 4 | +0.442 | 0.40 |
| 2017 | 2 | -0.101 | -0.34 |
| 2018 | 6 | -0.528 | -1.71 |
| 2019 | 5 | -0.683 | -2.19 |
| 2020 | 7 | -1.802 | -0.84 |
| 2021 | 5 | -0.583 | -1.01 |
| 2022 | 4 | -0.277 | -0.86 |
| 2023 | 5 | +22.944 | 0.98 |
| 2024 | 5 | -0.361 | -0.66 |

## By score

| Score | Trades | Mean R |
|---|---|---|
| 0 | 48 | +1.888 |

## By session

| | Trades | Mean R | Winners |
|---|---|---|---|
| london | 4 | -0.483 | 25% |
| pre_london | 30 | +3.636 | 30% |
| tokyo | 14 | -1.181 | 21% |

## By direction

| | Trades | Mean R | Winners |
|---|---|---|---|
| buy | 31 | +3.030 | 29% |
| sell | 17 | -0.196 | 24% |

## By trade type

| | Trades | Mean R | Winners |
|---|---|---|---|
| ea | 48 | +1.888 | 27% |

Median stop: normal — · sniper — · all $301.13

## By trading cost

| | Trades | Mean R | Winners |
|---|---|---|---|
| cost under 4% of the stop | 34 | -0.566 | 26% |
| 4–6% | 7 | -0.085 | 43% |
| 6–8% | 7 | +15.779 | 14% |

## By stop distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| $8 or more | 48 | +1.888 | 27% |

## By stop size in 15-minute ATRs

| | Trades | Mean R | Winners |
|---|---|---|---|
| 1.6× ATR or more | 48 | +1.888 | 27% |

## How trades ended

- Full stop-outs (−0.85R or worse): 54%
- Scratches (within ±0.15R, mostly breakeven exits): 4%
- Wins of 1R or more: 13% · average win +10.334R · average loss -1.250R
- Losers that first went 1R or more in your favour: 29% of losers

## How far trades went

- Share of trades that were at some point this far in profit: +0.5R 63% · +1R 48% · +1.5R 38% · +2R 29% · +3R 15%
- Winners closed at +10.334R on average; at their best they were +13.126R up (median +3.447R)
- Losers that never got more than +0.3R in profit: 29%
- Targets (median): TP1 —R, final target —R · final target within 1.5R on —% of trades · reached on —%

## By final target distance

| | Trades | Mean R | Winners |
|---|---|---|---|

## By holding time

| | Trades | Mean R | Winners |
|---|---|---|---|
| 7.5h or more (time limit) | 48 | +1.888 | 27% |

## Entries refused (cycles)

- data check: 199
- first hour after the weekly open: 11

Settings: {"market":"ger","symbol":"GER40Cash#","cycleMin":60,"spreadMult":1,"slippage":0,"balance":1000000,"currency":"ZAR","rate":18,"spreadTable":false,"env":{"V1_STRATEGY":"ea","V1_EA":"turtle-55d","V1_MAX_LOTS":"0.02"}}
