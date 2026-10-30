# Replay verdict — v1-signal-study-readout (screen)

**SCREEN FAIL** · 2020-01-01 → 2025-01-01 · real XAUUSD M1 prices

| | |
|---|---|
| Trades | 1554 (311 a year) |
| Mean R after costs | -0.046 (95% range -0.099 to +0.008), t = -1.66 |
| Winners | 46.3% · profit factor 0.91 |
| Cost | median 8.0% of the stop · mean R with costs × 1.5: -0.083 |
| Random entries (same exits, 1000 runs) | mean -0.077 · bot -0.050 · bot beats 81.0% |
| Exit-model check | correlation with the replayed trades 0.99 (should be > 0.8) |

## Rules

- ✅ D1: at least 500 trades
- ❌ D2: mean R > 0 after costs with t ≥ 3
- ❌ D3: beats ≥ 95% of random-entry runs (same exits)
- ❌ D4: positive in ≥ 2/3 of years (years with ≥ 30 trades)
- ❌ D5: still positive with costs × 1.5
- ✅ D6: higher scores do better (top third > bottom third)

## By year

| Year | Trades | Mean R | t |
|---|---|---|---|
| 2020 | 415 | -0.079 | -1.52 |
| 2021 | 241 | -0.015 | -0.22 |
| 2022 | 275 | -0.032 | -0.50 |
| 2023 | 170 | -0.125 | -1.48 |
| 2024 | 453 | -0.009 | -0.18 |

## By score

| Score | Trades | Mean R |
|---|---|---|
| 4 | 19 | -0.041 |
| 5 | 18 | -0.231 |
| 6 | 452 | -0.094 |
| 7 | 324 | +0.019 |
| 8 | 254 | -0.003 |
| 9 | 293 | -0.016 |
| 10 | 121 | -0.138 |
| 11 | 57 | +0.045 |
| 12 | 16 | -0.637 |

## Same trades with the lot cap at 0.02

Half of each trade closes at TP1 instead of a fifth. Mean -0.048R (t = -1.82) vs -0.046R as replayed · winners 46.4% · average win +0.981R · average loss -0.938R · mean with costs × 1.5 -0.086R

Re-weighted 1486 trades (1486 exact, 0 estimated from how far they went); 68 were already at 0.02 lots or less.
Check of the estimate on 1440 exact trades: mean -0.045R estimated vs -0.025R exact.

## By session

| | Trades | Mean R | Winners |
|---|---|---|---|
| asian_mid | 4 | +1.360 | 75% |
| london | 242 | -0.146 | 42% |
| london_mid | 248 | -0.071 | 47% |
| ny | 557 | -0.081 | 46% |
| ny_close | 31 | -0.152 | 35% |
| ny_open | 288 | +0.088 | 50% |
| pre_london | 81 | +0.102 | 49% |
| sydney | 20 | -0.172 | 40% |
| tokyo | 83 | -0.044 | 48% |

## By direction

| | Trades | Mean R | Winners |
|---|---|---|---|
| buy | 831 | -0.028 | 47% |
| sell | 723 | -0.066 | 45% |

## By trade type

| | Trades | Mean R | Winners |
|---|---|---|---|
| normal | 602 | -0.013 | 51% |
| sniper | 952 | -0.066 | 43% |

Median stop: normal $3.60 · sniper $4.39 · all $4.01

## By daily trend at entry

| | Trades | Mean R | Winners |
|---|---|---|---|
| with the daily trend | 683 | -0.042 | 47% |
| daily trend neutral | 659 | -0.039 | 46% |
| against the daily trend | 212 | -0.078 | 46% |

## By trading cost

| | Trades | Mean R | Winners |
|---|---|---|---|
| cost under 4% of the stop | 65 | -0.203 | 37% |
| 4–6% | 271 | -0.033 | 47% |
| 6–8% | 450 | -0.019 | 47% |
| 8% or more | 768 | -0.052 | 47% |

## By stop distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| stop under $3 | 23 | -0.069 | 43% |
| $3–5 | 1153 | -0.037 | 47% |
| $5–8 | 310 | -0.059 | 45% |
| $8 or more | 68 | -0.120 | 43% |

## By stop size in 15-minute ATRs

| | Trades | Mean R | Winners |
|---|---|---|---|
| stop under 0.8× ATR | 293 | +0.003 | 49% |
| 0.8–1.2× ATR | 489 | -0.077 | 46% |
| 1.2–1.6× ATR | 442 | -0.043 | 46% |
| 1.6× ATR or more | 330 | -0.045 | 44% |

## How trades ended

- Full stop-outs (−0.85R or worse): 49%
- Scratches (within ±0.15R, mostly breakeven exits): 2%
- Wins of 1R or more: 23% · average win +0.987R · average loss -0.937R
- Losers that first went 1R or more in your favour: 3% of losers

## How far trades went

- Share of trades that were at some point this far in profit: +0.5R 54% · +1R 32% · +1.5R 10% · +2R 3% · +3R 0%
- Winners closed at +0.994R on average; at their best they were +1.197R up (median +1.154R)
- Losers that never got more than +0.3R in profit: 67%
- Targets (median): TP1 +1.110R, final target +1.668R · final target within 1.5R on 16% of trades · reached on 1%

## By final target distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| final target under 1.25R | 72 | +0.049 | 53% |
| 1.25–2R | 925 | -0.050 | 47% |
| 2–3R | 440 | +0.002 | 48% |
| 3R or more | 117 | -0.251 | 31% |

## By holding time

| | Trades | Mean R | Winners |
|---|---|---|---|
| held under 1h | 918 | -0.138 | 43% |
| 1–3h | 439 | -0.005 | 49% |
| 3–7.5h | 190 | +0.285 | 56% |
| 7.5h or more (time limit) | 7 | +0.590 | 86% |

## Signal study: do the entries point the right way?

Price move in the trade's direction after entry, in R, before costs and ignoring stops and exits. "Edge" is that move less the same move at the same time on nearby days. t is from daily totals.

| After | Trades | Move | Edge | t (daily) |
|---|---|---|---|---|
| 15 min | 1554 | +0.022 | +0.024 | 1.04 |
| 30 min | 1554 | +0.069 | +0.066 | 1.85 |
| 60 min | 1554 | +0.134 | +0.091 | 1.63 |
| 120 min | 1554 | +0.094 | -0.010 | -0.13 |

❌ S1: edge after 60 min (+0.091R) is bigger than the median cost (+0.080R) with t ≥ 2 (1.63). Not shown that the entries point the right way by more than they cost (it needs both), so changing the exits is unlikely to make them pay; change or simplify the entry.

Mean R with t from daily totals instead of single trades (overlapping trades aren't independent): t = -1.58 (the rules use the single-trade t above).

## Entries refused (cycles)

- costs #% of the stop: 17646
- data check: 951
- within # min of XM's daily break: 334
- daily stop: 211
- first hour after the weekly open: 176
- last hour before the weekend close: 73

Settings: {"cycleMin":3,"spreadMult":1,"slippage":0,"balance":90000,"currency":"ZAR","rate":18,"spreadTable":false,"env":{}}
