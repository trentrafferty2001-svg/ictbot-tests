# Replay verdict — silverbullet-ger (development) · GER40Cash#

**FAIL** · 2015-01-01 → 2025-01-01 · real XAUUSD M1 prices

| | |
|---|---|
| Trades | 508 (56 a year) |
| Mean R after costs | -0.066 (95% range -0.161 to +0.030), t = -1.35 |
| Winners | 45.3% · profit factor 0.88 |
| Cost | median 7.8% of the stop · mean R with costs × 1.5: -0.103 |
| Random entries (same exits, 0 runs) | mean — · bot — · bot beats —% |
| Exit-model check | correlation with the replayed trades 1.00 (should be > 0.8) |

## Rules

- ✅ I1: at least 300 trades
- ❌ I2: mean R > 0 after costs with t ≥ 3
- ❌ I3: beats ≥ 95% of random-entry runs (same exits)
- ❌ I4: positive in ≥ 2/3 of years (years with ≥ 15 trades)
- ❌ I5: still positive with costs × 1.5

## By year

| Year | Trades | Mean R | t |
|---|---|---|---|
| 2015 | 123 | -0.290 | -3.21 |
| 2016 | 83 | +0.079 | 0.63 |
| 2017 | 25 | -0.140 | -0.69 |
| 2018 | 76 | +0.079 | 0.58 |
| 2019 | 40 | -0.158 | -0.99 |
| 2020 | 68 | +0.158 | 1.05 |
| 2022 | 4 | -0.560 | -1.60 |
| 2023 | 4 | -0.672 | -2.05 |
| 2024 | 85 | -0.074 | -0.66 |

## By score

| Score | Trades | Mean R |
|---|---|---|
| 0 | 508 | -0.066 |

## By session

| | Trades | Mean R | Winners |
|---|---|---|---|
| london | 253 | -0.134 | 42% |
| ny | 254 | +0.006 | 48% |
| ny_close | 1 | -1.000 | 0% |

## By direction

| | Trades | Mean R | Winners |
|---|---|---|---|
| buy | 259 | -0.089 | 44% |
| sell | 249 | -0.042 | 46% |

## By trade type

| | Trades | Mean R | Winners |
|---|---|---|---|
| normal | 508 | -0.066 | 45% |

Median stop: normal $29.80 · sniper — · all $29.80

## By trading cost

| | Trades | Mean R | Winners |
|---|---|---|---|
| cost under 4% of the stop | 26 | +0.370 | 65% |
| 4–6% | 83 | -0.082 | 46% |
| 6–8% | 163 | -0.120 | 44% |
| 8% or more | 236 | -0.071 | 44% |

## By stop distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| $8 or more | 508 | -0.066 | 45% |

## By stop size in 15-minute ATRs

| | Trades | Mean R | Winners |
|---|---|---|---|
| stop under 0.8× ATR | 56 | -0.027 | 43% |
| 0.8–1.2× ATR | 199 | -0.071 | 44% |
| 1.2–1.6× ATR | 139 | -0.050 | 48% |
| 1.6× ATR or more | 114 | -0.095 | 45% |

## How trades ended

- Full stop-outs (−0.85R or worse): 53%
- Scratches (within ±0.15R, mostly breakeven exits): 1%
- Wins of 1R or more: 20% · average win +1.047R · average loss -0.987R
- Losers that first went 1R or more in your favour: 0% of losers

## How far trades went

- Share of trades that were at some point this far in profit: +0.5R 56% · +1R 38% · +1.5R 24% · +2R 12% · +3R 4%
- Winners closed at +1.047R on average; at their best they were +1.725R up (median +1.527R)
- Losers that never got more than +0.3R in profit: 70%
- Targets (median): TP1 +1.000R, final target +3.280R · final target within 1.5R on 0% of trades · reached on 0%

## By final target distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| 1.25–2R | 22 | +0.028 | 55% |
| 2–3R | 180 | -0.170 | 41% |
| 3R or more | 306 | -0.011 | 47% |

## By holding time

| | Trades | Mean R | Winners |
|---|---|---|---|
| held under 1h | 342 | -0.395 | 32% |
| 1–3h | 105 | +0.727 | 77% |
| 3–7.5h | 59 | +0.452 | 68% |
| 7.5h or more (time limit) | 2 | -0.587 | 0% |

## Entries refused (cycles)

- costs #% of the stop: 4065
- price already went through the fair value gap: 282
- Silver Bullet setup missed: 242
- the New York morning high is only #R away with the: 159
- the New York morning low is only #R away with the : 74
- the previous day high is only #R away with the spr: 68

Settings: {"market":"ger","symbol":"GER40Cash#","cycleMin":3,"spreadMult":1,"slippage":0,"balance":90000,"currency":"ZAR","rate":18,"spreadTable":false,"env":{"V1_STRATEGY":"silverbullet","V1_MAX_LOTS":"0.02"}}
