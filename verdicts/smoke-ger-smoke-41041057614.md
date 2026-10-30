# Replay verdict — smoke-ger (smoke) · GER40Cash#

**SMOKE TEST OK — run "development" next** · 2024-03-01 → 2024-04-01 · real XAUUSD M1 prices

| | |
|---|---|
| Trades | 2 (2 a year) |
| Mean R after costs | +1.554 (95% range +1.460 to +1.647), t = 32.71 |
| Winners | 100.0% · profit factor — |
| Cost | median 8.9% of the stop · mean R with costs × 1.5: +1.516 |
| Random entries (same exits, 1000 runs) | mean -0.088 · bot +1.500 · bot beats 92.7% |
| Exit-model check | correlation with the replayed trades — (should be > 0.8) |

## Rules

- ❌ I1: at least 300 trades
- ✅ I2: mean R > 0 after costs with t ≥ 3
- ❌ I3: beats ≥ 95% of random-entry runs (same exits)
- ❌ I4: positive in ≥ 2/3 of years (years with ≥ 30 trades)
- ✅ I5: still positive with costs × 1.5

## By year

| Year | Trades | Mean R | t |
|---|---|---|---|
| 2024 | 2 | +1.554 | 32.71 |

## By score

| Score | Trades | Mean R |
|---|---|---|
| 0 | 2 | +1.554 |

## By session

| | Trades | Mean R | Winners |
|---|---|---|---|
| london | 2 | +1.554 | 100% |

## By direction

| | Trades | Mean R | Winners |
|---|---|---|---|
| buy | 2 | +1.554 | 100% |

## By trade type

| | Trades | Mean R | Winners |
|---|---|---|---|
| normal | 2 | +1.554 | 100% |

Median stop: normal $36.78 · sniper — · all $36.78

## By trading cost

| | Trades | Mean R | Winners |
|---|---|---|---|
| 6–8% | 1 | +1.506 | 100% |
| 8% or more | 1 | +1.601 | 100% |

## By stop distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| $8 or more | 2 | +1.554 | 100% |

## By stop size in 15-minute ATRs

| | Trades | Mean R | Winners |
|---|---|---|---|
| 1.6× ATR or more | 2 | +1.554 | 100% |

## How trades ended

- Full stop-outs (−0.85R or worse): 0%
- Scratches (within ±0.15R, mostly breakeven exits): 0%
- Wins of 1R or more: 100% · average win +1.554R · average loss —R
- Losers that first went 1R or more in your favour: —

## How far trades went

- Share of trades that were at some point this far in profit: +0.5R 100% · +1R 100% · +1.5R 100% · +2R 0% · +3R 0%
- Winners closed at +1.554R on average; at their best they were +1.926R up (median +1.932R)
- Losers that never got more than +0.3R in profit: —
- Targets (median): TP1 +1.000R, final target +2.000R · final target within 1.5R on 0% of trades · reached on 0%

## By final target distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| 2–3R | 2 | +1.554 | 100% |

## By holding time

| | Trades | Mean R | Winners |
|---|---|---|---|
| 1–3h | 2 | +1.554 | 100% |

## Entries refused (cycles)

- costs #% of the stop: 3
- the stop beyond the raid: 1

Settings: {"market":"ger","symbol":"GER40Cash#","cycleMin":3,"spreadMult":1,"slippage":0,"balance":90000,"currency":"ZAR","rate":18,"spreadTable":false,"env":{"V1_STRATEGY":"ict2022","V1_MAX_LOTS":"0.02"}}
