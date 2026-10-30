# Replay verdict — turtle-55d-nas (decade) · EA strategy turtle-55d · US100Cash#

**TOO FEW TRADES** · 2015-01-01 → 2025-01-01 · real XAUUSD M1 prices

| | |
|---|---|
| Trades | 46 (5 a year) |
| Mean R after costs | -0.111 (95% range -0.536 to +0.314), t = -0.51 |
| Winners | 32.6% · profit factor 0.83 |
| Cost | median 1.4% of the stop · mean R with costs × 1.5: -0.288 |
| Overnight swap | mean -0.336R a trade · 100% of trades held overnight |
| Random entries (same exits, 1000 runs) | mean +0.079 · bot -0.111 · bot beats 10.9% |
| Exit-model check | correlation with the replayed trades 1.00 (should be > 0.8) |

## Rules

- ❌ P1: at least 100 trades (all markets)
- ❌ P2: mean R > 0 after costs and swaps with t ≥ 2.5
- ❌ P3: beats ≥ 95% of random-entry runs (same exits)
- ❌ P4: positive in ≥ 60% of years (years with ≥ 10 trades)
- ❌ P5: still positive with costs and swaps × 1.5

## By year

| Year | Trades | Mean R | t |
|---|---|---|---|
| 2015 | 5 | -1.077 | -11.46 |
| 2016 | 6 | +0.310 | 0.38 |
| 2017 | 3 | +0.401 | 0.25 |
| 2018 | 8 | -1.056 | -54.35 |
| 2019 | 4 | +0.565 | 0.61 |
| 2020 | 3 | +0.720 | 0.82 |
| 2021 | 4 | -0.161 | -0.30 |
| 2022 | 5 | -0.230 | -0.69 |
| 2023 | 4 | +0.933 | 0.80 |
| 2024 | 4 | -0.174 | -0.35 |

## By score

| Score | Trades | Mean R |
|---|---|---|
| 0 | 46 | -0.111 |

## By session

| | Trades | Mean R | Winners |
|---|---|---|---|
| sydney | 35 | +0.048 | 40% |
| tokyo | 11 | -0.616 | 9% |

## By direction

| | Trades | Mean R | Winners |
|---|---|---|---|
| buy | 30 | +0.205 | 43% |
| sell | 16 | -0.704 | 13% |

## By trade type

| | Trades | Mean R | Winners |
|---|---|---|---|
| ea | 46 | -0.111 | 33% |

Median stop: normal — · sniper — · all $335.15

## By trading cost

| | Trades | Mean R | Winners |
|---|---|---|---|
| cost under 4% of the stop | 46 | -0.111 | 33% |

## By stop distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| $8 or more | 46 | -0.111 | 33% |

## By stop size in 15-minute ATRs

| | Trades | Mean R | Winners |
|---|---|---|---|
| 1.6× ATR or more | 46 | -0.111 | 33% |

## How trades ended

- Full stop-outs (−0.85R or worse): 54%
- Scratches (within ±0.15R, mostly breakeven exits): 7%
- Wins of 1R or more: 20% · average win +1.653R · average loss -0.965R
- Losers that first went 1R or more in your favour: 26% of losers

## How far trades went

- Share of trades that were at some point this far in profit: +0.5R 74% · +1R 50% · +1.5R 41% · +2R 33% · +3R 20%
- Winners closed at +1.653R on average; at their best they were +4.491R up (median +3.731R)
- Losers that never got more than +0.3R in profit: 16%
- Targets (median): TP1 —R, final target —R · final target within 1.5R on —% of trades · reached on —%

## By final target distance

| | Trades | Mean R | Winners |
|---|---|---|---|

## By holding time

| | Trades | Mean R | Winners |
|---|---|---|---|
| 7.5h or more (time limit) | 46 | -0.111 | 33% |

## Entries refused (cycles)

- first hour after the weekly open: 11

Settings: {"market":"nas","symbol":"US100Cash#","cycleMin":60,"spreadMult":1,"slippage":0,"balance":1000000,"currency":"ZAR","rate":18,"spreadTable":false,"env":{"V1_STRATEGY":"ea","V1_EA":"turtle-55d","V1_MAX_LOTS":"0.02"}}
