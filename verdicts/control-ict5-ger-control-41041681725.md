# Replay verdict — control-ict5-ger (control) · GER40Cash#

**PASS** · 2019-01-01 → 2024-01-01 · synthetic control data

| | |
|---|---|
| Trades | 123 (62 a year) |
| Mean R after costs | -0.116 (95% range -0.291 to +0.058), t = -1.31 |
| Winners | 45.5% · profit factor 0.78 |
| Cost | median 7.0% of the stop · mean R with costs × 1.5: -0.152 |
| Random entries (same exits, 1000 runs) | mean -0.051 · bot -0.117 · bot beats 22.0% |
| Exit-model check | correlation with the replayed trades 1.00 (should be > 0.8) |

## Rules

- ✅ C1: no "edge" on random data (t < 2)
- ✅ C2: random-entry percentile not extreme (5–95)

## By year

| Year | Trades | Mean R | t |
|---|---|---|---|
| 2019 | 69 | -0.373 | -3.47 |
| 2023 | 54 | +0.212 | 1.53 |

## By score

| Score | Trades | Mean R |
|---|---|---|
| 0 | 123 | -0.116 |

## By session

| | Trades | Mean R | Winners |
|---|---|---|---|
| london | 60 | -0.198 | 43% |
| london_mid | 21 | +0.094 | 52% |
| ny | 24 | -0.194 | 42% |
| ny_open | 18 | +0.014 | 50% |

## By direction

| | Trades | Mean R | Winners |
|---|---|---|---|
| buy | 58 | -0.068 | 47% |
| sell | 65 | -0.159 | 45% |

## By trade type

| | Trades | Mean R | Winners |
|---|---|---|---|
| normal | 123 | -0.116 | 46% |

Median stop: normal $32.82 · sniper — · all $32.82

## By trading cost

| | Trades | Mean R | Winners |
|---|---|---|---|
| cost under 4% of the stop | 3 | -0.409 | 33% |
| 4–6% | 32 | +0.072 | 53% |
| 6–8% | 47 | -0.049 | 49% |
| 8% or more | 41 | -0.319 | 37% |

## By stop distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| $8 or more | 123 | -0.116 | 46% |

## By stop size in 15-minute ATRs

| | Trades | Mean R | Winners |
|---|---|---|---|
| stop under 0.8× ATR | 2 | -0.186 | 50% |
| 0.8–1.2× ATR | 34 | -0.285 | 38% |
| 1.2–1.6× ATR | 40 | -0.130 | 45% |
| 1.6× ATR or more | 47 | +0.020 | 51% |

## How trades ended

- Full stop-outs (−0.85R or worse): 52%
- Scratches (within ±0.15R, mostly breakeven exits): 1%
- Wins of 1R or more: 15% · average win +0.911R · average loss -0.974R
- Losers that first went 1R or more in your favour: 0% of losers

## How far trades went

- Share of trades that were at some point this far in profit: +0.5R 56% · +1R 38% · +1.5R 20% · +2R 0% · +3R 0%
- Winners closed at +0.911R on average; at their best they were +1.417R up (median +1.457R)
- Losers that never got more than +0.3R in profit: 57%
- Targets (median): TP1 +1.000R, final target +2.000R · final target within 1.5R on 0% of trades · reached on 1%

## By final target distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| 1.25–2R | 58 | -0.056 | 50% |
| 2–3R | 65 | -0.170 | 42% |

## By holding time

| | Trades | Mean R | Winners |
|---|---|---|---|
| held under 1h | 52 | -0.471 | 27% |
| 1–3h | 53 | +0.153 | 62% |
| 3–7.5h | 18 | +0.114 | 50% |

## Entries refused (cycles)

- costs #% of the stop: 97
- price already went through the fair value gap: 8
- the stop beyond the raid: 2

Settings: {"market":"ger","symbol":"GER40Cash#","cycleMin":3,"spreadMult":1,"slippage":0,"balance":90000,"currency":"ZAR","rate":18,"spreadTable":false,"env":{"V1_STRATEGY":"ict2022","V1_ICT_TF":"5m","V1_MAX_LOTS":"0.02"}}
