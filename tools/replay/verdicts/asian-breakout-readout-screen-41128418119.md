# Replay verdict — asian-breakout-readout (screen)

**TOO FEW TRADES** · 2020-01-01 → 2025-01-01 · real XAUUSD M1 prices

| | |
|---|---|
| Trades | 122 (24 a year) |
| Mean R after costs | -0.345 (95% range -0.532 to -0.158), t = -3.62 |
| Winners | 32.0% · profit factor 0.49 |
| Cost | median 7.8% of the stop · mean R with costs × 1.5: -0.382 |
| Random entries (same exits, 1000 runs) | mean -0.045 · bot -0.352 · bot beats 0.1% |
| Exit-model check | correlation with the replayed trades 1.00 (should be > 0.8) |

## Rules

- ❌ D1: at least 500 trades
- ❌ D2: mean R > 0 after costs with t ≥ 3
- ❌ D3: beats ≥ 95% of random-entry runs (same exits)
- ❌ D4: positive in ≥ 2/3 of years (years with ≥ 30 trades)
- ❌ D5: still positive with costs × 1.5
- ❌ D6: higher scores do better (top third > bottom third)

## By year

| Year | Trades | Mean R | t |
|---|---|---|---|
| 2020 | 37 | -0.418 | -2.61 |
| 2021 | 17 | -0.256 | -0.80 |
| 2022 | 26 | -0.173 | -0.73 |
| 2023 | 15 | -0.814 | -5.91 |
| 2024 | 27 | -0.207 | -1.05 |

## By score

| Score | Trades | Mean R |
|---|---|---|
| 0 | 83 | -0.338 |
| 1 | 2 | -1.000 |
| 2 | 1 | +0.668 |
| 3 | 2 | +1.139 |
| 4 | 1 | -1.001 |
| 5 | 4 | -0.592 |
| 6 | 13 | -0.659 |
| 7 | 5 | -0.749 |
| 8 | 5 | -0.010 |
| 9 | 4 | +0.156 |
| 10 | 1 | -1.001 |
| 11 | 1 | +1.112 |

## Same trades with the lot cap at 0.02

Half of each trade closes at TP1 instead of a fifth. Mean -0.342R (t = -3.71) vs -0.345R as replayed · winners 32.0% · average win +1.064R · average loss -1.002R · mean with costs × 1.5 -0.378R

Re-weighted 114 trades (114 exact, 0 estimated from how far they went); 8 were already at 0.02 lots or less.
Check of the estimate on 112 exact trades: mean -0.359R estimated vs -0.346R exact.

## By session

| | Trades | Mean R | Winners |
|---|---|---|---|
| london | 117 | -0.336 | 32% |
| london_mid | 5 | -0.560 | 20% |

## By direction

| | Trades | Mean R | Winners |
|---|---|---|---|
| buy | 53 | -0.221 | 36% |
| sell | 69 | -0.440 | 29% |

## By trade type

| | Trades | Mean R | Winners |
|---|---|---|---|
| normal | 33 | -0.454 | 30% |
| sniper | 89 | -0.305 | 33% |

Median stop: normal $3.51 · sniper $3.91 · all $3.88

## By daily trend at entry

| | Trades | Mean R | Winners |
|---|---|---|---|
| with the daily trend | 41 | -0.192 | 41% |
| daily trend neutral | 60 | -0.346 | 32% |
| against the daily trend | 21 | -0.639 | 14% |

## By trading cost

| | Trades | Mean R | Winners |
|---|---|---|---|
| cost under 4% of the stop | 12 | -0.054 | 42% |
| 4–6% | 17 | -0.337 | 41% |
| 6–8% | 36 | -0.512 | 25% |
| 8% or more | 57 | -0.303 | 32% |

## By stop distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| stop under $3 | 1 | -1.000 | 0% |
| $3–5 | 94 | -0.362 | 30% |
| $5–8 | 18 | -0.283 | 44% |
| $8 or more | 9 | -0.216 | 33% |

## By stop size in 15-minute ATRs

| | Trades | Mean R | Winners |
|---|---|---|---|
| stop under 0.8× ATR | 13 | -0.557 | 31% |
| 0.8–1.2× ATR | 32 | -0.315 | 28% |
| 1.2–1.6× ATR | 41 | -0.333 | 32% |
| 1.6× ATR or more | 36 | -0.309 | 36% |

## How trades ended

- Full stop-outs (−0.85R or worse): 68%
- Scratches (within ±0.15R, mostly breakeven exits): 0%
- Wins of 1R or more: 15% · average win +1.053R · average loss -1.002R
- Losers that first went 1R or more in your favour: 7% of losers

## How far trades went

- Share of trades that were at some point this far in profit: +0.5R 50% · +1R 26% · +1.5R 11% · +2R 3% · +3R 2%
- Winners closed at +1.053R on average; at their best they were +1.235R up (median +1.203R)
- Losers that never got more than +0.3R in profit: 65%
- Targets (median): TP1 +1.111R, final target +1.667R · final target within 1.5R on 17% of trades · reached on 1%

## By final target distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| final target under 1.25R | 3 | +0.525 | 100% |
| 1.25–2R | 75 | -0.349 | 33% |
| 2–3R | 24 | -0.358 | 29% |
| 3R or more | 20 | -0.443 | 20% |

## By holding time

| | Trades | Mean R | Winners |
|---|---|---|---|
| held under 1h | 54 | -0.566 | 22% |
| 1–3h | 48 | -0.259 | 35% |
| 3–7.5h | 20 | +0.044 | 50% |

## Signal study: do the entries point the right way?

Price move in the trade's direction after entry, in R, before costs and ignoring stops and exits. "Edge" is that move less the same move at the same time on nearby days. t is from daily totals.

| After | Trades | Move | Edge | t (daily) |
|---|---|---|---|---|
| 15 min | 122 | -0.076 | -0.095 | -1.42 |
| 30 min | 122 | -0.039 | -0.048 | -0.57 |
| 60 min | 122 | -0.059 | -0.068 | -0.57 |
| 120 min | 122 | -0.032 | -0.066 | -0.46 |

❌ S1: edge after 60 min (-0.068R) is bigger than the median cost (+0.078R) with t ≥ 2 (-0.57). Not shown that the entries point the right way by more than they cost (it needs both), so changing the exits is unlikely to make them pay; change or simplify the entry.

Mean R with t from daily totals instead of single trades (overlapping trades aren't independent): t = -3.44 (the rules use the single-trade t above).

## Entries refused (cycles)

- costs #% of the stop: 979

Settings: {"cycleMin":3,"spreadMult":1,"slippage":0,"balance":90000,"currency":"ZAR","rate":18,"spreadTable":false,"env":{"V1_ENTRY":"asian_breakout"}}
