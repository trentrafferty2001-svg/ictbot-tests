# Replay verdict — vol-floor (screen) · XAUUSD

**SCREEN FAIL** · 2020-01-01 → 2025-01-01 · real XAUUSD M1 prices

| | |
|---|---|
| Trades | 1123 (225 a year) |
| Mean R after costs | -0.067 (95% range -0.131 to -0.003), t = -2.07 |
| Winners | 45.3% · profit factor 0.87 |
| Cost | median 7.9% of the stop · mean R with costs × 1.5: -0.105 |
| Random entries (same exits, 1000 runs) | mean -0.070 · bot -0.072 · bot beats 46.3% |
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
| 2020 | 329 | -0.078 | -1.32 |
| 2021 | 150 | -0.045 | -0.52 |
| 2022 | 194 | -0.039 | -0.51 |
| 2023 | 129 | -0.211 | -2.19 |
| 2024 | 321 | -0.026 | -0.41 |

## By score

| Score | Trades | Mean R |
|---|---|---|
| 4 | 15 | -0.164 |
| 5 | 10 | -0.246 |
| 6 | 317 | -0.092 |
| 7 | 216 | -0.041 |
| 8 | 163 | +0.012 |
| 9 | 241 | -0.037 |
| 10 | 101 | -0.166 |
| 11 | 46 | -0.020 |
| 12 | 14 | -0.581 |

## Same trades with the lot cap at 0.02

Half of each trade closes at TP1 instead of a fifth. Mean -0.070R (t = -2.24) vs -0.067R as replayed · winners 45.3% · average win +0.998R · average loss -0.956R · mean with costs × 1.5 -0.108R

Re-weighted 1064 trades (1064 exact, 0 estimated from how far they went); 59 were already at 0.02 lots or less.
Check of the estimate on 1036 exact trades: mean -0.066R estimated vs -0.049R exact.

## By session

| | Trades | Mean R | Winners |
|---|---|---|---|
| asian_mid | 3 | +2.146 | 100% |
| london | 183 | -0.230 | 37% |
| london_mid | 180 | -0.068 | 47% |
| ny | 380 | -0.082 | 47% |
| ny_close | 25 | -0.250 | 32% |
| ny_open | 197 | +0.078 | 50% |
| pre_london | 65 | +0.104 | 48% |
| sydney | 15 | -0.196 | 40% |
| tokyo | 75 | -0.122 | 44% |

## By direction

| | Trades | Mean R | Winners |
|---|---|---|---|
| buy | 595 | -0.053 | 46% |
| sell | 528 | -0.084 | 45% |

## By trade type

| | Trades | Mean R | Winners |
|---|---|---|---|
| normal | 428 | -0.062 | 49% |
| sniper | 695 | -0.070 | 43% |

Median stop: normal $3.61 · sniper $4.42 · all $4.04

## By daily trend at entry

| | Trades | Mean R | Winners |
|---|---|---|---|
| with the daily trend | 493 | -0.041 | 47% |
| daily trend neutral | 487 | -0.086 | 44% |
| against the daily trend | 143 | -0.096 | 44% |

## By trading cost

| | Trades | Mean R | Winners |
|---|---|---|---|
| cost under 4% of the stop | 55 | -0.200 | 38% |
| 4–6% | 206 | -0.070 | 47% |
| 6–8% | 332 | +0.027 | 49% |
| 8% or more | 530 | -0.111 | 43% |

## By stop distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| stop under $3 | 16 | +0.053 | 44% |
| $3–5 | 809 | -0.063 | 45% |
| $5–8 | 239 | -0.066 | 46% |
| $8 or more | 59 | -0.162 | 44% |

## By stop size in 15-minute ATRs

| | Trades | Mean R | Winners |
|---|---|---|---|
| stop under 0.8× ATR | 213 | -0.059 | 48% |
| 0.8–1.2× ATR | 359 | -0.121 | 44% |
| 1.2–1.6× ATR | 311 | -0.083 | 44% |
| 1.6× ATR or more | 240 | +0.026 | 48% |

## How trades ended

- Full stop-outs (−0.85R or worse): 51%
- Scratches (within ±0.15R, mostly breakeven exits): 2%
- Wins of 1R or more: 23% · average win +1.004R · average loss -0.956R
- Losers that first went 1R or more in your favour: 4% of losers

## How far trades went

- Share of trades that were at some point this far in profit: +0.5R 54% · +1R 31% · +1.5R 10% · +2R 3% · +3R 0%
- Winners closed at +1.009R on average; at their best they were +1.195R up (median +1.142R)
- Losers that never got more than +0.3R in profit: 65%
- Targets (median): TP1 +1.110R, final target +1.668R · final target within 1.5R on 16% of trades · reached on 1%

## By final target distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| final target under 1.25R | 49 | +0.140 | 59% |
| 1.25–2R | 681 | -0.080 | 46% |
| 2–3R | 306 | -0.023 | 46% |
| 3R or more | 87 | -0.241 | 31% |

## By holding time

| | Trades | Mean R | Winners |
|---|---|---|---|
| held under 1h | 655 | -0.165 | 41% |
| 1–3h | 332 | -0.020 | 48% |
| 3–7.5h | 131 | +0.273 | 55% |
| 7.5h or more (time limit) | 5 | +0.608 | 100% |

## Signal study: do the entries point the right way?

Price move in the trade's direction after entry, in R, before costs and ignoring stops and exits. "Edge" is that move less the same move at the same time on nearby days. t is from daily totals.

| After | Trades | Move | Edge | t (daily) |
|---|---|---|---|---|
| 15 min | 1123 | +0.012 | +0.019 | 0.76 |
| 30 min | 1123 | +0.058 | +0.056 | 1.47 |
| 60 min | 1123 | +0.135 | +0.093 | 1.48 |
| 120 min | 1123 | +0.096 | -0.015 | -0.17 |

❌ S1: edge after 60 min (+0.093R) is bigger than the median cost (+0.079R) with t ≥ 2 (1.48). Not shown that the entries point the right way by more than they cost (it needs both), so changing the exits is unlikely to make them pay; change or simplify the entry.

Mean R with t from daily totals instead of single trades (overlapping trades aren't independent): t = -1.98 (the rules use the single-trade t above).

## Entries refused (cycles)

- costs #% of the stop: 11775
- quiet market: 9057
- data check: 1093
- within # min of XM's daily break: 335
- first hour after the weekly open: 176
- daily stop: 170

Settings: {"market":"gold","symbol":"XAUUSD","cycleMin":3,"spreadMult":1,"slippage":0,"balance":90000,"currency":"ZAR","rate":18,"spreadTable":false,"env":{"V1_VOL_FLOOR":"0.33"}}
