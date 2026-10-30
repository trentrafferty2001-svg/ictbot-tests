# Replay verdict — sweep-mss (screen) · XAUUSD

**SCREEN FAIL** · 2020-01-01 → 2025-01-01 · real XAUUSD M1 prices

| | |
|---|---|
| Trades | 2374 (475 a year) |
| Mean R after costs | -0.061 (95% range -0.106 to -0.017), t = -2.73 |
| Winners | 47.5% · profit factor 0.88 |
| Cost | median 8.1% of the stop · mean R with costs × 1.5: -0.100 |
| Random entries (same exits, 1000 runs) | mean -0.064 · bot -0.056 · bot beats 65.1% |
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
| 2020 | 593 | -0.086 | -1.99 |
| 2021 | 339 | -0.005 | -0.08 |
| 2022 | 371 | -0.047 | -0.82 |
| 2023 | 278 | -0.004 | -0.06 |
| 2024 | 793 | -0.094 | -2.45 |

## By score

| Score | Trades | Mean R |
|---|---|---|
| 0 | 1356 | -0.071 |
| 1 | 11 | +0.160 |
| 2 | 27 | +0.096 |
| 3 | 99 | -0.086 |
| 4 | 108 | +0.109 |
| 5 | 156 | -0.042 |
| 6 | 259 | -0.076 |
| 7 | 159 | -0.137 |
| 8 | 67 | -0.238 |
| 9 | 49 | +0.250 |
| 10 | 32 | +0.105 |
| 11 | 35 | +0.024 |
| 12 | 16 | -0.612 |

## Same trades with the lot cap at 0.02

Half of each trade closes at TP1 instead of a fifth. Mean -0.063R (t = -2.90) vs -0.061R as replayed · winners 47.6% · average win +0.950R · average loss -0.981R · mean with costs × 1.5 -0.101R

Re-weighted 2273 trades (2273 exact, 0 estimated from how far they went); 101 were already at 0.02 lots or less.
Check of the estimate on 2131 exact trades: mean -0.060R estimated vs -0.038R exact.

## By session

| | Trades | Mean R | Winners |
|---|---|---|---|
| asian_mid | 28 | +0.018 | 50% |
| london | 269 | -0.137 | 44% |
| london_mid | 474 | -0.087 | 45% |
| ny | 861 | -0.032 | 50% |
| ny_close | 49 | -0.086 | 45% |
| ny_open | 462 | -0.099 | 45% |
| pre_london | 101 | -0.010 | 50% |
| sydney | 16 | +0.459 | 56% |
| tokyo | 114 | +0.025 | 52% |

## By direction

| | Trades | Mean R | Winners |
|---|---|---|---|
| buy | 1127 | -0.064 | 49% |
| sell | 1247 | -0.060 | 46% |

## By trade type

| | Trades | Mean R | Winners |
|---|---|---|---|
| normal | 1390 | -0.059 | 50% |
| sniper | 984 | -0.065 | 44% |

Median stop: normal $3.56 · sniper $4.41 · all $3.88

## By daily trend at entry

| | Trades | Mean R | Winners |
|---|---|---|---|
| with the daily trend | 608 | -0.095 | 47% |
| daily trend neutral | 1090 | -0.008 | 49% |
| against the daily trend | 676 | -0.117 | 46% |

## By trading cost

| | Trades | Mean R | Winners |
|---|---|---|---|
| cost under 4% of the stop | 95 | +0.134 | 56% |
| 4–6% | 313 | -0.009 | 51% |
| 6–8% | 712 | -0.042 | 47% |
| 8% or more | 1254 | -0.101 | 46% |

## By stop distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| stop under $3 | 52 | -0.001 | 46% |
| $3–5 | 1851 | -0.081 | 47% |
| $5–8 | 384 | +0.004 | 52% |
| $8 or more | 87 | +0.031 | 48% |

## By stop size in 15-minute ATRs

| | Trades | Mean R | Winners |
|---|---|---|---|
| stop under 0.8× ATR | 468 | -0.013 | 48% |
| 0.8–1.2× ATR | 950 | -0.114 | 48% |
| 1.2–1.6× ATR | 542 | -0.061 | 46% |
| 1.6× ATR or more | 414 | +0.004 | 49% |

## How trades ended

- Full stop-outs (−0.85R or worse): 50%
- Scratches (within ±0.15R, mostly breakeven exits): 2%
- Wins of 1R or more: 21% · average win +0.954R · average loss -0.979R
- Losers that first went 1R or more in your favour: 3% of losers

## How far trades went

- Share of trades that were at some point this far in profit: +0.5R 52% · +1R 31% · +1.5R 11% · +2R 4% · +3R 1%
- Winners closed at +0.962R on average; at their best they were +1.195R up (median +1.112R)
- Losers that never got more than +0.3R in profit: 73%
- Targets (median): TP1 +0.944R, final target +1.878R · final target within 1.5R on 12% of trades · reached on 1%

## By final target distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| final target under 1.25R | 83 | +0.063 | 58% |
| 1.25–2R | 1206 | -0.048 | 50% |
| 2–3R | 741 | -0.092 | 46% |
| 3R or more | 344 | -0.073 | 40% |

## By holding time

| | Trades | Mean R | Winners |
|---|---|---|---|
| held under 1h | 1703 | -0.146 | 44% |
| 1–3h | 457 | +0.075 | 52% |
| 3–7.5h | 196 | +0.272 | 63% |
| 7.5h or more (time limit) | 18 | +0.836 | 78% |

## Signal study: do the entries point the right way?

Price move in the trade's direction after entry, in R, before costs and ignoring stops and exits. "Edge" is that move less the same move at the same time on nearby days. t is from daily totals.

| After | Trades | Move | Edge | t (daily) |
|---|---|---|---|---|
| 15 min | 2374 | -0.016 | -0.007 | -0.32 |
| 30 min | 2374 | -0.017 | -0.004 | -0.10 |
| 60 min | 2374 | +0.006 | +0.021 | 0.37 |
| 120 min | 2374 | -0.021 | +0.017 | 0.21 |

❌ S1: edge after 60 min (+0.021R) is bigger than the median cost (+0.081R) with t ≥ 2 (0.37). Not shown that the entries point the right way by more than they cost (it needs both), so changing the exits is unlikely to make them pay; change or simplify the entry.

Mean R with t from daily totals instead of single trades (overlapping trades aren't independent): t = -2.54 (the rules use the single-trade t above).

## Entries refused (cycles)

- costs #% of the stop: 63567
- data check: 1844
- daily stop: 1057
- within # min of XM's daily break: 834
- first hour after the weekly open: 613
- news: 219

Settings: {"market":"gold","symbol":"XAUUSD","cycleMin":3,"spreadMult":1,"slippage":0,"balance":90000,"currency":"ZAR","rate":18,"spreadTable":false,"env":{"V1_ENTRY":"sweep_mss"}}
