# Replay verdict — turtle-55d-gold (decade) · EA strategy turtle-55d · XAUUSD

**TOO FEW TRADES** · 2015-01-01 → 2025-01-01 · real XAUUSD M1 prices

| | |
|---|---|
| Trades | 44 (4 a year) |
| Mean R after costs | -0.122 (95% range -0.551 to +0.308), t = -0.56 |
| Winners | 27.3% · profit factor 0.80 |
| Cost | median 1.1% of the stop · mean R with costs × 1.5: -0.294 |
| Overnight swap | mean -0.333R a trade · 100% of trades held overnight |
| Random entries (same exits, 1000 runs) | mean -0.043 · bot -0.122 · bot beats 30.9% |
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
| 2015 | 5 | -0.466 | -1.15 |
| 2016 | 6 | -0.104 | -0.17 |
| 2017 | 5 | -1.110 | -13.74 |
| 2018 | 4 | +0.574 | 0.65 |
| 2019 | 3 | +1.195 | 0.58 |
| 2020 | 4 | +0.231 | 0.39 |
| 2021 | 4 | -0.663 | -2.89 |
| 2022 | 5 | -0.162 | -0.43 |
| 2023 | 5 | -0.761 | -3.85 |
| 2024 | 3 | +1.204 | 0.88 |

## By score

| Score | Trades | Mean R |
|---|---|---|
| 0 | 44 | -0.122 |

## By session

| | Trades | Mean R | Winners |
|---|---|---|---|
| sydney | 31 | -0.280 | 19% |
| tokyo | 13 | +0.256 | 46% |

## By direction

| | Trades | Mean R | Winners |
|---|---|---|---|
| buy | 23 | +0.223 | 39% |
| sell | 21 | -0.500 | 14% |

## By trade type

| | Trades | Mean R | Winners |
|---|---|---|---|
| ea | 44 | -0.122 | 27% |

Median stop: normal — · sniper — · all $36.76

## By trading cost

| | Trades | Mean R | Winners |
|---|---|---|---|
| cost under 4% of the stop | 44 | -0.122 | 27% |

## By stop distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| $8 or more | 44 | -0.122 | 27% |

## By stop size in 15-minute ATRs

| | Trades | Mean R | Winners |
|---|---|---|---|
| 1.6× ATR or more | 44 | -0.122 | 27% |

## How trades ended

- Full stop-outs (−0.85R or worse): 48%
- Scratches (within ±0.15R, mostly breakeven exits): 5%
- Wins of 1R or more: 16% · average win +1.833R · average loss -0.855R
- Losers that first went 1R or more in your favour: 41% of losers

## How far trades went

- Share of trades that were at some point this far in profit: +0.5R 66% · +1R 57% · +1.5R 41% · +2R 34% · +3R 27%
- Winners closed at +1.833R on average; at their best they were +5.402R up (median +5.309R)
- Losers that never got more than +0.3R in profit: 25%
- Targets (median): TP1 —R, final target —R · final target within 1.5R on —% of trades · reached on —%

## By final target distance

| | Trades | Mean R | Winners |
|---|---|---|---|

## By holding time

| | Trades | Mean R | Winners |
|---|---|---|---|
| 7.5h or more (time limit) | 44 | -0.122 | 27% |

## Entries refused (cycles)

- first hour after the weekly open: 13

Settings: {"market":"gold","symbol":"XAUUSD","cycleMin":60,"spreadMult":1,"slippage":0,"balance":1000000,"currency":"ZAR","rate":18,"spreadTable":false,"env":{"V1_STRATEGY":"ea","V1_EA":"turtle-55d","V1_MAX_LOTS":"0.02"}}
