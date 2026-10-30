# Replay verdict — turtle-55d-btc (decade) · EA strategy turtle-55d · BTCUSD#

**TOO FEW TRADES** · 2015-01-01 → 2025-01-01 · real XAUUSD M1 prices

| | |
|---|---|
| Trades | 32 (4 a year) |
| Mean R after costs | +1.227 (95% range -0.883 to +3.337), t = 1.14 |
| Winners | 31.3% · profit factor 3.20 |
| Cost | median 4.2% of the stop · mean R with costs × 1.5: +1.165 |
| Overnight swap | mean -0.079R a trade · 88% of trades held overnight |
| Random entries (same exits, 1000 runs) | mean +1.520 · bot +1.227 · bot beats 37.6% |
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
| 2017 | 1 | +7.729 | — |
| 2018 | 1 | -0.816 | — |
| 2019 | 3 | -0.419 | -1.40 |
| 2020 | 6 | +4.961 | 0.90 |
| 2021 | 4 | -0.008 | -0.02 |
| 2022 | 4 | -0.160 | -0.30 |
| 2023 | 9 | -0.309 | -0.55 |
| 2024 | 4 | +1.824 | 1.11 |

## By score

| Score | Trades | Mean R |
|---|---|---|
| 0 | 32 | +1.227 |

## By session

| | Trades | Mean R | Winners |
|---|---|---|---|
| ny | 1 | -0.703 | 0% |
| sydney | 26 | +1.308 | 31% |
| tokyo | 5 | +1.191 | 40% |

## By direction

| | Trades | Mean R | Winners |
|---|---|---|---|
| buy | 19 | +2.334 | 32% |
| sell | 13 | -0.391 | 31% |

## By trade type

| | Trades | Mean R | Winners |
|---|---|---|---|
| ea | 32 | +1.227 | 31% |

Median stop: normal — · sniper — · all $1676.60

## By trading cost

| | Trades | Mean R | Winners |
|---|---|---|---|
| cost under 4% of the stop | 14 | +0.422 | 43% |
| 4–6% | 8 | -0.360 | 13% |
| 6–8% | 6 | +4.981 | 33% |
| 8% or more | 4 | +1.587 | 25% |

## By stop distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| $8 or more | 32 | +1.227 | 31% |

## By stop size in 15-minute ATRs

| | Trades | Mean R | Winners |
|---|---|---|---|
| 1.6× ATR or more | 32 | +1.227 | 31% |

## How trades ended

- Full stop-outs (−0.85R or worse): 44%
- Scratches (within ±0.15R, mostly breakeven exits): 3%
- Wins of 1R or more: 19% · average win +5.711R · average loss -0.811R
- Losers that first went 1R or more in your favour: 32% of losers

## How far trades went

- Share of trades that were at some point this far in profit: +0.5R 66% · +1R 53% · +1.5R 34% · +2R 28% · +3R 22%
- Winners closed at +5.711R on average; at their best they were +9.903R up (median +8.769R)
- Losers that never got more than +0.3R in profit: 45%
- Targets (median): TP1 —R, final target —R · final target within 1.5R on —% of trades · reached on —%

## By final target distance

| | Trades | Mean R | Winners |
|---|---|---|---|

## By holding time

| | Trades | Mean R | Winners |
|---|---|---|---|
| 7.5h or more (time limit) | 32 | +1.227 | 31% |

## Entries refused (cycles)

- data check: 922
- costs #% of the stop: 38
- first hour after the weekly open: 18
- last hour before the weekend close: 7

Settings: {"market":"btc","symbol":"BTCUSD#","cycleMin":60,"spreadMult":1,"slippage":0,"balance":1000000,"currency":"ZAR","rate":18,"spreadTable":false,"env":{"V1_STRATEGY":"ea","V1_EA":"turtle-55d","V1_MAX_LOTS":"0.02"}}
