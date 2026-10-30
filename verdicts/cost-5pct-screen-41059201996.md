# Replay verdict — cost-5pct (screen) · XAUUSD

**TOO FEW TRADES** · 2020-01-01 → 2025-01-01 · real XAUUSD M1 prices

| | |
|---|---|
| Trades | 269 (54 a year) |
| Mean R after costs | -0.062 (95% range -0.176 to +0.052), t = -1.07 |
| Winners | 48.0% · profit factor 0.86 |
| Cost | median 4.4% of the stop · mean R with costs × 1.5: -0.083 |
| Random entries (same exits, 1000 runs) | mean -0.054 · bot -0.070 · bot beats 39.0% |
| Exit-model check | correlation with the replayed trades 0.99 (should be > 0.8) |

## Rules

- ❌ D1: at least 500 trades
- ❌ D2: mean R > 0 after costs with t ≥ 3
- ❌ D3: beats ≥ 95% of random-entry runs (same exits)
- ❌ D4: positive in ≥ 2/3 of years (years with ≥ 30 trades)
- ❌ D5: still positive with costs × 1.5
- ✅ D6: higher scores do better (top third > bottom third)

## By year

| Year | Trades | Mean R | t |
|---|---|---|---|
| 2020 | 89 | +0.119 | 1.17 |
| 2021 | 33 | -0.030 | -0.19 |
| 2022 | 38 | -0.082 | -0.55 |
| 2023 | 22 | -0.273 | -1.43 |
| 2024 | 87 | -0.197 | -1.86 |

## By score

| Score | Trades | Mean R |
|---|---|---|
| 5 | 2 | -0.220 |
| 6 | 59 | -0.208 |
| 7 | 61 | -0.026 |
| 8 | 41 | -0.154 |
| 9 | 69 | +0.125 |
| 10 | 21 | -0.131 |
| 11 | 14 | -0.202 |
| 12 | 2 | +0.451 |

## Same trades with the lot cap at 0.02

Half of each trade closes at TP1 instead of a fifth. Mean -0.059R (t = -1.02) vs -0.062R as replayed · winners 48.0% · average win +0.829R · average loss -0.876R · mean with costs × 1.5 -0.080R

Re-weighted 198 trades (198 exact, 0 estimated from how far they went); 71 were already at 0.02 lots or less.
Check of the estimate on 197 exact trades: mean -0.010R estimated vs -0.001R exact.

## By session

| | Trades | Mean R | Winners |
|---|---|---|---|
| london | 30 | -0.142 | 43% |
| london_mid | 42 | -0.182 | 45% |
| ny | 126 | -0.002 | 50% |
| ny_close | 5 | +0.047 | 40% |
| ny_open | 48 | +0.006 | 50% |
| pre_london | 8 | +0.018 | 63% |
| sydney | 4 | -0.620 | 25% |
| tokyo | 6 | -0.458 | 33% |

## By direction

| | Trades | Mean R | Winners |
|---|---|---|---|
| buy | 129 | -0.061 | 51% |
| sell | 140 | -0.063 | 45% |

## By trade type

| | Trades | Mean R | Winners |
|---|---|---|---|
| normal | 31 | +0.365 | 74% |
| sniper | 238 | -0.118 | 45% |

Median stop: normal $7.21 · sniper $6.99 · all $6.99

## By daily trend at entry

| | Trades | Mean R | Winners |
|---|---|---|---|
| with the daily trend | 129 | +0.000 | 50% |
| daily trend neutral | 108 | -0.042 | 51% |
| against the daily trend | 32 | -0.380 | 31% |

## By trading cost

| | Trades | Mean R | Winners |
|---|---|---|---|
| cost under 4% of the stop | 80 | -0.185 | 39% |
| 4–6% | 189 | -0.010 | 52% |

## By stop distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| $5–8 | 183 | -0.025 | 50% |
| $8 or more | 86 | -0.141 | 44% |

## By stop size in 15-minute ATRs

| | Trades | Mean R | Winners |
|---|---|---|---|
| stop under 0.8× ATR | 14 | +0.831 | 79% |
| 0.8–1.2× ATR | 38 | -0.046 | 58% |
| 1.2–1.6× ATR | 93 | -0.116 | 43% |
| 1.6× ATR or more | 124 | -0.128 | 45% |

## How trades ended

- Full stop-outs (−0.85R or worse): 42%
- Scratches (within ±0.15R, mostly breakeven exits): 7%
- Wins of 1R or more: 22% · average win +0.819R · average loss -0.874R
- Losers that first went 1R or more in your favour: 2% of losers

## How far trades went

- Share of trades that were at some point this far in profit: +0.5R 54% · +1R 26% · +1.5R 5% · +2R 0% · +3R 0%
- Winners closed at +0.827R on average; at their best they were +1.028R up (median +1.018R)
- Losers that never got more than +0.3R in profit: 61%
- Targets (median): TP1 +1.010R, final target +1.511R · final target within 1.5R on 42% of trades · reached on 1%

## By final target distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| final target under 1.25R | 54 | +0.013 | 54% |
| 1.25–2R | 181 | -0.107 | 47% |
| 2–3R | 29 | +0.038 | 45% |
| 3R or more | 5 | +0.169 | 40% |

## By holding time

| | Trades | Mean R | Winners |
|---|---|---|---|
| held under 1h | 105 | -0.035 | 50% |
| 1–3h | 85 | -0.231 | 44% |
| 3–7.5h | 79 | +0.083 | 51% |

## Signal study: do the entries point the right way?

Price move in the trade's direction after entry, in R, before costs and ignoring stops and exits. "Edge" is that move less the same move at the same time on nearby days. t is from daily totals.

| After | Trades | Move | Edge | t (daily) |
|---|---|---|---|---|
| 15 min | 269 | +0.038 | +0.032 | 0.88 |
| 30 min | 269 | +0.039 | +0.038 | 0.82 |
| 60 min | 269 | +0.083 | +0.051 | 0.85 |
| 120 min | 269 | +0.009 | -0.065 | -0.76 |

❌ S1: edge after 60 min (+0.051R) is bigger than the median cost (+0.044R) with t ≥ 2 (0.85). Not shown that the entries point the right way by more than they cost (it needs both), so changing the exits is unlikely to make them pay; change or simplify the entry.

Mean R with t from daily totals instead of single trades (overlapping trades aren't independent): t = -1.00 (the rules use the single-trade t above).

## Entries refused (cycles)

- costs #% of the stop: 26067
- data check: 1180
- within # min of XM's daily break: 335
- first hour after the weekly open: 176
- last hour before the weekend close: 109
- news: 46

Settings: {"market":"gold","symbol":"XAUUSD","cycleMin":3,"spreadMult":1,"slippage":0,"balance":90000,"currency":"ZAR","rate":18,"spreadTable":false,"env":{"COST_MAX_FRAC":"0.05"}}
