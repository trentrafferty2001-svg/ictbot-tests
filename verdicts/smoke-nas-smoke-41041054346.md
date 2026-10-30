# Replay verdict — smoke-nas (smoke) · US100Cash#

**SMOKE TEST OK — run "development" next** · 2024-03-01 → 2024-04-01 · real XAUUSD M1 prices

| | |
|---|---|
| Trades | 6 (6 a year) |
| Mean R after costs | -0.317 (95% range -1.164 to +0.531), t = -0.73 |
| Winners | 33.3% · profit factor 0.53 |
| Cost | median 5.0% of the stop · mean R with costs × 1.5: -0.340 |
| Random entries (same exits, 1000 runs) | mean -0.111 · bot -0.341 · bot beats 30.6% |
| Exit-model check | correlation with the replayed trades 1.00 (should be > 0.8) |

## Rules

- ❌ I1: at least 300 trades
- ❌ I2: mean R > 0 after costs with t ≥ 3
- ❌ I3: beats ≥ 95% of random-entry runs (same exits)
- ❌ I4: positive in ≥ 2/3 of years (years with ≥ 30 trades)
- ❌ I5: still positive with costs × 1.5

## By year

| Year | Trades | Mean R | t |
|---|---|---|---|
| 2024 | 6 | -0.317 | -0.73 |

## By score

| Score | Trades | Mean R |
|---|---|---|
| 0 | 6 | -0.317 |

## By session

| | Trades | Mean R | Winners |
|---|---|---|---|
| ny | 1 | +1.018 | 100% |
| ny_open | 5 | -0.583 | 20% |

## By direction

| | Trades | Mean R | Winners |
|---|---|---|---|
| buy | 3 | -1.000 | 0% |
| sell | 3 | +0.367 | 67% |

## By trade type

| | Trades | Mean R | Winners |
|---|---|---|---|
| normal | 6 | -0.317 | 33% |

Median stop: normal $60.12 · sniper — · all $60.12

## By trading cost

| | Trades | Mean R | Winners |
|---|---|---|---|
| cost under 4% of the stop | 2 | +0.009 | 50% |
| 4–6% | 3 | -0.306 | 33% |
| 6–8% | 1 | -1.000 | 0% |

## By stop distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| $8 or more | 6 | -0.317 | 33% |

## By stop size in 15-minute ATRs

| | Trades | Mean R | Winners |
|---|---|---|---|
| 1.6× ATR or more | 6 | -0.317 | 33% |

## How trades ended

- Full stop-outs (−0.85R or worse): 67%
- Scratches (within ±0.15R, mostly breakeven exits): 0%
- Wins of 1R or more: 33% · average win +1.050R · average loss -1.000R
- Losers that first went 1R or more in your favour: 0% of losers

## How far trades went

- Share of trades that were at some point this far in profit: +0.5R 33% · +1R 33% · +1.5R 17% · +2R 0% · +3R 0%
- Winners closed at +1.050R on average; at their best they were +1.496R up (median +1.584R)
- Losers that never got more than +0.3R in profit: 75%
- Targets (median): TP1 +1.000R, final target +2.000R · final target within 1.5R on 0% of trades · reached on 0%

## By final target distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| 1.25–2R | 3 | -1.000 | 0% |
| 2–3R | 3 | +0.367 | 67% |

## By holding time

| | Trades | Mean R | Winners |
|---|---|---|---|
| held under 1h | 2 | -1.000 | 0% |
| 1–3h | 2 | +0.009 | 50% |
| 3–7.5h | 2 | +0.041 | 50% |

## Entries refused (cycles)

- costs #% of the stop: 6
- the stop beyond the raid: 2

Settings: {"market":"nas","symbol":"US100Cash#","cycleMin":3,"spreadMult":1,"slippage":0,"balance":90000,"currency":"ZAR","rate":18,"spreadTable":false,"env":{"V1_STRATEGY":"ict2022","V1_MAX_LOTS":"0.02"}}
